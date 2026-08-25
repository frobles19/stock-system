const express = require('express');
const router = express.Router();
const db = require('../db');

// POST
router.post('/', async (req, res) => {
    const { id_movimiento, id_activo, id_origen, id_destino, estado } = req.body;

    if (!id_movimiento || !id_activo || !id_origen || !id_destino || !estado) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }
    if (!['EN_SERVICIO', 'FUERA_DE_SERVICIO', 'DADO_DE_BAJA'].includes(estado)) {
        return res.status(400).json({ error: 'estado debe ser EN_SERVICIO, FUERA_DE_SERVICIO o DADO_DE_BAJA' });
    }
    if (id_origen === id_destino) {
        return res.status(400).json({ error: 'id_origen no puede ser igual a id_destino' });
    }

    try {
        const [resultado] = await db.execute(
            'INSERT INTO movimiento_detalle (id_movimiento, id_activo, id_origen, id_destino, estado) VALUES (?, ?, ?, ?, ?)',
            [id_movimiento, id_activo, id_origen, id_destino, estado]
        );
        res.status(201).json({ id_movimiento_detalle: resultado.insertId, id_movimiento, id_activo, id_origen, id_destino, estado });
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'Algún id indicado no existe' });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ese activo ya está registrado en este movimiento' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// GET
router.get('/', async (req, res) => {
    const {
        id_movimiento_detalle, id_movimiento, n_parte, n_activo,
        modelo, descripcion, n_serie, origen, destino, tecnico, estado,
        orden = 'fecha', direccion = 'DESC'
    } = req.query;

    const camposValidos = ['id_movimiento_detalle', 'id_movimiento', 'n_parte', 'n_activo',
                           'modelo', 'descripcion', 'n_serie', 'origen', 'destino', 'tecnico', 'fecha', 'estado'];
    const campoOrden = camposValidos.includes(orden) ? orden : 'fecha';
    const dir = direccion.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const condiciones = [];
    const valores = [];

    if (id_movimiento_detalle) { condiciones.push('md.id_movimiento_detalle = ?');  valores.push(id_movimiento_detalle); }
    if (id_movimiento)         { condiciones.push('md.id_movimiento = ?');          valores.push(id_movimiento); }
    if (n_parte)               { condiciones.push('ar.n_parte LIKE ?');             valores.push(`%${n_parte}%`); }
    if (n_activo)              { condiciones.push('ac.n_activo LIKE ?');            valores.push(`%${n_activo}%`); }
    if (modelo)                { condiciones.push('mo.descripcion LIKE ?');         valores.push(`%${modelo}%`); }
    if (descripcion)           { condiciones.push('ar.descripcion LIKE ?');         valores.push(`%${descripcion}%`); }
    if (n_serie)               { condiciones.push('ac.n_serie LIKE ?');             valores.push(`%${n_serie}%`); }
    if (origen)                { condiciones.push('ao.nombre LIKE ?');              valores.push(`%${origen}%`); }
    if (destino)               { condiciones.push('ad.nombre LIKE ?');              valores.push(`%${destino}%`); }
    if (tecnico)               { condiciones.push('te.nombre LIKE ?');              valores.push(`%${tecnico}%`); }
    if (estado)                { condiciones.push('md.estado = ?');                 valores.push(estado); }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const [filas] = await db.execute(`
            SELECT
                md.id_movimiento_detalle,
                md.id_movimiento,
                ar.n_parte,
                ac.n_activo,
                mo.descripcion AS modelo,
                ar.descripcion,
                ac.n_serie,
                ao.nombre AS origen,
                ad.nombre AS destino,
                te.nombre AS tecnico_responsable,
                mv.fecha,
                md.estado
            FROM movimiento_detalle md
            JOIN activo ac ON md.id_activo = ac.id_activo
            JOIN articulo ar ON ac.id_articulo = ar.id_articulo
            JOIN modelo mo ON ar.id_modelo = mo.id_modelo
            JOIN aeropuerto ao ON md.id_origen = ao.id_aeropuerto
            JOIN aeropuerto ad ON md.id_destino = ad.id_aeropuerto
            JOIN movimiento mv ON md.id_movimiento = mv.id_movimiento
            JOIN tecnico te ON mv.id_tecnico_responsable = te.id_tecnico
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