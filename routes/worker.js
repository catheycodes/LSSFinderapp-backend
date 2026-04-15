const express = require('express');
const router  = express.Router();
const db      = require('../db');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

function auth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header) return res.json({ success: false, message: 'No token provided' });
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

/* ────────────────────────────────────────────────
   POST /api/worker/register
──────────────────────────────────────────────── */
router.post('/register', async (req, res) => {
    try {
        const {
            full_name, phone, email, password, address, city, pincode,
            category, experience, min_price, max_price, skills, description,
            availability, start_time, end_time, profile_photo, work_images,
            payment_qr   // { qr_image: "base64...", upi_id: "xxx@upi" }
        } = req.body;

        if (!full_name || !email || !password || !phone)
            return res.json({ success: false, message: 'Required fields missing' });

        const existing = await query('SELECT id FROM workers WHERE email = ?', [email]);
        if (existing.length > 0)
            return res.json({ success: false, message: 'Email already registered' });

        const hashed   = await bcrypt.hash(password, 10);
        const availStr = Array.isArray(availability) ? availability.join(',') : (availability || '');

        // Serialize payment_qr object → JSON string for DB storage
        const paymentQrStr = payment_qr && (payment_qr.qr_image || payment_qr.upi_id)
            ? JSON.stringify(payment_qr)
            : null;

        // Ensure status column exists (safe to run every time)
        try {
            await query("ALTER TABLE workers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'");
        } catch(e) { /* column already exists — ignore */ }

        const result = await query(
            `INSERT INTO workers
             (full_name, phone, email, password, address, city, pincode,
              category, experience, min_price, max_price, skills, description,
              availability, start_time, end_time, profile_photo, payment_qr, status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                full_name, phone, email, hashed,
                address || '', city || '', pincode || '',
                category || '', experience || 0,
                min_price || 0, max_price || 0,
                skills || '', description || '',
                availStr,
                start_time || '08:00', end_time || '18:00',
                profile_photo || '',
                paymentQrStr,
                'pending'   // all new workers start as pending
            ]
        );

        const workerId = result.insertId;

        if (work_images && work_images.length > 0) {
            for (const img of work_images) {
                if (img) await query(
                    'INSERT INTO worker_images (worker_id, image_data) VALUES (?,?)',
                    [workerId, img]
                );
            }
        }

        const token = jwt.sign(
            { id: workerId, email, role: 'worker' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true, token,
            user: {
                id: workerId, full_name, email, phone,
                city, category, role: 'worker',
                status: 'pending',
                payment_qr: payment_qr || null
            }
        });

    } catch(err) {
        console.error('Worker register error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ────────────────────────────────────────────────
   POST /api/worker/login
──────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.json({ success: false, message: 'Email and password required' });

        const rows = await query('SELECT * FROM workers WHERE email = ?', [email]);
        if (!rows.length)
            return res.json({ success: false, message: 'Email not found' });

        const worker = rows[0];
        const match  = await bcrypt.compare(password, worker.password);
        if (!match)
            return res.json({ success: false, message: 'Incorrect password' });

        const token = jwt.sign(
            { id: worker.id, email: worker.email, role: 'worker' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true, token,
            user: {
                id:        worker.id,
                full_name: worker.full_name,
                email:     worker.email,
                phone:     worker.phone,
                city:      worker.city,
                category:  worker.category,
                status:    worker.status || 'pending',
                role:      'worker'
            }
        });

    } catch(err) {
        console.error('Worker login error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ────────────────────────────────────────────────
   GET /api/worker/profile
──────────────────────────────────────────────── */
router.get('/profile', auth, async (req, res) => {
    try {
        const rows = await query('SELECT * FROM workers WHERE id = ?', [req.user.id]);
        if (!rows.length)
            return res.json({ success: false, message: 'Worker not found' });

        const worker = { ...rows[0] };
        delete worker.password;

        // Parse payment_qr JSON string → object
        if (typeof worker.payment_qr === 'string') {
            try { worker.payment_qr = JSON.parse(worker.payment_qr); }
            catch(e) { worker.payment_qr = null; }
        }

        // Ensure status field is always present
        worker.status = worker.status || 'pending';

        const imgs = await query(
            'SELECT image_data FROM worker_images WHERE worker_id = ?',
            [req.user.id]
        );
        worker.work_images = imgs.map(r => r.image_data);

        if (typeof worker.availability === 'string')
            worker.availability = worker.availability ? worker.availability.split(',') : [];

        res.json({ success: true, worker });

    } catch(err) {
        console.error('Worker profile error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ────────────────────────────────────────────────
   PUT /api/worker/update
──────────────────────────────────────────────── */
router.put('/update', auth, async (req, res) => {
    try {
        const {
            full_name, phone, address, city, pincode,
            category, experience, min_price, max_price,
            skills, description, availability,
            start_time, end_time, profile_photo,
            work_images, payment_qr
        } = req.body;

        const availStr = Array.isArray(availability)
            ? availability.join(',')
            : (availability || '');

        const paymentQrStr = payment_qr && (payment_qr.qr_image || payment_qr.upi_id)
            ? JSON.stringify(payment_qr)
            : null;

        await query(
            `UPDATE workers SET
             full_name=?, phone=?, address=?, city=?, pincode=?,
             category=?, experience=?, min_price=?, max_price=?,
             skills=?, description=?, availability=?,
             start_time=?, end_time=?, profile_photo=?,
             payment_qr=?
             WHERE id=?`,
            [
                full_name, phone, address, city, pincode,
                category, experience, min_price, max_price,
                skills, description, availStr,
                start_time, end_time, profile_photo || '',
                paymentQrStr,
                req.user.id
            ]
        );

        if (work_images && work_images.length > 0) {
            await query('DELETE FROM worker_images WHERE worker_id = ?', [req.user.id]);
            for (const img of work_images) {
                if (img) await query(
                    'INSERT INTO worker_images (worker_id, image_data) VALUES (?,?)',
                    [req.user.id, img]
                );
            }
        }

        res.json({ success: true, message: 'Profile updated!' });

    } catch(err) {
        console.error('Worker update error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ────────────────────────────────────────────────
   GET /api/worker/list
   ► Only returns APPROVED workers so unapproved
     workers are never visible on the user dashboard.
──────────────────────────────────────────────── */
router.get('/list', async (req, res) => {
    try {
        const { city, category } = req.query;

        // Base query: only approved workers are shown to customers
        let sql    = "SELECT * FROM workers WHERE status = 'approved'";
        const vals = [];

        if (city) {
            sql += ' AND LOWER(city) LIKE ?';
            vals.push('%' + city.toLowerCase() + '%');
        }
        if (category) {
            sql += ' AND LOWER(category) LIKE ?';
            vals.push('%' + category.toLowerCase() + '%');
        }
        sql += ' ORDER BY created_at DESC';

        const rows = await query(sql, vals);

        const workers = rows.map(w => {
            const o = { ...w };
            delete o.password;

            // Parse payment_qr
            if (typeof o.payment_qr === 'string') {
                try { o.payment_qr = JSON.parse(o.payment_qr); }
                catch(e) { o.payment_qr = null; }
            }

            if (typeof o.availability === 'string')
                o.availability = o.availability ? o.availability.split(',') : [];

            return o;
        });

        res.json({ success: true, workers });

    } catch(err) {
        console.error('Worker list error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

/* ────────────────────────────────────────────────
   GET /api/worker/view/:id
   ► Returns any worker by ID (for profile pages).
     The status field is included so the frontend
     can show approval state if needed.
──────────────────────────────────────────────── */
router.get('/view/:id', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM workers WHERE id = ?', [req.params.id]);
        if (!rows.length)
            return res.json({ success: false, message: 'Worker not found' });

        const worker = { ...rows[0] };
        delete worker.password;

        // Parse payment_qr JSON string → object
        if (typeof worker.payment_qr === 'string') {
            try { worker.payment_qr = JSON.parse(worker.payment_qr); }
            catch(e) { worker.payment_qr = null; }
        }

        // Ensure status is always present
        worker.status = worker.status || 'pending';

        const imgs = await query(
            'SELECT image_data FROM worker_images WHERE worker_id = ?',
            [req.params.id]
        );
        worker.work_images = imgs.map(r => r.image_data);

        if (typeof worker.availability === 'string')
            worker.availability = worker.availability ? worker.availability.split(',') : [];

        res.json({ success: true, worker });

    } catch(err) {
        console.error('Worker view error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

module.exports = router;