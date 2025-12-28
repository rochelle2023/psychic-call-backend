const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("Psychic backend running.");
});

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

wss.on("connection", (twilioSocket) => {
  console.log("🔌 Twilio connected");

  let twilioReady = false;

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

    if (!transcript || !twilioReady) return;

    console.log("📝 TRANSCRIPT:", transcript);

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
                "You are a warm, intuitive psychic. Speak gently and briefly.",
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

    if (twilioReady && twilioSocket.readyState === WebSocket.OPEN) {
  twilioSocket.send(
    JSON.stringify({
      event: "media",
      media: {
        payload: audioBuffer.toString("base64"),
      },
    })
  );
} else {
  console.log("⏳ Twilio socket not ready yet, skipping audio frame");
}


  twilioSocket.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "start") {
      console.log("▶️ Twilio stream started");
      twilioReady = true;
    }

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

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
