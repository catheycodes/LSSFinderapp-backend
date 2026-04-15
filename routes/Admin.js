// ================================================
// routes/admin.js — Admin Routes for Local Skill Finder
// ================================================
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const jwt     = require('jsonwebtoken');

function query(sql, vals) {
    return new Promise((resolve, reject) => {
        db.query(sql, vals || [], (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

function adminAuth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header) return res.json({ success: false, message: 'No token provided' });
    const token = header.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'admin')
            return res.json({ success: false, message: 'Admin access required' });
        req.user = decoded;
        next();
    } catch(e) {
        return res.json({ success: false, message: 'Invalid token' });
    }
}

// POST /api/admin/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@localskill.com';
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
        if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD)
            return res.json({ success: false, message: 'Invalid admin credentials' });
        const token = jwt.sign({ id: 0, email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { email, role: 'admin', full_name: 'Admin' } });
    } catch(err) {
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

// GET /api/admin/stats
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const [wTotal] = await query('SELECT COUNT(*) AS cnt FROM workers');
        const [cTotal] = await query('SELECT COUNT(*) AS cnt FROM customers');
        const [bTotal] = await query('SELECT COUNT(*) AS cnt FROM bookings');

        let wPending = 0, wApproved = 0;
        try {
            const [wp] = await query("SELECT COUNT(*) AS cnt FROM workers WHERE status = 'pending'");
            const [wa] = await query("SELECT COUNT(*) AS cnt FROM workers WHERE status = 'approved'");
            wPending = wp.cnt; wApproved = wa.cnt;
        } catch(e) { wPending = wTotal.cnt; }

        let bPending=0, bConfirmed=0, bCompleted=0, bCancelled=0;
        try {
            const [bp] = await query("SELECT COUNT(*) AS cnt FROM bookings WHERE status='pending'");
            const [bc] = await query("SELECT COUNT(*) AS cnt FROM bookings WHERE status='confirmed'");
            const [bd] = await query("SELECT COUNT(*) AS cnt FROM bookings WHERE status='completed'");
            const [bx] = await query("SELECT COUNT(*) AS cnt FROM bookings WHERE status='cancelled'");
            bPending=bp.cnt; bConfirmed=bc.cnt; bCompleted=bd.cnt; bCancelled=bx.cnt;
        } catch(e) {}

        res.json({ success: true, stats: {
            workers:   { total: wTotal.cnt, pending: wPending, approved: wApproved },
            customers: { total: cTotal.cnt },
            bookings:  { total: bTotal.cnt, pending: bPending, confirmed: bConfirmed, completed: bCompleted, cancelled: bCancelled }
        }});
    } catch(err) {
        console.error('Admin stats error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

// GET /api/admin/workers
router.get('/workers', adminAuth, async (req, res) => {
    try {
        let workers;
        try {
            workers = await query('SELECT id,full_name,email,phone,city,category,experience,min_price,max_price,status,created_at FROM workers ORDER BY created_at DESC');
        } catch(e) {
            workers = await query('SELECT id,full_name,email,phone,city,category,experience,min_price,max_price,created_at FROM workers ORDER BY created_at DESC');
            workers = workers.map(w => ({ ...w, status: 'pending' }));
        }
        console.log('[ADMIN] Workers fetched:', workers.length);
        res.json({ success: true, workers });
    } catch(err) {
        console.error('Admin workers error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

// PUT /api/admin/worker/status
router.put('/worker/status', adminAuth, async (req, res) => {
    try {
        const { worker_id, status } = req.body;
        if (!['approved', 'rejected', 'pending'].includes(status))
            return res.json({ success: false, message: 'Invalid status value' });

        // Try to add column without IF NOT EXISTS (compatible with MySQL 8.0 on Windows)
        // The catch silently handles "duplicate column" error (Error Code 1060)
        try {
            await query("ALTER TABLE workers ADD COLUMN status VARCHAR(20) DEFAULT 'pending'");
        } catch(e) { /* column already exists — safe to ignore */ }

        const result = await query('UPDATE workers SET status = ? WHERE id = ?', [status, worker_id]);
        if (result.affectedRows === 0)
            return res.json({ success: false, message: 'Worker not found' });

        res.json({ success: true, message: 'Worker status updated to ' + status });
    } catch(err) {
        console.error('Worker status error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

// GET /api/admin/customers
router.get('/customers', adminAuth, async (req, res) => {
    try {
        let customers;
        try {
            customers = await query('SELECT id,full_name,email,phone,city,pincode,status,created_at FROM customers ORDER BY created_at DESC');
        } catch(e) {
            customers = await query('SELECT id,full_name,email,phone,city,pincode,created_at FROM customers ORDER BY created_at DESC');
            customers = customers.map(c => ({ ...c, status: 'active' }));
        }
        console.log('[ADMIN] Customers fetched:', customers.length);
        res.json({ success: true, customers });
    } catch(err) {
        console.error('Admin customers error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

// PUT /api/admin/customer/block
router.put('/customer/block', adminAuth, async (req, res) => {
    try {
        const { customer_id, status } = req.body;
        if (!['active', 'blocked'].includes(status))
            return res.json({ success: false, message: 'Invalid status value' });

        // Try to add column without IF NOT EXISTS (compatible with MySQL 8.0 on Windows)
        // The catch silently handles "duplicate column" error (Error Code 1060)
        try {
            await query("ALTER TABLE customers ADD COLUMN status VARCHAR(20) DEFAULT 'active'");
        } catch(e) { /* column already exists — safe to ignore */ }

        const result = await query('UPDATE customers SET status = ? WHERE id = ?', [status, customer_id]);
        if (result.affectedRows === 0)
            return res.json({ success: false, message: 'Customer not found' });

        res.json({ success: true, message: 'Customer status updated to ' + status });
    } catch(err) {
        console.error('Customer block error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

// GET /api/admin/bookings
router.get('/bookings', adminAuth, async (req, res) => {
    try {
        const { status } = req.query;
        let sql = 'SELECT * FROM bookings';
        const vals = [];
        if (status) { sql += ' WHERE status = ?'; vals.push(status); }
        sql += ' ORDER BY created_at DESC';
        const bookings = await query(sql, vals);
        console.log('[ADMIN] Bookings fetched:', bookings.length);
        res.json({ success: true, bookings });
    } catch(err) {
        console.error('Admin bookings error:', err);
        res.json({ success: false, message: 'Server error: ' + err.message });
    }
});

module.exports = router;