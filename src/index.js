import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const app = express();
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/* ================================
   TWILIO ANSWER (VOICE WEBHOOK)
================================ */
app.post("/twilio/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
<Response>
  <Say voice="Polly.Joanna">I am listening.</Say>
  <Connect>
    <Stream url="wss://${req.headers.host}/twilio/stream" />
  </Connect>
</Response>
  `);
});

/* ================================
   WEBSOCKET HANDLER
================================ */
wss.on("connection", async (twilioWS) => {
  console.log("📞 Twilio WebSocket connected");

  const deepgramWS = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramWS.on("open", () => {
    console.log("🎧 Deepgram connected");
  });

  deepgramWS.on("message", async (msg) => {
    const data = JSON.parse(msg);
    const transcript = data.channel?.alternatives?.[0]?.transcript;

    if (!transcript) return;

    console.log("📝 TRANSCRIPT:", transcript);

    /* ================================
       GPT RESPONSE
    ================================ */
    const gptResponse = await fetch(
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
                "You are a warm, intuitive psychic reader. Respond briefly and naturally.",
            },
            { role: "user", content: transcript },
          ],
        }),
      }
    );

    const gptData = await gptResponse.json();
    const reply =
      gptData.choices?.[0]?.message?.content ||
      "I sense something unfolding.";

    console.log("🤖 AI:", reply);

    /* ================================
       DEEPGRAM TTS
    ================================ */
    const tts = await fetch(
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

    const audioBuffer = Buffer.from(await tts.arrayBuffer());

    twilioWS.send(
      JSON.stringify({
        event: "media",
        media: {
          payload: audioBuffer.toString("base64"),
        },
      })
    );
  });

  /* ================================
     AUDIO FROM TWILIO → DEEPGRAM
  ================================ */
  twilioWS.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "media") {
      if (deepgramWS.readyState === WebSocket.OPEN) {
        deepgramWS.send(Buffer.from(data.media.payload, "base64"));
      }
    }
  });

  twilioWS.on("close", () => {
    console.log("❌ Twilio disconnected");
    deepgramWS.close();
  });
});

/* ================================
   SERVER START
================================ */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

