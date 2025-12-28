const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;

// Twilio sends form-encoded data
app.use(express.urlencoded({ extended: false }));

// Health check
app.get('/', (req, res) => {
  res.send('Psychic backend is running.');
});

// Twilio voice entry point
app.post('/twilio/answer', async (req, res) => {
  try {
    const openaiResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
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
                'You are a warm, reassuring psychic. Speak calmly, kindly, and with emotional presence.',
            },
            {
              role: 'user',
              content:
                'Give a short comforting message to someone who is feeling uncertain about love.',
            },
          ],
          temperature: 0.8,
          max_tokens: 120,
        }),
      }
    );

    const data = await openaiResponse.json();
    const message =
      data?.choices?.[0]?.message?.content ||
      'I feel a gentle shift coming for you. You are not alone, and clarity is closer than you think.';

    res.type('text/xml');
    res.send(`
      <Response>
        <Say voice="alice">
          ${message}
        </Say>
      </Response>
    `);
  } catch (error) {
    console.error('OpenAI error:', error);

    res.type('text/xml');
    res.send(`
      <Response>
        <Say voice="alice">
          I’m here with you. Even when answers feel quiet, trust that things are still unfolding in your favor.
        </Say>
      </Response>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
