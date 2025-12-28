const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve public files (like reading.mp3)
app.use(express.static(path.join(__dirname, 'public')));

// Default homepage (just for fun)
app.get('/', (req, res) => {
  res.send(`<h2>This is your AI Psychic. Let me look into the energy...</h2>`);
});

// Main route triggered by PBX
app.post('/voice', async (req, res) => {
  try {
    // 1. Get a psychic reading from OpenAI
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
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

    // 2. Send the reading to ElevenLabs
    const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
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

    // 3. Save the audio stream to reading.mp3
    const filePath = path.join(__dirname, 'public', 'reading.mp3');
    const fileStream = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
      elevenRes.body.pipe(fileStream);
      elevenRes.body.on('end', resolve);
      elevenRes.body.on('error', reject);
    });

    // 4. Send TwiML to PBX to play the file
    const twiml = `
      <Response>
        <Play>https://psychic-backend.onrender.com/reading.mp3</Play>
      </Response>
    `;

    res.set('Content-Type', 'text/xml');
    res.send(twiml);

  } catch (err) {
    console.error('Error:', err);
    res.set('Content-Type', 'text/xml');
    res.send(`<Response><Say>Something went wrong. Please try again later.</Say></Response>`);
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
app.post('/twilio/answer', (req, res) => {
  res.type('text/xml');
  res.send(`
    <Response>
      <Say voice="alice">
        Hello. This is a Twilio test call. Can you hear me?
      </Say>
    </Response>
  `);
});
