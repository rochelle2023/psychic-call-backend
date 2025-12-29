import express from "express";


const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

/**
 * 1️⃣ CALL ANSWER — START LISTENING
 */
app.post("/twilio/answer", (req, res) => {
  res.type("text/xml");
  res.send(`
<Response>
  <Say voice="alice">I'm listening.</Say>
  <Gather input="speech"
          action="/twilio/process"
          method="POST"
          speechTimeout="auto"
          interruptible="true" />
</Response>
`);
});

/**
 * 2️⃣ PROCESS SPEECH → GPT → SPEAK BACK
 */
app.post("/twilio/process", async (req, res) => {
  const userText = req.body.SpeechResult;

  if (!userText) {
    res.type("text/xml");
    return res.send(`
<Response>
  <Say voice="alice">I didn't catch that. Please try again.</Say>
  <Redirect>/twilio/answer</Redirect>
</Response>
`);
  }

  // GPT RESPONSE
  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a calm, compassionate psychic reader. Speak naturally and briefly."
        },
        {
          role: "user",
          content: userText
        }
      ]
    })
  }).then(r => r.json());

  const reply =
    aiResponse.choices?.[0]?.message?.content ||
    "Tell me a little more.";

  res.type("text/xml");
  res.send(`
<Response>
  <Say voice="alice">${reply}</Say>
  <Redirect>/twilio/answer</Redirect>
</Response>
`);
});

/**
 * SERVER
 */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

