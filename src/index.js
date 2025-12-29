
import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const app = express();
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 10000;

/* =========================
   TWILIO ANSWER WEBHOOK
========================= */
app.post("/twilio/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say voice="alice">I'm listening.</Say>
      <Connect>
        <Stream url="wss://psychic-backend.onrender.com/media" />
      </Connect>
    </Response>
  `);
});

/* =========================
   HTTP SERVER
========================= */
const server = http.createServer(app);

/* =========================
   WEBSOCKET SERVER (TWILIO)
========================= */
const wss = new WebSocketServer({
  server,
  path: "/media",
});

wss.on("connection", (twilioWs) => {
  console.log("📞 Twilio WebSocket connected");

  /* =========================
     CONNECT TO DEEPGRAM (RAW WS)
  ========================= */
  const deepgramWs = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramWs.on("open", () => {
    console.log("🎧 Deepgram connected");
  });

  deepgramWs.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    const transcript =
      data.channel?.alternatives?.[0]?.transcript;

    if (transcript) {
      console.log("📝 TRANSCRIPT:", transcript);
    }
  });

  deepgramWs.on("error", (err) => {
    console.error("❌ Deepgram error:", err);
  });

  /* =========================
     RECEIVE AUDIO FROM TWILIO
  ========================= */
  twilioWs.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "media") {
      const audio = Buffer.from(data.media.payload, "base64");
      if (deepgramWs.readyState === WebSocket.OPEN) {
        deepgramWs.send(audio);
      }
    }
  });

  twilioWs.on("close", () => {
    console.log("☎️ Twilio disconnected");
    deepgramWs.close();
  });
});

/* =========================
   START SERVER
========================= */
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
