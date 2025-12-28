const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: false }));

const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir);

app.use('/audio', express.static(audioDir));

app.get('/', (req, res) => {
  res.send('Psychic backend is running.');
});

app.post('/twilio/answer', async (req, res) => {
  try {
    // 1️⃣ Get dynamic psychic text
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
              'You are a warm, reassuring psychic. Speak gently, emotionally, and naturally.',
          },
          {
            role: 'user',
            content:
              'Give a short comforting message to someone feeling uncertain about love.',
          },
        ],
        temperature: 0.9,
        max_tokens: 120,
      }),
    });

    const openaiData = await openaiRes.json();
    const text = openaiData.choices[0].message.content;

    console.log('Psychic text:', text);

    // 2️⃣ ElevenLabs → MP3 (CORRECT WAY)
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.25,
            similarity_boost: 0.8,
          },
        }),
      }
    );

    if (!elevenRes.ok) {
      throw new Error('ElevenLabs failed');
    }

    const audioBuffer = Buffer.from(await elevenRes.arrayBuffer());
    const fileName = `reading-${Date.now()}.mp3`;
    fs.writeFileSync(path.join(audioDir, fileName), audioBuffer);

    // 3️⃣ Play realistic voice
    res.type('text/xml');
    res.send(`
      <Response>
        <Play>https://psychic-backend.onrender.com/audio/${fileName}</Play>
      </Response>
    `);
  } catch (err) {
    console.error('VOICE ERROR:', err);

    res.type('text/xml');
    res.send(`
      <Response>
        <Say voice="alice">
          I’m here with you. Something is gently shifting, even if you can’t see it yet.
        </Say>
      </Response>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
