/**
 * PHASE III — AI SPEAKS BACK (FULL FILE)
 * -------------------------------------
 * Delete old index.js and replace with this.
 */

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* -------------------- TWILIO ANSWER -------------------- */

app.post("/answer", (req, res) => {
  const twiml = `
<Response>
  <Say voice="alice">I'm listening.</Say>
  <Connect>
    <Stream url="wss://${req.headers.host}/media" />
  </Connect>
</Response>`;
  res.type("text/xml");
  res.send(twiml);
});

/* -------------------- SERVER -------------------- */

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (twilioWS) => {
  console.log("📞 Twilio connected");

  let deepgramWS;
  let speaking = false;

  /* -------- CONNECT TO DEEPGRAM STT -------- */

  deepgramWS = new WebSocket(
    "wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&interim_results=false&endpointing=300",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramWS.on("open", () => {
    console.log("🎙️ Deepgram STT connected");
  });

  deepgramWS.on("message", async (msg) => {
    const data = JSON.parse(msg);
    const transcript = data.channel?.alternatives?.[0]?.transcript;

    if (!transcript || speaking) return;

    console.log("📝 TRANSCRIPT:", transcript);
    speaking = true;

    /* -------- SEND TEXT TO OPENAI -------- */

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
                "You are a warm, conversational psychic reader. Respond naturally and briefly.",
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

    /* -------- DEEPGRAM TTS -------- */

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

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());

    /* -------- SEND AUDIO BACK TO TWILIO -------- */

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

  /* -------- RECEIVE AUDIO FROM TWILIO -------- */

  twilioWS.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "media" && deepgramWS.readyState === WebSocket.OPEN) {
      const audio = Buffer.from(data.media.payload, "base64");
      deepgramWS.send(audio);
    }
  });

  twilioWS.on("close", () => {
    console.log("❌ Twilio disconnected");
    deepgramWS.close();
  });
});

/* -------------------- START -------------------- */

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
