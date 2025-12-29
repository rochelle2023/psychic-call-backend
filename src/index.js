
import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import { spawn } from "child_process";

const app = express();
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/* ================================
   TWILIO ANSWER
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
   WEBSOCKET STREAM
================================ */
wss.on("connection", (twilioWS) => {
  console.log("📞 Twilio connected");

  let streamSid = null;

  const deepgramSTT = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramSTT.on("open", () => console.log("🎧 Deepgram STT connected"));

  deepgramSTT.on("message", async (msg) => {
    const data = JSON.parse(msg);
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (!transcript) return;

    console.log("📝 TRANSCRIPT:", transcript);

    /* GPT */
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
    });

    const gpt = await gptRes.json();
    const reply =
      gpt.choices?.[0]?.message?.content ||
      "I sense something unfolding.";

    console.log("🤖 AI:", reply);

    /* Deepgram TTS (LINEAR PCM) */
    const ttsRes = await fetch(
      "https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=linear16&sample_rate=8000",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: reply }),
      }
    );

    const pcmBuffer = Buffer.from(await ttsRes.arrayBuffer());

    /* Convert PCM → MULAW */
    const ffmpeg = spawn("ffmpeg", [
      "-f",
      "s16le",
      "-ar",
      "8000",
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-f",
      "mulaw",
      "pipe:1",
    ]);

    ffmpeg.stdin.write(pcmBuffer);
    ffmpeg.stdin.end();

    const chunks = [];
    ffmpeg.stdout.on("data", (d) => chunks.push(d));

    ffmpeg.stdout.on("end", () => {
      const mulaw = Buffer.concat(chunks).toString("base64");

      twilioWS.send(
        JSON.stringify({
          event: "media",
          streamSid,
          media: {
            track: "outbound",
            payload: mulaw,
          },
        })
      );
    });
  });

  /* FROM TWILIO */
  twilioWS.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      console.log("▶ Stream SID:", streamSid);
    }

    if (data.event === "media") {
      if (deepgramSTT.readyState === WebSocket.OPEN) {
        deepgramSTT.send(Buffer.from(data.media.payload, "base64"));
      }
    }
  });

  twilioWS.on("close", () => {
    console.log("❌ Twilio disconnected");
    deepgramSTT.close();
  });
});

/* ================================
   SERVER
================================ */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
