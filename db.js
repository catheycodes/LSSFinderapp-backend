// ================================================
// db.js — MySQL Database Connection
// ================================================
const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || 'cathrin@583pal',   // உன் MySQL password இங்க
    database: process.env.DB_NAME     || 'localskillfinderdb'
});

db.connect((err) => {
    if (err) {
        console.error('❌ MySQL Connection Failed:', err.message);
        return;
    }
    console.log('✅ MySQL Connected Successfully!');
});

module.exports = db;