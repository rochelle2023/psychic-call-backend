const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

// ---- BASIC HEALTH CHECK ----
app.get("/", (req, res) => {
  res.send("Psychic backend running.");
});

// ---- TWILIO ANSWER (START STREAM) ----
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

// ---- WEBSOCKET HANDLING ----
wss.on("connection", async (twilioSocket) => {
  console.log("🔌 Twilio connected");

  // Connect to Deepgram live transcription
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

  deepgramSocket.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());
    const transcript = data.channel?.alternatives?.[0]?.transcript;

    if (!transcript) return;

    console.log("📝 TRANSCRIPT:", transcript);

    // ---- AI THINKING ----
    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a warm, intuitive psychic. Speak gently, conversationally, and briefly.",
            },
            {
              role: "user",
              content: transcript,
            },
          ],
          temperature: 0.9,
          max_tokens: 80,
        }),
      }
    );

    const aiData = await aiResponse.json();
    const reply = aiData.choices[0].message.content;

    console.log("🔮 AI:", reply);

    // ---- DEEPGRAM TEXT → SPEECH ----
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

    // Send audio back to Twilio
    twilioSocket.send(
      JSON.stringify({
        event: "media",
        media: {
          payload: audioBuffer.toString("base64"),
        },
      })
    );
  });

  twilioSocket.on("message", (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.event === "media") {
      const audio = Buffer.from(data.media.payload, "base64");
      deepgramSocket.send(audio);
    }
  });

  twilioSocket.on("close", () => {
    console.log("📞 Call ended");
    deepgramSocket.close();
  });
});

// ---- START SERVER ----
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
