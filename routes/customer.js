// ================================================
// routes/customer.js — Customer Register, Login & Profile
// ================================================
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');

// ── Middleware: Token verify ──────────────────────
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token      = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch(err) {
        return res.status(403).json({ success: false, message: 'Invalid token' });
    }
}

// ── POST /api/customer/register ──────────────────
router.post('/register', async (req, res) => {
    try {
        const { full_name, phone, email, password, address, city, pincode } = req.body;
        if (!full_name || !phone || !email || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        db.query('SELECT id FROM customers WHERE email = ?', [email], async (err, results) => {
            if (err) return res.status(500).json({ success: false, message: 'Database error' });
            if (results.length > 0) return res.status(400).json({ success: false, message: 'Email already registered!' });
            const hashedPassword = await bcrypt.hash(password, 10);
            const sql = `INSERT INTO customers (full_name, phone, email, password, address, city, pincode) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            db.query(sql, [full_name, phone, email, hashedPassword, address, city, pincode], (err, result) => {
                if (err) return res.status(500).json({ success: false, message: 'Registration failed' });
                const token = jwt.sign({ id: result.insertId, role: 'customer', email }, process.env.JWT_SECRET, { expiresIn: '7d' });
                res.json({ success: true, message: 'Customer registered successfully!', token,
                    user: { id: result.insertId, full_name, email, phone, city, role: 'customer' } });
            });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── POST /api/customer/login ──────────────────────
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
    db.query('SELECT * FROM customers WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        if (results.length === 0) return res.status(401).json({ success: false, message: 'Invalid email or password' });
        const customer = results[0];
        const isMatch  = await bcrypt.compare(password, customer.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid email or password' });
        const token = jwt.sign({ id: customer.id, role: 'customer', email: customer.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Login successful!', token,
            user: { id: customer.id, full_name: customer.full_name, email: customer.email, phone: customer.phone, city: customer.city, role: 'customer' } });
    });
});

// ── GET /api/customer/profile ─────────────────────
router.get('/profile', verifyToken, (req, res) => {
    db.query(
        'SELECT id, full_name, phone, email, address, city, pincode, created_at FROM customers WHERE id = ?',
        [req.user.id],
        (err, results) => {
            if (err) return res.status(500).json({ success: false, message: 'Database error' });
            if (results.length === 0) return res.status(404).json({ success: false, message: 'Customer not found' });
            res.json({ success: true, customer: results[0] });
        }
    );
});

module.exports = router;