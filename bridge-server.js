import { WebSocketServer } from 'ws';
import http from 'http';

const PORT = 3000;
const HTTP_PORT = 3001;

let currentDocument = null;
let figmaConnection = null;
const pendingRequests = new Map();
let requestIdCounter = 0;

const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Figma plugin connected');
  figmaConnection = ws;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'document-update') {
        currentDocument = message.document;
        console.log('Document updated:', currentDocument?.name);
      }

      if (message.type === 'response') {
        const { requestId, result, error } = message;
        const pending = pendingRequests.get(requestId);

        if (pending) {
          if (error) {
            pending.reject(new Error(error));
          } else {
            pending.resolve(result);
          }
          pendingRequests.delete(requestId);
        }
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Figma plugin disconnected');
    figmaConnection = null;
    currentDocument = null;
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(PORT, () => {
  console.log(`Bridge server listening on ws://localhost:${PORT}`);
  console.log('Waiting for Figma plugin to connect...');
});

const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        connected: figmaConnection !== null,
        hasDocument: currentDocument !== null
      }));
      return;
    }

    if (req.method === 'GET' && req.url === '/document') {
      if (!currentDocument) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'No Figma document connected' }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify(currentDocument));
      return;
    }

    if (req.method === 'POST' && req.url === '/request') {
      if (!figmaConnection) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'Figma plugin not connected' }));
        return;
      }

      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const { action, params } = JSON.parse(body);
          const result = await sendRequestToFigma(action, params);

          res.writeHead(200);
          res.end(JSON.stringify({ result }));
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP API listening on http://localhost:${HTTP_PORT}`);
});

function sendRequestToFigma(action, params) {
  return new Promise((resolve, reject) => {
    if (!figmaConnection) {
      reject(new Error('Figma plugin not connected'));
      return;
    }

    const requestId = ++requestIdCounter;
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 30000);

    pendingRequests.set(requestId, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    });

    figmaConnection.send(JSON.stringify({
      type: 'request',
      requestId,
      action,
      params: params || {}
    }));
  });
}

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  wss.close();
  server.close();
  httpServer.close();
  process.exit(0);
});
