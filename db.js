const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: 'localhost',
    user: 'admin_taller',
    password: 'eana123',
    database: 'stock_laboratorio'
});

module.exports = db;