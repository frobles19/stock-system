const express = require('express');
const router = express.Router();
const db = require('../db');

// POST
router.post('/', async (req, res) => {
    const { descripcion } = req.body;

    if (!descripcion) {
        return res.status(400).json({ error: 'La descripcion es obligatoria' });
    }

    try {
        const [resultado] = await db.execute(
            'INSERT INTO sistema (descripcion) VALUES (?)',
            [descripcion]
        );
        res.status(201).json({ id_sistema: resultado.insertId, descripcion });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Esa descripcion ya está registrada' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// GET
router.get('/', async (req, res) => {
    const {
        descripcion,
        orden = 'id_sistema', direccion = 'ASC'
    } = req.query;

    const camposValidos = ['id_sistema', 'descripcion'];
    const campoOrden = camposValidos.includes(orden) ? orden : 'id_sistema';
    const dir = direccion.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const condiciones = [];
    const valores = [];

    if (descripcion) { condiciones.push('descripcion LIKE ?'); valores.push(`%${descripcion}%`); }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const [filas] = await db.execute(`
            SELECT id_sistema, descripcion
            FROM sistema
            ${where}
            ORDER BY 
                CASE WHEN descripcion = 'HERRAMIENTAS' THEN 1 ELSE 0 END,
                ${campoOrden} ${dir}
        `, valores);
        res.json(filas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

module.exports = router;