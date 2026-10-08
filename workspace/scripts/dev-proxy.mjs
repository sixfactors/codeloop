// Dev-only front door. `codeloop serve` sends no CORS headers and refuses writes whose Origin host
// differs from its Host, so a page served by `next dev` cannot post to it directly. This proxy
// sits in front of both: /api and /mocks go to the API with Origin dropped and Host rewritten,
// everything else goes to next dev. The shipped static export is served by the API itself and
// needs none of this.
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 4046);
const API = new URL(process.env.CODELOOP_API ?? 'http://127.0.0.1:4043');
const NEXT = new URL(process.env.NEXT_DEV ?? 'http://127.0.0.1:4044');

http.createServer((req, res) => {
  const toApi = req.url.startsWith('/api/') || req.url.startsWith('/mocks');
  const target = toApi ? API : NEXT;
  const headers = { ...req.headers, host: target.host };
  if (toApi) delete headers.origin;
  const up = http.request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(PORT, '127.0.0.1', () => console.log(`workspace dev: http://localhost:${PORT}/?token=<token>  (api ${API.origin}, next ${NEXT.origin})`));
