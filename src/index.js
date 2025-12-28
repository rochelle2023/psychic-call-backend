const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const fetch = require("node-fetch");

const app = express();
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 10000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* ================================
   TWILIO ANSWER (START STREAM)
================================ */
app.post("/twilio/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say>I'm listening.</Say>
      <Start>
        <Stream url="wss://${req.headers.host}" />
      </Start>
    </Response>
  `);
});

/* ================================
   WEBSOCKET HANDLING
================================ */
wss.on("connection", (twilioSocket) => {
  console.log("📞 Twilio connected");

  let deepgramSocket;
  let transcriptBuffer = "";
  let silenceTimer = null;
  let speaking = false;

  /* ================================
     CONNECT TO DEEPGRAM STT
  ================================ */
  deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&interim_results=true",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramSocket.on("open", () => {
    console.log("🎧 Deepgram connected");
  });

  deepgramSocket.on("message", (msg) => {
    const data = JSON.parse(msg);
    const transcript =
      data.channel?.alternatives?.[0]?.transcript || "";

    if (!transcript) return;

    console.log("📝 TRANSCRIPT:", transcript);
    transcriptBuffer = transcript;

    // Reset silence timer
    if (silenceTimer) clearTimeout(silenceTimer);

    silenceTimer = setTimeout(async () => {
      if (!transcriptBuffer || speaking) return;

      speaking = true;
      const userText = transcriptBuffer;
      transcriptBuffer = "";

      console.log("🧠 AI responding to:", userText);

      /* ================================
         OPENAI RESPONSE
      ================================ */
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
                "You are a warm, emotionally intuitive psychic. Speak naturally, gently, and conversationally.",
            },
            { role: "user", content: userText },
          ],
          temperature: 0.9,
          max_tokens: 120,
        }),
      });

      const aiData = await aiRes.json();
      const aiText = aiData.choices[0].message.content;

      console.log("🔊 AI says:", aiText);

      /* ================================
         DEEPGRAM TTS (STREAM BACK)
      ================================ */
      const ttsRes = await fetch(
        "https://api.deepgram.com/v1/speak?model=aura-asteria-en",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: aiText }),
        }
      );

      const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(
          JSON.stringify({
            event: "media",
            media: {
              payload: audioBuffer.toString("base64"),
            },
          })
        );
      }

      speaking = false;
    }, 900); // 👈 PAUSE DETECTION (900ms)
  });

  /* ================================
     RECEIVE AUDIO FROM TWILIO
  ================================ */
  twilioSocket.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "media") {
      if (deepgramSocket.readyState === WebSocket.OPEN) {
        deepgramSocket.send(Buffer.from(data.media.payload, "base64"));
      }
    }

    if (data.event === "start") {
      console.log("▶️ Twilio stream started");
    }

    if (data.event === "stop") {
      console.log("⛔ Call ended");
      deepgramSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("📴 Twilio disconnected");
    if (deepgramSocket) deepgramSocket.close();
  });
});

/* ================================
   SERVER START
================================ */
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
