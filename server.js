// ================================================
// server.js — Main Express Server
// ================================================
const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/customer', require('./routes/customer'));
app.use('/api/worker',   require('./routes/worker'));
app.use('/api/booking',  require('./routes/Booking'));
app.use('/api/admin',    require('./routes/Admin'));     // ← NEW
app.use('/api/reviews', require('./routes/reviews'));


// Test route
app.get('/', (req, res) => {
    res.json({ message: '✅ Local Skill Finder Backend Running!' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});