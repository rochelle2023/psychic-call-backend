const express = require("express");
const WebSocket = require("ws");
const http = require("http");

const app = express();
app.use(express.urlencoded({ extended: false }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/**
 * ---------------------------
 * TWILIO ANSWER ENDPOINT
 * ---------------------------
 */
app.post("/twilio/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say>I’m listening.</Say>
      <Connect>
        <Stream url="wss://${req.headers.host}/twilio-stream" />
      </Connect>
    </Response>
  `);
});

/**
 * ---------------------------
 * WEBSOCKET: TWILIO STREAM
 * ---------------------------
 */
wss.on("connection", (twilioSocket) => {
  console.log("📞 Twilio connected");

  let deepgramSocket;
  let finalTranscript = "";

  // Connect to Deepgram
  deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramSocket.on("open", () => {
    console.log("🧠 Deepgram connected");
  });

  deepgramSocket.on("message", (data) => {
    const dg = JSON.parse(data);
    const transcript = dg.channel?.alternatives?.[0]?.transcript;

    if (transcript) {
      console.log("📝 TRANSCRIPT:", transcript);
      finalTranscript += " " + transcript;
    }

    // When Deepgram marks speech as final → respond
    if (dg.is_final && finalTranscript.trim()) {
      speakBack(finalTranscript.trim(), twilioSocket);
      finalTranscript = "";
    }
  });

  twilioSocket.on("message", (msg) => {
    const event = JSON.parse(msg);

    if (event.event === "media") {
      if (deepgramSocket.readyState === WebSocket.OPEN) {
        const audio = Buffer.from(event.media.payload, "base64");
        deepgramSocket.send(audio);
      }
    }

    if (event.event === "stop") {
      console.log("📴 Call ended");
      deepgramSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("❌ Twilio disconnected");
    deepgramSocket.close();
  });
});

/**
 * ---------------------------
 * AI RESPONSE (TEXT ONLY FOR NOW)
 * ---------------------------
 */
async function speakBack(text, twilioSocket) {
  console.log("🤖 AI responding to:", text);

  // For Phase II, we only log the AI response
  // Phase III will turn this into speech
  const response = `I hear you. You said: ${text}`;
  console.log("🗣️ AI:", response);
}

/**
 * ---------------------------
 * START SERVER
 * ---------------------------
 */
server.listen(10000, () => {
  console.log("🚀 Server running on port 10000");
});
