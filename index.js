const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Default homepage check
app.get('/', (req, res) => {
  res.send('AI Psychic backend is running!');
});

// Twilio voice webhook
app.post('/voice', (req, res) => {
  const twiml = `
    <Response>
      <Say>Hello. This is your AI Psychic. Let me look into the energy for a moment...</Say>
    </Response>
  `;
  res.type('text/xml');
  res.send(twiml);
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔊 Serve static files like /reading.mp3
app.use(express.static(path.join(__dirname, 'public')));

// ✅ MAIN ROUTE - Handles AI psychic reading
app.post('/voice', async (req, res) => {
  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer YOUR_OPENAI_API_KEY`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'You are a love psychic. Give a short, emotional reading for someone asking about their ex.'
          }
        ],
        temperature: 0.8,
        max_tokens: 150
      })
    });

    const openaiData = await openaiRes.json();
    const readingText = openaiData.choices[0].message.content;

    const elevenRes = await fetch('https://api.elevenlabs.io/v1/text-to-speech/YOUR_VOICE_ID/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': 'YOUR_ELEVENLABS_API_KEY'
      },
      body: JSON.stringify({
        text: readingText,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.3,
          similarity_boost: 0.75
        }
      })
    });

    const filePath = path.join(__dirname, 'public', 'reading.mp3');
    const dest = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
      elevenRes.body.pipe(dest);
      elevenRes.body.on('end', resolve);
      elevenRes.body.on('error', reject);
    });

    const twiml = `
      <Response>
        <Play>https://psychic-backend.onrender.com/reading.mp3</Play>
      </Response>
    `;

    res.set('Content-Type', 'text/xml');
    res.send(twiml);

  } catch (error) {
    console.error('AI error:', error);
    res.set('Content-Type', 'text/xml');
    res.send(`<Response><Say>Something went wrong. Please try again later.</Say></Response>`);
  }
});

