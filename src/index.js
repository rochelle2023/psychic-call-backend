const express = require('express');
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
    // 1️⃣ OpenAI text
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
              'You are a warm, reassuring psychic. Speak gently, naturally, and emotionally.',
          },
          {
            role: 'user',
            content:
              'Give a comforting message to someone feeling uncertain about love.',
          },
        ],
        temperature: 0.95,
        max_tokens: 120,
      }),
    });

    const openaiData = await openaiRes.json();
    const text = openaiData.choices[0].message.content;

    console.log('Generated text:', text);

    // 2️⃣ ElevenLabs REAL MP3
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
            stability: 0.2,
            similarity_boost: 0.85,
          },
        }),
      }
    );

    if (!elevenRes.ok) {
      throw new Error('ElevenLabs request failed');
    }

    const buffer = Buffer.from(await elevenRes.arrayBuffer());
    const fileName = `reading-${Date.now()}.mp3`;
    fs.writeFileSync(path.join(audioDir, fileName), buffer);

    // 3️⃣ Play ElevenLabs audio
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
          I’m here with you. Even when things feel unclear, trust that something gentle is unfolding.
        </Say>
      </Response>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
