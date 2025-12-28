const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 10000;

// -------- BASIC HEALTH CHECK --------
app.get("/", (req, res) => {
  res.send("Psychic backend is running.");
});

// -------- TWILIO ANSWER ENDPOINT --------
// Twilio hits this when the call starts
app.post("/twilio/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say>I'm listening.</Say>
      <Connect>
        <Stream url="wss://${req.headers.host}/twilio-stream" />
      </Connect>
    </Response>
  `);
});

// -------- WEBSOCKET SERVER --------
const wss = new WebSocket.Server({ server, path: "/twilio-stream" });

wss.on("connection", (twilioSocket) => {
  console.log("📞 Twilio connected");

  // Connect to Deepgram
  const deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&punctuate=true",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramSocket.on("open", () => {
    console.log("🧠 Deepgram connected");
  });

  // Receive audio from Twilio
  twilioSocket.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "media") {
      const audioBuffer = Buffer.from(data.media.payload, "base64");
      if (deepgramSocket.readyState === WebSocket.OPEN) {
        deepgramSocket.send(audioBuffer);
      }
    }

    if (data.event === "stop") {
      console.log("📴 Call ended");
      deepgramSocket.close();
    }
  });

  // Receive transcription from Deepgram
  deepgramSocket.on("message", (msg) => {
    const transcriptData = JSON.parse(msg);
    const transcript =
      transcriptData.channel?.alternatives?.[0]?.transcript;

    if (transcript) {
      console.log("📝 TRANSCRIPT:", transcript);
    }
  });

  deepgramSocket.on("close", () => {
    console.log("🧠 Deepgram disconnected");
  });

  twilioSocket.on("close", () => {
    console.log("📞 Twilio disconnected");
    deepgramSocket.close();
  });
});

// -------- START SERVER --------
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
