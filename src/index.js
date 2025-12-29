/**
 * PHASE III – AI SPEAKS BACK (FULL FILE)
 * DELETE your old src/index.js and replace with this entire file
 */

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* =========================
   TWILIO ANSWER WEBHOOK
========================= */
app.post("/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say voice="alice">I'm listening.</Say>
      <Connect>
        <Stream url="wss://${req.headers.host}/media" />
      </Connect>
    </Response>
  `);
});

/* =========================
   HTTP + WEBSOCKET SERVER
========================= */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (twilioWs) => {
  console.log("📞 Twilio connected");

  let speaking = false;

  /* =========================
     CONNECT TO DEEPGRAM STT
  ========================= */
  const dgWs = new WebSocket(
    "wss://api.deepgram.com/v1/listen?model=nova-2&encoding=mulaw&sample_rate=8000&punctuate=true",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  dgWs.on("open", () => {
    console.log("🧠 Deepgram STT connected");
  });

  dgWs.on("message", async (msg) => {
    const data = JSON.parse(msg);
    const transcript = data.channel?.alternatives?.[0]?.transcript;

    if (!transcript || speaking) return;

    console.log("📝 TRANSCRIPT:", transcript);
    speaking = true;

    /* =========================
       OPENAI RESPONSE
    ========================= */
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a warm, calm, conversational psychic reader. Respond naturally and briefly.",
          },
          { role: "user", content: transcript },
        ],
      }),
    });

    const aiData = await aiResponse.json();
    const aiReply =
      aiData.choices?.[0]?.message?.content || "I hear you.";

    console.log("🤖 AI:", aiReply);

    /* =========================
       DEEPGRAM TTS (STREAMED)
    ========================= */
    const ttsResponse = await fetch(
      "https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=mulaw&sample_rate=8000",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: aiReply }),
      }
    );

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());

    const CHUNK_SIZE = 320; // 20ms @ 8kHz μ-law

    for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
      if (twilioWs.readyState !== WebSocket.OPEN) break;

      const chunk = audioBuffer.slice(i, i + CHUNK_SIZE);

      twilioWs.send(
        JSON.stringify({
          event: "media",
          media: {
            payload: chunk.toString("base64"),
          },
        })
      );

      await new Promise((r) => setTimeout(r, 20));
    }

    speaking = false;
  });

  /* =========================
     RECEIVE AUDIO FROM TWILIO
  ========================= */
  twilioWs.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "media") {
      const audio = Buffer.from(data.media.payload, "base64");
      if (dgWs.readyState === WebSocket.OPEN) {
        dgWs.send(audio);
      }
    }
  });

  twilioWs.on("close", () => {
    console.log("❌ Twilio disconnected");
    dgWs.close();
  });
});

/* =========================
   START SERVER
========================= */
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

