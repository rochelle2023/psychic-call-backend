const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;

// Twilio sends application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

// Root route (optional sanity check)
app.get('/', (req, res) => {
  res.send('Psychic backend is running.');
});

// ✅ TWILIO TEST ROUTE — THIS IS ALL WE ARE TESTING
app.post('/twilio/answer', (req, res) => {
  res.type('text/xml');
  res.send(`
    <Response>
      <Say voice="alice">
        Hello. This is a Twilio test call.
        If you can hear this, your phone system is working.
      </Say>
    </Response>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
