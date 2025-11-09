// // signalar.js
// const { v4: uuidv4 } = require('uuid');
// const { WebSocketServer } = require('ws');
// const url = require('url');
// const express = require('express');

// const signalrRouter = express.Router();
// const pendingConnections = new Map();

// // Build negotiate payload
// function buildNegotiatePayload(negotiateVersion = 1) {
//   const connectionId = uuidv4().replace(/-/g, '').slice(0, 24);
//   const connectionToken = uuidv4().replace(/-/g, '');
//   pendingConnections.set(connectionId, { token: connectionToken, timestamp: Date.now() });

//   return {
//     negotiateVersion,
//     connectionId,
//     connectionToken,
//     availableTransports: [
//       { transport: 'WebSockets', transferFormats: ['Text', 'Binary'] },
//       { transport: 'ServerSentEvents', transferFormats: ['Text'] },
//       { transport: 'LongPolling', transferFormats: ['Text', 'Binary'] }
//     ]
//   };
// }

// // Negotiate endpoint
// signalrRouter.post('/signalr/negotiate', (req, res) => {
//   const negotiateVersion = parseInt(req.query.negotiateVersion || '1', 10);
//   res.json(buildNegotiatePayload(negotiateVersion));
// });

// // Attach WebSocket server
// function attachSignalR(server, wsPath = '/signalr') {
//   const wss = new WebSocketServer({ noServer: true });

//   server.on('upgrade', (request, socket, head) => {
//     const parsed = url.parse(request.url, true);
//     const cid = parsed.query.id;
//     const pathname = parsed.pathname;

//     console.log('Incoming WS upgrade request:', pathname, 'id=', cid);
//     console.log('Pending connections:', Array.from(pendingConnections.keys()));

//     if (pathname.startsWith(wsPath) && pendingConnections.has(cid)) {
//       pendingConnections.delete(cid); // mark as connected
//       wss.handleUpgrade(request, socket, head, (ws) => {
//         wss.emit('connection', ws, request, cid);
//       });
//     } else {
//       console.log('❌ WS upgrade rejected');
//       socket.destroy();
//     }
//   });

//   wss.on('connection', (ws, req, cid) => {
//     console.log(`✅ WS connected (id=${cid})`);

//     ws.on('message', (msg) => {
//       console.log(`Received from ${cid}: ${msg}`);
//       ws.send(`Echo: ${msg}`);
//     });

//     ws.on('close', () => console.log(`Connection closed (id=${cid})`));
//   });
// }

// module.exports = { signalrRouter, attachSignalR };
