import express from "express";
import http from "http";
import WebSocket from "ws";
import fetch from "node-fetch";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* ===============================
   TWILIO ANSWER WEBHOOK
================================ */
app.post("/twilio/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say voice="alice">I'm listening.</Say>
      <Pause length="600"/>
    </Response>
  `);
});

/* ===============================
   HTTP SERVER
================================ */
const server = http.createServer(app);

/* ===============================
   WEBSOCKET SERVER (TWILIO)
================================ */
const wss = new WebSocket.Server({ server });

wss.on("connection", (twilioWs) => {
  console.log("📞 Twilio WebSocket connected");

  let streamSid = null;
  let twilioReady = false;
  let audioQueue = [];
  let speaking = false;

  /* ===============================
     DEEPGRAM STT
  ================================ */
  const deepgramWs = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramWs.on("open", () => {
    console.log("🎧 Deepgram STT connected");
  });

  deepgramWs.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());
    const transcript =
      data.channel?.alternatives?.[0]?.transcript;

    if (!transcript || speaking) return;

    console.log("📝 TRANSCRIPT:", transcript);
    speaking = true;

    /* ===============================
       AI RESPONSE (OPENAI)
    ================================ */
    const aiRes = await fetch(
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
                "You are a calm, conversational psychic reader. Respond naturally and briefly.",
            },
            { role: "user", content: transcript },
          ],
        }),
      }
    );

    const aiJson = await aiRes.json();
    const reply =
      aiJson.choices?.[0]?.message?.content ||
      "I hear you.";

    console.log("🤖 AI:", reply);

    /* ===============================
       DEEPGRAM TTS
    ================================ */
    const ttsRes = await fetch(
      "https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=mulaw&sample_rate=8000",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: reply }),
      }
    );

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

    const payload = JSON.stringify({
      event: "media",
      streamSid,
      media: {
        payload: audioBuffer.toString("base64"),
      },
    });

    safeSend(payload);

    speaking = false;
  });

  /* ===============================
     SAFE SEND (CRITICAL FIX)
  ================================ */
  function safeSend(message) {
    if (
      twilioReady &&
      twilioWs.readyState === WebSocket.OPEN
    ) {
      twilioWs.send(message);
    } else {
      audioQueue.push(message);
    }
  }

  /* ===============================
     TWILIO EVENTS
  ================================ */
  twilioWs.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      twilioReady = true;
      console.log("▶️ Stream started");

      while (audioQueue.length > 0) {
        twilioWs.send(audioQueue.shift());
      }
    }

    if (data.event === "media") {
      const audio = Buffer.from(
        data.media.payload,
        "base64"
      );
      deepgramWs.send(audio);
    }

    if (data.event === "stop") {
      console.log("⏹ Call ended");
      deepgramWs.close();
    }
  });

  twilioWs.on("close", () => {
    console.log("❌ Twilio disconnected");
    deepgramWs.close();
  });
});

/* ===============================
   START SERVER
================================ */
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
