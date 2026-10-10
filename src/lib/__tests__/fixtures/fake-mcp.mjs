// A stand-in for a Protobox workspace MCP endpoint: pages with revisions, in memory.
// Runs as its own process because the cloud client blocks the caller while it waits.
import { createServer } from 'http';

const pages = new Map(); // id → { id, title, folderId, content, latestRevisionN }
const folders = []; // { id, name, parentFolderId }
let seq = 0;
let requests = 0; // every HTTP request, the unit the real endpoint rate-limits (60 a minute)
const ok = data => ({ result: { success: true, data } });
const fail = error => ({ result: { success: false, error, code: 'EXECUTION_ERROR' } });

// "a/b" names folder b inside folder a and missing segments are created. As on the real endpoint,
// a segment whose name already exists anywhere in the workspace resolves to that folder.
function folderId(path) {
  let parent;
  for (const name of (path ?? '').split('/').filter(Boolean)) {
    let folder = folders.find(f => f.name === name);
    if (!folder) folders.push((folder = { id: `folder-${++seq}`, name, parentFolderId: parent }));
    parent = folder.id;
  }
  return parent;
}
const tree = parent => folders.filter(f => f.parentFolderId === parent).map(f => ({ ...f, children: tree(f.id) }));

function tool(name, a) {
  if (name === 'KNOWLEDGE_WRITE_PAGE') {
    const page = a.pageId ? pages.get(a.pageId) : [...pages.values()].find(p => p.title === a.title);
    if (a.pageId && !page) return fail('Knowledge entry not found');
    // The real endpoint trims trailing whitespace from what it stores.
    const content = String(a.content).trimEnd();
    if (!page) {
      const id = `page-${++seq}`;
      pages.set(id, { id, title: a.title, folderId: folderId(a.folder), content, latestRevisionN: 1 });
      // The real endpoint leaves `revision` out of the reply when it creates a longer page.
      return ok({ pageId: id, title: a.title, created: true, ...(content.length > 2000 ? {} : { revision: 1 }), folderId: pages.get(id).folderId });
    }
    if (a.expectedVersion !== undefined && a.expectedVersion !== page.latestRevisionN) {
      return fail(`[kb-service] VERSION_CONFLICT: the page is now at v${page.latestRevisionN}, not v${a.expectedVersion}`);
    }
    page.content = content;
    page.latestRevisionN += 1;
    if (a.folder) page.folderId = folderId(a.folder);
    return ok({ pageId: page.id, title: page.title, revision: page.latestRevisionN, folderId: page.folderId });
  }
  if (name === 'KNOWLEDGE_READ_PAGE') {
    const page = pages.get(a.pageId);
    return page ? ok({ id: page.id, title: page.title, folderId: page.folderId, latestRevisionN: page.latestRevisionN, content: page.content }) : fail('Knowledge entry not found');
  }
  if (name === 'KNOWLEDGE_LIST_PAGES') return ok({ folders: tree(undefined), pages: [...pages.values()].map(({ id, title, folderId, latestRevisionN }) => ({ id, title, folderId, latestRevisionN })) });
  if (name === 'FAKE_REQUEST_COUNT') return ok({ requests });
  if (name === 'KNOWLEDGE_SEARCH') return ok({ results: [...pages.values()].filter(p => `${p.title} ${p.content}`.includes(a.query)).slice(0, a.limit ?? 5).map(p => ({ id: p.id, title: p.title })) });
  return null;
}

const server = createServer((req, res) => {
  let raw = '';
  req.on('data', c => (raw += c));
  req.on('end', () => {
    if (req.headers.authorization !== 'Bearer test-key') return res.writeHead(401).end('unauthorized');
    requests++;
    const msg = JSON.parse(raw);
    let result;
    if (msg.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '0' } };
    else {
      const body = tool(msg.params.name, msg.params.arguments ?? {});
      result = body ? { content: [{ type: 'text', text: JSON.stringify(body) }] } : { isError: true, content: [{ type: 'text', text: `MCP error -32602: Tool ${msg.params.name} not found` }] };
    }
    // Answer as an SSE frame, the way the real endpoint does.
    res.writeHead(200, { 'content-type': 'text/event-stream' }).end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })}\n\n`);
  });
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
