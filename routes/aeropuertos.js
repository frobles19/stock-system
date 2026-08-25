const express = require('express');
const router = express.Router();
const db = require('../db');

// POST
router.post('/', async (req, res) => {
    const { nombre, codigo, id_region } = req.body;

    if (!nombre || !codigo || !id_region) {
        return res.status(400).json({ error: 'nombre, codigo e id_region son obligatorios' });
    }

    if (codigo.length !== 3) {
        return res.status(400).json({ error: 'El codigo debe tener exactamente 3 caracteres' });
    }

    try {
        const [resultado] = await db.execute(
            'INSERT INTO aeropuerto (nombre, codigo, id_region) VALUES (?, ?, ?)',
            [nombre, codigo, id_region]
        );
        res.status(201).json({ id_aeropuerto: resultado.insertId, nombre, codigo, id_region });
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'La region indicada no existe' });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'El nombre o codigo ya está registrado' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});


// GET
router.get('/', async (req, res) => {
    const {
        codigo, nombre, region,
        orden = 'nombre', direccion = 'ASC'
    } = req.query;

    const camposValidos = ['codigo', 'nombre', 'region'];
    const campoOrden = camposValidos.includes(orden) ? orden : 'nombre';
    const dir = direccion.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const condiciones = [];
    const valores = [];

    if (codigo) { condiciones.push('ae.codigo LIKE ?'); valores.push(`%${codigo}%`); }
    if (nombre) { condiciones.push('ae.nombre LIKE ?'); valores.push(`%${nombre}%`); }
    if (region) { condiciones.push('re.nombre LIKE ?'); valores.push(`%${region}%`); }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const [filas] = await db.execute(`
            SELECT
                ae.codigo,
                ae.nombre,
                re.nombre AS region
            FROM aeropuerto ae
            JOIN region re ON ae.id_region = re.id_region
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