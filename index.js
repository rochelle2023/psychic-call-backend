const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const app = express();

app.use(express.urlencoded({ extended: false }));

app.post('/voice/psychic', (req, res) => {
  const twiml = new VoiceResponse();

  twiml.say({ voice: 'Polly.Joanna' }, "Welcome. Let me tune into your energy...");

  twiml.start().stream({
    url: 'wss://yourdomain.com/ai-stream' // You’ll plug in your real stream URL later
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Psychic call backend running on port ${PORT}`);
});
