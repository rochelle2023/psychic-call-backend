const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.urlencoded({ extended: false }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/**
 * TWILIO ANSWER WEBHOOK
 */
app.post("/twilio/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
<Response>
  <Say voice="alice">I'm listening.</Say>

  <Start>
    <Stream url="wss://${req.headers.host}" />
  </Start>

  <Pause length="600" />
</Response>
  `);
});

/**
 * WEBSOCKET — RECEIVES LIVE AUDIO
 */
wss.on("connection", (ws) => {
  console.log("📞 Twilio WebSocket connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.event === "media") {
        console.log("🎧 Caller audio packet received");
      }

      if (data.event === "start") {
        console.log("▶️ Stream started");
      }

      if (data.event === "stop") {
        console.log("⏹️ Stream stopped");
      }
    } catch (err) {
      console.error("WebSocket parse error:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket closed");
  });
});

/**
 * BASIC HEALTH CHECK
 */
app.get("/", (req, res) => {
  res.send("Psychic backend running.");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

