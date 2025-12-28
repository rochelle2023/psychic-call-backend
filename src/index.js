const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: false }));

// Serve generated audio
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// Health check
app.get('/', (req, res) => {
  res.send('Psychic backend is running.');
});

// Ensure audio folder exists
const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir);
}

// Twilio voice entry point
app.post('/twilio/answer', async (req, res) => {
  try {
    // 1️⃣ Get psychic text
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a warm, reassuring psychic. Speak gently, calmly, and emotionally.',
          },
          {
            role: 'user',
            content:
              'Give a short comforting message to someone who feels uncertain about love.',
          },
        ],
        temperature: 0.8,
        max_tokens: 120,
      }),
    });

    const openaiData = await openaiRes.json();
    const text =
      openaiData?.choices?.[0]?.message?.content ||
      'I feel a gentle sense of reassurance around you. Things are unfolding quietly in your favor.';

    // 2️⃣ Send text to ElevenLabs (audio file)
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.35,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    const audioBuffer = await elevenRes.arrayBuffer();
    const fileName = `reading-${Date.now()}.mp3`;
    const filePath = path.join(audioDir, fileName);

    fs.writeFileSync(filePath, Buffer.from(audioBuffer));

    // 3️⃣ Tell Twilio to play it
    res.type('text/xml');
    res.send(`
      <Response>
        <Play>https://psychic-backend.onrender.com/audio/${fileName}</Play>
      </Response>
    `);
  } catch (err) {
    console.error(err);
    res.type('text/xml');
    res.send(`
      <Response>
        <Say voice="alice">
          I’m here with you. Even when answers feel quiet, trust that things are still unfolding.
        </Say>
      </Response>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
