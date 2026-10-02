import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DONE, findCard, inLane, readCards } from './cards.js';
import { advanceCard, rejectCard, resolveRole } from './engine.js';
import { approveFlow } from './flow.js';
import { buildInbox } from './inbox.js';
import { loadLane, substitute } from './lane.js';
import { resolveSpecDir, tickTask } from './spec.js';
import { capture, inject } from './wiki.js';

function card(projectDir: string, id: string) {
  const found = findCard(readCards(projectDir).cards, id);
  const stage = found.stage === DONE ? undefined : loadLane(projectDir, found.lane).stages.find(s => s.id === found.stage);
  return {
    ...found,
    brief: stage && {
      skill: stage.skill,
      output: stage.output && substitute(stage.output, found),
      done: stage.done?.cmd ? substitute(stage.done.cmd, found, { shell: true }) : stage.done?.event,
      notes: stage.notes ?? [],
      rejections: found.events.filter(e => e.action === 'reject' && e.stage === stage.id).map(e => e.note),
    },
  };
}

/** Same engine as the CLI. The role comes from CODELOOP_ROLE in the server's environment, never from a tool argument. */
export async function serveMcp(projectDir: string): Promise<void> {
  const server = new McpServer({ name: 'codeloop', version: '0.2.0' });
  const id = { id: z.string().describe('Card id, e.g. c-001') };

  const tool = <S extends z.ZodRawShape>(name: string, description: string, inputSchema: S, run: (args: z.infer<z.ZodObject<S>>) => unknown) =>
    server.registerTool(name, { description, inputSchema }, (async (args: z.infer<z.ZodObject<S>>) => {
      try {
        return { content: [{ type: 'text' as const, text: JSON.stringify(run(args), null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text' as const, text: `${(e as Error).name}: ${(e as Error).message}` }] };
      }
    }) as never);

  tool('inbox', 'Gates waiting on a person, what shipped, and numbers per lane.', {}, () => buildInbox(projectDir));
  tool('next_up', 'Cards an agent can work now: unfinished and not waiting at a gate, oldest first.', {}, () =>
    readCards(projectDir).cards.filter(c => inLane(c) && !c.gate).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(c => card(projectDir, c.id)));
  tool('get_card', 'A card with its current stage brief: skill, output path, done check, notes, earlier rejections.', id, a => card(projectDir, a.id));
  tool('advance', "Run the current stage's done check and move the card if it passes.", id, a => {
    const r = advanceCard(projectDir, a.id);
    return { outcome: r.outcome, stage: r.card.stage, gate: r.card.gate, awaiting: r.card.awaiting, output: r.output, started: r.started.map(s => s.id) };
  });
  tool('approve', 'Approve the gate a card is waiting at, then advance it once. Refused unless the server runs with CODELOOP_ROLE=owner or reviewer.', { ...id, note: z.string().optional() }, a => {
    const r = approveFlow(projectDir, a.id, resolveRole(), a.note);
    return { approved: r.gate, stage: (r.advanced?.card ?? r.card).stage, outcome: r.advanced?.outcome };
  });
  tool('reject', 'Reject the gate with a note. Refused unless the server runs with CODELOOP_ROLE=owner or reviewer.', { ...id, note: z.string() }, a => rejectCard(projectDir, a.id, resolveRole(), a.note));
  tool('task_done', 'Tick a task in the card spec folder.', { ...id, task: z.string().describe('Task id, e.g. T003') }, a => {
    tickTask(projectDir, resolveSpecDir(projectDir, a.id), a.task);
    return { done: a.task };
  });
  tool('wiki_inject', 'Wiki pages whose scope matches these files.', { files: z.array(z.string()) }, a => inject(projectDir, a.files));
  tool('wiki_capture', 'Write a wiki page; an existing title raises its frequency.', { title: z.string(), scope: z.array(z.string()), body: z.string(), kind: z.enum(['gotcha', 'decision', 'concept']).optional(), card: z.string().optional() }, a => capture(projectDir, a));

  await server.connect(new StdioServerTransport());
}
