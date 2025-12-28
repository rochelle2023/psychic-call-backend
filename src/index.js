const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: false }));

// 1️⃣ TWILIO ANSWERS THE CALL
app.post('/twilio/answer', (req, res) => {
  res.type('text/xml');
  res.send(`
    <Response>
      <Connect>
        <Stream url="wss://psychic-backend.onrender.com/stream" />
      </Connect>
    </Response>
  `);
});

// 2️⃣ CREATE HTTP SERVER (REQUIRED FOR WEBSOCKETS)
const server = http.createServer(app);

// 3️⃣ CREATE WEBSOCKET SERVER
const wss = new WebSocket.Server({ server });

// 4️⃣ LISTEN FOR LIVE AUDIO
wss.on('connection', (ws) => {
  console.log('🔊 Media Stream connected');

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);

    if (data.event === 'media') {
      console.log('🎧 Caller audio packet received');
    }

    if (data.event === 'start') {
      console.log('📞 Call started');
    }

    if (data.event === 'stop') {
      console.log('❌ Call ended');
    }
  });
});

// 5️⃣ START SERVER
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
