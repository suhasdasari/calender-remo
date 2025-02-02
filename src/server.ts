import express from 'express';
import http from 'http';

const PORT = 8585;
let server: http.Server;

export function startServer(app: express.Application) {
  server = http.createServer(app);
  
  server.listen(PORT, () => {
    console.log(`OAuth callback server listening at http://localhost:${PORT}`);
  });

  return server;
}

export function stopServer() {
  if (server) {
    server.close();
  }
} 