const express = require('express');
const router = express.Router();
const db = require('../db');

// POST
router.post('/', async (req, res) => {
    const { id_comision, id_tecnico_responsable, observaciones } = req.body;

    if (!id_tecnico_responsable) {
        return res.status(400).json({ error: 'id_tecnico_responsable es obligatorio' });
    }

    try {
        const [resultado] = await db.execute(
            'INSERT INTO movimiento (id_comision, id_tecnico_responsable, observaciones) VALUES (?, ?, ?)',
            [id_comision || null, id_tecnico_responsable, observaciones || null]
        );
        res.status(201).json({ id_movimiento: resultado.insertId, id_comision, id_tecnico_responsable, observaciones });
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'La comision o tecnico indicado no existe' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// GET
router.get('/', async (req, res) => {
    const {
        id_movimiento, tecnico, fecha, id_comision, observaciones,
        orden = 'fecha', direccion = 'DESC'
    } = req.query;

    const camposValidos = ['id_movimiento', 'tecnico', 'fecha', 'id_comision', 'observaciones'];
    const campoOrden = camposValidos.includes(orden) ? orden : 'fecha';
    const dir = direccion.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const condiciones = [];
    const valores = [];

    if (id_movimiento) { condiciones.push('mo.id_movimiento = ?');      valores.push(id_movimiento); }
    if (tecnico)       { condiciones.push('te.nombre LIKE ?');          valores.push(`%${tecnico}%`); }
    if (fecha)         { condiciones.push('DATE(mo.fecha) = ?');        valores.push(fecha); }
    if (id_comision)   { condiciones.push('mo.id_comision = ?');        valores.push(id_comision); }
    if (observaciones) { condiciones.push('mo.observaciones LIKE ?');   valores.push(`%${observaciones}%`); }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const [filas] = await db.execute(`
            SELECT
                mo.id_movimiento,
                te.nombre AS tecnico_responsable,
                mo.fecha,
                mo.id_comision,
                COUNT(md.id_activo) AS cantidad_activos,
                GROUP_CONCAT(DISTINCT ae.nombre ORDER BY ae.nombre SEPARATOR '||') AS destinos,
                mo.observaciones
            FROM movimiento mo
            JOIN tecnico te ON mo.id_tecnico_responsable = te.id_tecnico
            LEFT JOIN movimiento_detalle md ON mo.id_movimiento = md.id_movimiento
            LEFT JOIN aeropuerto ae ON md.id_destino = ae.id_aeropuerto
            ${where}
            GROUP BY mo.id_movimiento
            ORDER BY ${campoOrden} ${dir}
        `, valores);

        const resultado = filas.map(f => ({
            ...f,
            destinos: f.destinos ? f.destinos.split('||') : []
        }));

        res.json(resultado);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// PATCH comision asociada
router.patch('/:id_movimiento/comision', async (req, res) => {
    const { id_movimiento } = req.params;
    const { id_comision } = req.body;

    try {
        const [movimiento] = await db.execute(
            'SELECT id_movimiento FROM movimiento WHERE id_movimiento = ?',
            [id_movimiento]
        );
        if (!movimiento.length) {
            return res.status(404).json({ error: 'El movimiento indicado no existe' });
        }

        await db.execute(
            'UPDATE movimiento SET id_comision = ? WHERE id_movimiento = ?',
            [id_comision || null, id_movimiento]
        );
        res.json({ id_movimiento, id_comision });
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'La comision indicada no existe' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

module.exports = router;