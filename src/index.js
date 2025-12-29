/**
 * PHASE III — FULL WORKING FILE
 * - Twilio answers calls correctly (no 11200 errors)
 * - WebSocket audio stream opens
 * - Deepgram transcribes
 * - AI response is generated
 * - AI SPEAKS BACK via Twilio <Stream>
 */

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fetch = require("node-fetch");

const app = express();

/* REQUIRED FOR TWILIO */
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* ===============================
   TWILIO ANSWER ENDPOINT
   =============================== */
app.post("/twilio/answer", (req, res) => {
  res.set("Content-Type", "text/xml");

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">I am listening.</Say>
  <Connect>
    <Stream url="wss://psychic-backend.onrender.com/twilio/stream" />
  </Connect>
</Response>`;

  res.status(200).send(twiml);
});

/* ===============================
   HTTP + WEBSOCKET SERVER
   =============================== */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* ===============================
   TWILIO STREAM HANDLER
   =============================== */
wss.on("connection", async (twilioWS) => {
  console.log("🔗 Twilio stream connected");

  /* CONNECT TO DEEPGRAM */
  const deepgramWS = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&punctuate=true",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  let speaking = false;

  deepgramWS.on("open", () => {
    console.log("🎙️ Deepgram connected");
  });

  deepgramWS.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());
    const transcript =
      data.channel?.alternatives?.[0]?.transcript;

    if (!transcript || speaking) return;

    speaking = true;
    console.log("📝 TRANSCRIPT:", transcript);

    /* ===============================
       OPENAI RESPONSE
       =============================== */
    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
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
                "You are a calm, friendly psychic reader. Respond briefly and naturally.",
            },
            { role: "user", content: transcript },
          ],
        }),
      }
    );

    const aiJson = await aiResponse.json();
    const reply =
      aiJson.choices?.[0]?.message?.content || "I hear you.";

    console.log("🤖 AI:", reply);

    /* ===============================
       DEEPGRAM TEXT-TO-SPEECH
       =============================== */
    const ttsResponse = await fetch(
      "https://api.deepgram.com/v1/speak?model=aura-asteria-en",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: reply }),
      }
    );

    const audioBuffer = Buffer.from(
      await ttsResponse.arrayBuffer()
    );

    /* ===============================
       SEND AUDIO BACK TO TWILIO
       =============================== */
    twilioWS.send(
      JSON.stringify({
        event: "media",
        media: {
          payload: audioBuffer.toString("base64"),
        },
      })
    );

    speaking = false;
  });

  /* ===============================
     RECEIVE AUDIO FROM TWILIO
     =============================== */
  twilioWS.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "media") {
      deepgramWS.send(
        Buffer.from(data.media.payload, "base64")
      );
    }
  });

  twilioWS.on("close", () => {
    console.log("❌ Twilio disconnected");
    deepgramWS.close();
  });
});

/* ===============================
   START SERVER
   =============================== */
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
