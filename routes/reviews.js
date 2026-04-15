// ================================================
// routes/reviews.js — Ratings & Reviews
// ================================================
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const jwt     = require('jsonwebtoken');

function query(sql, vals) {
    return new Promise((resolve, reject) => {
        db.query(sql, vals || [], (err, results) => {
            if (err) reject(err); else resolve(results);
        });
    });
}
function auth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header) return res.json({ success: false, message: 'No token' });
    const token = header.split(' ')[1];
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
    catch(e) { return res.json({ success: false, message: 'Invalid token' }); }
}

// POST /api/reviews/submit
router.post('/submit', auth, async (req, res) => {
    try {
        const { booking_id, worker_id, rating, comment } = req.body;
        const customer_id = req.user.id;

        if (!worker_id || !rating)
            return res.json({ success: false, message: 'worker_id and rating are required' });
        if (rating < 1 || rating > 5)
            return res.json({ success: false, message: 'Rating must be 1–5' });

        // If booking_id is provided and non-zero, verify it belongs to this customer
        if (booking_id && booking_id !== 0) {
            const bookings = await query(
                'SELECT id FROM bookings WHERE id=? AND customer_id=?',
                [booking_id, customer_id]
            );
            if (!bookings.length)
                return res.json({ success: false, message: 'Booking not found' });
        }

        // Check if already reviewed this worker
        const existing = await query(
            'SELECT id FROM reviews WHERE worker_id=? AND customer_id=?',
            [worker_id, customer_id]
        );
        if (existing.length)
            return res.json({ success: false, message: 'You already reviewed this worker' });

        // Get customer name
        const custs = await query('SELECT full_name FROM customers WHERE id=?', [customer_id]);
        const customer_name = custs.length ? custs[0].full_name : 'Customer';

        // Get worker name and category for review record
        const workers = await query('SELECT full_name, category FROM workers WHERE id=?', [worker_id]);
        const worker_name     = workers.length ? workers[0].full_name : 'Worker';
        const worker_category = workers.length ? workers[0].category  : '';

        await query(
            `INSERT INTO reviews (booking_id, worker_id, customer_id, customer_name,
             worker_name, worker_category, rating, comment)
             VALUES (?,?,?,?,?,?,?,?)`,
            [booking_id||0, worker_id, customer_id, customer_name,
             worker_name, worker_category, rating, comment||'']
        );

        // Update worker avg_rating
        const avgRows = await query(
            'SELECT AVG(rating) AS avg_rating, COUNT(*) AS total FROM reviews WHERE worker_id=?',
            [worker_id]
        );
        if (avgRows.length) {
            const avg = parseFloat(avgRows[0].avg_rating).toFixed(2);
            try {
                await query('UPDATE workers SET avg_rating=?, total_reviews=? WHERE id=?',
                    [avg, avgRows[0].total, worker_id]);
            } catch(e) { /* columns may not exist */ }
        }

        res.json({ success: true, message: 'Review submitted!' });
    } catch(err) {
        console.error('Review submit error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

// GET /api/reviews/worker/:id  — all reviews for a worker (public)
router.get('/worker/:id', async (req, res) => {
    try {
        const reviews = await query(
            'SELECT * FROM reviews WHERE worker_id=? ORDER BY created_at DESC',
            [req.params.id]
        );
        const avgRows = await query(
            'SELECT AVG(rating) AS avg_rating, COUNT(*) AS total FROM reviews WHERE worker_id=?',
            [req.params.id]
        );
        res.json({
            success: true,
            reviews,
            avg_rating: avgRows[0].avg_rating ? parseFloat(avgRows[0].avg_rating).toFixed(1) : null,
            total: avgRows[0].total
        });
    } catch(err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

// GET /api/reviews/my  — reviews written by this customer
router.get('/my', auth, async (req, res) => {
    try {
        const reviews = await query(
            'SELECT * FROM reviews WHERE customer_id=? ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json({ success: true, reviews });
    } catch(err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

// GET /api/reviews/pending  — completed bookings not yet reviewed
router.get('/pending', auth, async (req, res) => {
    try {
        const rows = await query(
            `SELECT b.*, w.full_name AS worker_full_name, w.category AS worker_category,
                    w.profile_photo AS worker_photo
             FROM bookings b
             JOIN workers w ON b.worker_id = w.id
             WHERE b.customer_id=? AND b.status='completed'
               AND b.worker_id NOT IN (
                   SELECT worker_id FROM reviews WHERE customer_id=?
               )
             ORDER BY b.created_at DESC`,
            [req.user.id, req.user.id]
        );
        res.json({ success: true, bookings: rows });
    } catch(err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

// GET /api/reviews/received  — reviews received by a worker
router.get('/received', auth, async (req, res) => {
    try {
        const reviews = await query(
            'SELECT * FROM reviews WHERE worker_id=? ORDER BY created_at DESC',
            [req.user.id]
        );
        const avgRows = await query(
            'SELECT AVG(rating) AS avg_rating, COUNT(*) AS total FROM reviews WHERE worker_id=?',
            [req.user.id]
        );
        res.json({
            success: true,
            reviews,
            avg_rating: avgRows[0].avg_rating ? parseFloat(avgRows[0].avg_rating).toFixed(1) : null,
            total: avgRows[0].total
        });
    } catch(err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

module.exports = router;