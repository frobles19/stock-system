const express = require('express');
const router = express.Router();
const db = require('../db');

// POST
router.post('/', async (req, res) => {
    const { id_sistema, descripcion } = req.body;

    if (!id_sistema || !descripcion) {
        return res.status(400).json({ error: 'id_sistema y descripcion son obligatorios' });
    }

    try {
        const [resultado] = await db.execute(
            'INSERT INTO modelo (id_sistema, descripcion) VALUES (?, ?)',
            [id_sistema, descripcion]
        );
        res.status(201).json({ id_modelo: resultado.insertId, id_sistema, descripcion });
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'El sistema indicado no existe' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// GET
router.get('/', async (req, res) => {
    const {
        id_modelo, sistema, descripcion,
        orden = 'id_modelo', direccion = 'DESC'
    } = req.query;

    const camposValidos = ['id_modelo', 'sistema', 'descripcion'];
    const campoOrden = camposValidos.includes(orden) ? orden : 'id_modelo';
    const dir = direccion.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const condiciones = [];
    const valores = [];

    if (id_modelo)   { condiciones.push('mo.id_modelo LIKE ?');    valores.push(`%${id_modelo}%`); }
    if (sistema)     { condiciones.push('si.descripcion LIKE ?');  valores.push(`%${sistema}%`); }
    if (descripcion) { condiciones.push('mo.descripcion LIKE ?');  valores.push(`%${descripcion}%`); }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const [filas] = await db.execute(`
            SELECT
                mo.id_modelo,
                si.descripcion AS sistema,
                mo.descripcion
            FROM modelo mo
            JOIN sistema si ON mo.id_sistema = si.id_sistema
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