const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

// Twilio sends form-encoded data
app.use(express.urlencoded({ extended: false }));

// Health check
app.get("/", (req, res) => {
  res.send("Psychic streaming backend is running.");
});

/**
 * ============================
 * TWILIO ANSWER WEBHOOK
 * ============================
 */
app.post("/twilio/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say voice="alice">I'm listening.</Say>
      <Start>
        <Stream url="wss://${req.headers.host}" />
      </Start>
    </Response>
  `);
});

/**
 * ============================
 * WEBSOCKET: TWILIO AUDIO IN
 * ============================
 */
wss.on("connection", (twilioSocket) => {
  console.log("📞 Twilio WebSocket connected");

  const deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramSocket.on("open", () => {
    console.log("🟢 Deepgram connected");
  });

  deepgramSocket.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    const transcript =
      msg.channel?.alternatives?.[0]?.transcript;

    if (transcript && transcript.trim() !== "") {
      console.log("🗣️ CALLER SAID:", transcript);
    }
  });

  deepgramSocket.on("error", (err) => {
    console.error("🔴 Deepgram error:", err);
  });

  twilioSocket.on("message", (message) => {
    const msg = JSON.parse(message);

    if (msg.event === "media") {
      deepgramSocket.send(
        Buffer.from(msg.media.payload, "base64")
      );
    }

    if (msg.event === "stop") {
      console.log("📴 Call ended");
      deepgramSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("❌ Twilio WebSocket closed");
    deepgramSocket.close();
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

