const mysql = require('mysql2');
require('dotenv').config();

// createConnection மாத்து → createPool use பண்ணு
const db = mysql.createPool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ MySQL Connection Failed:', err.message);
        return;
    }
    console.log('✅ MySQL Connected Successfully!');
    connection.release();
});

module.exports = db;