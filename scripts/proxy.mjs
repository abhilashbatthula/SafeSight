import http from 'node:http';
// Streaming proxy: pipe immediately, never accumulate SSE response bodies.
const host = process.env.PROXY_HOST || '127.0.0.1';
const server = http.createServer((req, res) => {
  const api = req.url === '/api' || req.url.startsWith('/api/');
  const target = http.request(
    {
      hostname: '127.0.0.1',
      port: api
        ? Number(process.env.API_PORT || 4000)
        : Number(process.env.WEB_PORT || 3000),
      path: api ? req.url.slice(4) || '/' : req.url,
      method: req.method,
      headers: {
        ...req.headers,
        'x-forwarded-proto': 'http',
        'x-forwarded-for': req.socket.remoteAddress,
      },
    },
    (upstream) => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    },
  );
  target.on('error', () => {
    if (!res.headersSent)
      res.writeHead(502, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        error: { message: 'Service starting or unavailable. Retry shortly.' },
      }),
    );
  });
  req.pipe(target);
  res.on('close', () => target.destroy());
});
server.on('upgrade', (req, socket, head) => {
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: Number(process.env.WEB_PORT || 3000),
    path: req.url,
    headers: req.headers,
  });
  upstream.on('upgrade', (response, remote, remoteHead) => {
    const headers = Object.entries(response.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\r\n');
    socket.write(
      `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n${headers}\r\n\r\n`,
    );
    if (head.length) remote.write(head);
    if (remoteHead.length) socket.write(remoteHead);
    socket.pipe(remote);
    remote.pipe(socket);
    socket.on('error', () => remote.destroy());
    remote.on('error', () => socket.destroy());
    socket.on('close', () => remote.destroy());
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});
server.requestTimeout = 0;
server.timeout = 0;
server.listen(Number(process.env.PROXY_PORT || 8080), host, () =>
  console.log(
    `SafeSight same-origin proxy: http://${host}:${process.env.PROXY_PORT || 8080}`,
  ),
);
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
