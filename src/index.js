const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: false }));

app.get('/', (req, res) => {
  res.send('Psychic streaming backend running.');
});

/**
 * Twilio hits this when a call starts
 */
app.post('/twilio/answer', (req, res) => {
  res.type('text/xml');
  res.send(`
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media" />
      </Start>
      <Say>I'm listening.</Say>
      <Pause length="60" />
    </Response>
  `);
});

/**
 * WebSocket receives live caller audio
 */
wss.on('connection', (ws) => {
  console.log('🟢 Twilio media stream connected');

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);

    if (data.event === 'media') {
      // We are receiving audio packets here
      console.log('🎧 Caller audio packet received');
    }

    if (data.event === 'stop') {
      console.log('🔴 Call ended');
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket closed');
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

