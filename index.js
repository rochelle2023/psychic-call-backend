app.post('/voice', (req, res) => {
  const twiml = `
    <Response>
      <Say>Hello. This is your AI Psychic speaking. Let me check the energy real quick.</Say>
    </Response>
  `;
  res.type('text/xml');
  res.send(twiml);
});
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('AI Psychic backend is running!');
});

app.post('/voice', (req, res) => {
  const twiml = `
    <Response>
      <Say>Hello. This is your AI Psychic. Let me look into the energy for a moment...</Say>
    </Response>
  `;
  res.type('text/xml');
  res.send(twiml);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

