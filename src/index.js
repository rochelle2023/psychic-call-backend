const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.urlencoded({ extended: false }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("Psychic backend running");
});

app.post("/twilio/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say>I'm listening.</Say>
      <Connect>
        <Stream url="wss://${req.headers.host}/twilio-stream"/>
      </Connect>
    </Response>
  `);
});

wss.on("connection", (twilioSocket) => {
  console.log("🔌 Twilio connected");

  let deepgramSocket = null;
  let twilioReady = false;

  deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramSocket.on("open", () => {
    console.log("🧠 Deepgram connected");
  });

  deepgramSocket.on("message", (msg) => {
    const data = JSON.parse(msg.toString());
    const transcript = data.channel?.alternatives?.[0]?.transcript;

    if (transcript) {
      console.log("📝 TRANSCRIPT:", transcript);
    }
  });

  deepgramSocket.on("close", () => {
    console.log("🧠 Deepgram disconnected");
  });

  twilioSocket.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "start") {
      console.log("▶️ Twilio stream started");
      twilioReady = true;
    }

    if (data.event === "media") {
      if (
        deepgramSocket &&
        deepgramSocket.readyState === WebSocket.OPEN
      ) {
        const audio = Buffer.from(data.media.payload, "base64");
        deepgramSocket.send(audio);
      }
    }

    if (data.event === "stop") {
      console.log("⛔ Call ended");
      twilioSocket.close();
      deepgramSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔌 Twilio disconnected");
    if (deepgramSocket) deepgramSocket.close();
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

