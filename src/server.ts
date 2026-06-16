import { createServer, type Server } from 'node:http';
import { LOG_PREFIX } from './preferences.ts';

export function startHealthServer(port: number): Server {
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  server.listen(port, () => {
    const addr = server.address();
    const shown = typeof addr === 'object' && addr ? addr.port : port;
    console.log(`${LOG_PREFIX.server} listening on ${shown}`);
  });
  return server;
}
