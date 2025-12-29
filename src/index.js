
import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ==========================
// STATE
// ==========================
let deepgramSocket = null;
let twilioSocket = null;
let isAISpeaking = false;
let lastAssistantMessage = "";

// ==========================
// TWILIO ANSWER
// ==========================
app.post("/twilio/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
<Response>
  <Say voice="Polly.Joanna">I'm listening.</Say>
  <Connect>
    <Stream url="wss://${req.headers.host}/twilio/stream" />
  </Connect>
</Response>
  `);
});

// ==========================
// HTTP + WS SERVER
// ==========================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ==========================
// TWILIO STREAM
// ==========================
wss.on("connection", (ws) => {
  console.log("📞 Twilio WebSocket connected");
  twilioSocket = ws;

  connectDeepgram();

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // User speaking → stop AI
    if (data.event === "media" && deepgramSocket?.readyState === WebSocket.OPEN) {
      isAISpeaking = false;
      deepgramSocket.send(Buffer.from(data.media.payload, "base64"));
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio disconnected");
    deepgramSocket?.close();
  });
});

// ==========================
// DEEPGRAM
// ==========================
function connectDeepgram() {
  deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&punctuate=true",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`
      }
    }
  );

  deepgramSocket.on("open", () => {
    console.log("🧠 Deepgram connected");
  });

  deepgramSocket.on("message", async (msg) => {
    const data = JSON.parse(msg);
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    const isFinal = data.is_final;

    if (!transcript || !isFinal) return;

    console.log("📝 TRANSCRIPT:", transcript);

    const reply = await askGPT(transcript);

    if (!reply || reply === lastAssistantMessage) return;
    lastAssistantMessage = reply;

    speakToCaller(reply);
  });
}

// ==========================
// GPT
// ==========================
async function askGPT(text) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a warm, intuitive psychic reader. Speak naturally, gently, and do not repeat generic questions."
        },
        { role: "user", content: text }
      ]
    })
  });

  const json = await response.json();
  return json.choices?.[0]?.message?.content;
}

// ==========================
// SPEAK BACK TO CALLER
// ==========================
async function speakToCaller(text) {
  if (!twilioSocket || isAISpeaking) return;

  isAISpeaking = true;

  const tts = await fetch("https://api.deepgram.com/v1/speak?model=aura-asteria-en", {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });

  const audioBuffer = Buffer.from(await tts.arrayBuffer());

  twilioSocket.send(
    JSON.stringify({
      event: "media",
      media: {
        payload: audioBuffer.toString("base64")
      }
    })
  );

  isAISpeaking = false;
}

// ==========================
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
