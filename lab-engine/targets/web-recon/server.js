'use strict';

const http = require('http');

const FLAG = 'OXSIG{debug_endpoint_exposed}';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://target:8080');

  res.setHeader('Server', 'OxSig-Training/0.1');
  res.setHeader('X-Lab-Environment', 'isolated');
  res.setHeader('Cache-Control', 'no-store');

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<html>
<head><title>OxSig Training Service</title></head>
<body>
  <h1>OxSig Training Service</h1>
  <p>Internal service is healthy.</p>
</body>
</html>`);
    return;
  }

  if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('User-agent: *\nDisallow: /debug\n');
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (url.pathname === '/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      warning: 'Debug endpoint must not be exposed in production',
      environment: 'training',
      build: '0.1.0-lab',
      flag: FLAG,
    }, null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found\n');
});

server.listen(8080, '0.0.0.0', () => {
  console.log('OxSig web-recon target listening on :8080');
});
