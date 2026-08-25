const express = require('express');
const router = express.Router();
const db = require('../db');

// POST
router.post('/', async (req, res) => {
    const { nombre, email } = req.body;

    if (!nombre || !email) {
        return res.status(400).json({ error: 'nombre y email son obligatorios' });
    }

    try {
        const [resultado] = await db.execute(
            'INSERT INTO tecnico (nombre, email) VALUES (?, ?)',
            [nombre, email]
        );
        res.status(201).json({ id_tecnico: resultado.insertId, nombre, email });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ese email ya está registrado' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});


// GET
router.get('/', async (req, res) => {
    const {
        nombre, email,
        orden = 'nombre', direccion = 'ASC'
    } = req.query;

    const camposValidos = ['nombre', 'email'];
    const campoOrden = camposValidos.includes(orden) ? orden : 'nombre';
    const dir = direccion.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const condiciones = [];
    const valores = [];

    if (nombre) { condiciones.push('nombre LIKE ?'); valores.push(`%${nombre}%`); }
    if (email)  { condiciones.push('email LIKE ?');  valores.push(`%${email}%`); }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const [filas] = await db.execute(`
            SELECT nombre, email
            FROM tecnico
            ${where}
            ORDER BY ${campoOrden} ${dir}
        `, valores);
        res.json(filas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

module.exports = router;