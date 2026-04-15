const express = require('express');
const router  = express.Router();
const db      = require('../db');
const jwt     = require('jsonwebtoken');

function auth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header) return res.json({ success: false, message: 'No token' });
    const token = header.split(' ')[1];
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
    catch(e) { return res.json({ success: false, message: 'Invalid token' }); }
}

function query(sql, vals) {
    return new Promise((resolve, reject) => {
        db.query(sql, vals, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

/* ── POST /api/booking/create ── */
router.post('/create', auth, async (req, res) => {
    try {
        const customerId = req.user.id;
        const {
            worker_id, worker_name, worker_category,
            customer_name, customer_phone, description,
            preferred_date, preferred_time, urgency,
            address, landmark, notes,
            customer_amount   // ← NEW: amount customer agrees to pay
        } = req.body;

        if (!worker_id)      return res.json({ success: false, message: 'worker_id is required' });
        if (!customer_name)  return res.json({ success: false, message: 'customer_name is required' });
        if (!preferred_date) return res.json({ success: false, message: 'preferred_date is required' });

        const workerRows = await query('SELECT id FROM workers WHERE id = ?', [worker_id]);
        if (!workerRows.length)
            return res.json({ success: false, message: 'Worker not found: ' + worker_id });

        const result = await query(
            `INSERT INTO bookings
             (customer_id, worker_id, worker_name, worker_category,
              customer_name, customer_phone, description, preferred_date, preferred_time,
              urgency, address, landmark, notes, status, customer_amount, amount_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'pending')`,
            [
                customerId, worker_id, worker_name || '', worker_category || '',
                customer_name, customer_phone || '', description || '',
                preferred_date, preferred_time || '09:00', urgency || 'normal',
                address || '', landmark || '', notes || '',
                customer_amount || null    // ← save amount
            ]
        );

        console.log(`[BOOKING] Created #${result.insertId} — customer_id=${customerId}, worker_id=${worker_id}, amount=₹${customer_amount}`);
        res.json({ success: true, message: 'Booking created!', booking_id: result.insertId });

    } catch (err) {
        console.error('Booking create error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ── GET /api/booking/my  (customer sees their bookings) ── */
router.get('/my', auth, async (req, res) => {
    try {
        const rows = await query(
            'SELECT * FROM bookings WHERE customer_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json({ success: true, bookings: rows });
    } catch (err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ── GET /api/booking/worker  (worker sees requests) ── */
router.get('/worker', auth, async (req, res) => {
    try {
        const workerId = req.user.id;
        const role     = req.user.role;

        console.log(`[BOOKING/WORKER] id=${workerId}, role=${role}`);

        if (role !== 'worker')
            return res.json({ success: false, message: 'Access denied. Worker role required.' });

        const rows = await query(
            'SELECT * FROM bookings WHERE worker_id = ? ORDER BY created_at DESC',
            [workerId]
        );
        console.log(`[BOOKING/WORKER] Found ${rows.length} bookings`);

        if (rows.length === 0 && req.user.email) {
            const workerByEmail = await query('SELECT id FROM workers WHERE email = ?', [req.user.email]);
            if (workerByEmail.length > 0 && workerByEmail[0].id !== workerId) {
                const fallbackRows = await query(
                    'SELECT * FROM bookings WHERE worker_id = ? ORDER BY created_at DESC',
                    [workerByEmail[0].id]
                );
                return res.json({ success: true, bookings: fallbackRows, _note: 'fallback_id_used' });
            }
        }

        res.json({ success: true, bookings: rows });
    } catch (err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ── PUT /api/booking/amount-accept  (worker accepts/negotiates amount) ── NEW */
router.put('/amount-accept', auth, async (req, res) => {
    try {
        const { booking_id, amount_status } = req.body;
        // amount_status: 'accepted' | 'negotiating'
        if (!['accepted', 'negotiating'].includes(amount_status))
            return res.json({ success: false, message: 'Invalid amount_status' });

        const result = await query(
            'UPDATE bookings SET amount_status = ? WHERE id = ? AND worker_id = ?',
            [amount_status, booking_id, req.user.id]
        );

        // Fallback for email mismatch
        if (result.affectedRows === 0 && req.user.email) {
            const wb = await query('SELECT id FROM workers WHERE email = ?', [req.user.email]);
            if (wb.length > 0) {
                const fr = await query(
                    'UPDATE bookings SET amount_status = ? WHERE id = ? AND worker_id = ?',
                    [amount_status, booking_id, wb[0].id]
                );
                if (fr.affectedRows > 0)
                    return res.json({ success: true, message: 'Amount status updated!' });
            }
            return res.json({ success: false, message: 'Booking not found or not authorized' });
        }
        if (result.affectedRows === 0)
            return res.json({ success: false, message: 'Booking not found or not authorized' });

        res.json({ success: true, message: 'Amount status updated!' });
    } catch (err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ── GET /api/booking/debug ── */
router.get('/debug', auth, async (req, res) => {
    try {
        const tokenUser    = req.user;
        const workerById   = await query('SELECT id, email, full_name FROM workers WHERE id = ?', [tokenUser.id]);
        const bookingsById = await query('SELECT id, worker_id, customer_name, status, customer_amount, amount_status FROM bookings WHERE worker_id = ?', [tokenUser.id]);
        res.json({ token_payload: tokenUser, worker_found_by_token_id: workerById, bookings_found_by_token_id: bookingsById });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

/* ── PUT /api/booking/status  (worker updates booking status) ── */
router.put('/status', auth, async (req, res) => {
    try {
        const { booking_id, status } = req.body;
        if (!['confirmed', 'completed', 'cancelled'].includes(status))
            return res.json({ success: false, message: 'Invalid status' });

        const result = await query(
            'UPDATE bookings SET status = ? WHERE id = ? AND worker_id = ?',
            [status, booking_id, req.user.id]
        );

        if (result.affectedRows === 0 && req.user.email) {
            const wb = await query('SELECT id FROM workers WHERE email = ?', [req.user.email]);
            if (wb.length > 0) {
                const fr = await query(
                    'UPDATE bookings SET status = ? WHERE id = ? AND worker_id = ?',
                    [status, booking_id, wb[0].id]
                );
                if (fr.affectedRows > 0) return res.json({ success: true, message: 'Status updated!' });
            }
            return res.json({ success: false, message: 'Booking not found or not authorized' });
        }
        if (result.affectedRows === 0)
            return res.json({ success: false, message: 'Booking not found or not authorized' });

        res.json({ success: true, message: 'Status updated!' });
    } catch (err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ── PUT /api/booking/update/:id ── */
router.put('/update/:id', auth, async (req, res) => {
    try {
        const { description, preferred_date, preferred_time, address, notes, customer_amount } = req.body;
        const result = await query(
            `UPDATE bookings SET description=?, preferred_date=?, preferred_time=?,
             address=?, notes=?, customer_amount=?, amount_status='pending'
             WHERE id=? AND customer_id=? AND status='pending'`,
            [description, preferred_date, preferred_time, address, notes,
             customer_amount || null, req.params.id, req.user.id]
        );
        if (result.affectedRows === 0)
            return res.json({ success: false, message: 'Cannot update booking' });
        res.json({ success: true, message: 'Booking updated!' });
    } catch (err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ── PUT /api/booking/cancel/:id ── */
router.put('/cancel/:id', auth, async (req, res) => {
    try {
        const result = await query(
            `UPDATE bookings SET status='cancelled'
             WHERE id=? AND customer_id=? AND status IN ('pending','confirmed')`,
            [req.params.id, req.user.id]
        );
        if (result.affectedRows === 0)
            return res.json({ success: false, message: 'Cannot cancel' });
        res.json({ success: true, message: 'Booking cancelled!' });
    } catch (err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ── GET /api/booking/:id ── */
router.get('/:id', auth, async (req, res) => {
    try {
        const rows = await query('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.json({ success: false, message: 'Booking not found' });
        res.json({ success: true, booking: rows[0] });
    } catch (err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

module.exports = router;