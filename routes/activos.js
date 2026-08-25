const express = require('express');
const router = express.Router();
const db = require('../db');

// POST
router.post('/', async (req, res) => {
    const { id_articulo, n_activo, n_serie, estado, id_aeropuerto } = req.body;

    if (!id_articulo || !n_activo || !n_serie || !estado || !id_aeropuerto) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    if (!['EN_SERVICIO', 'FUERA_DE_SERVICIO', 'DADO_DE_BAJA'].includes(estado)) {
        return res.status(400).json({ error: 'estado debe ser EN_SERVICIO, FUERA_DE_SERVICIO o DADO_DE_BAJA' });
    }

    try {
        const [resultado] = await db.execute(
            'INSERT INTO activo (id_articulo, n_activo, n_serie, estado, id_aeropuerto) VALUES (?, ?, ?, ?, ?)',
            [id_articulo, n_activo, n_serie, estado, id_aeropuerto]
        );
        res.status(201).json({ id_activo: resultado.insertId, id_articulo, n_activo, n_serie, estado, id_aeropuerto });
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'El articulo o aeropuerto indicado no existe' });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'El n_activo o n_serie ya está registrado' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});


// GET
router.get('/', async (req, res) => {
    const {
        n_parte, modelo, descripcion, n_serie,
        n_activo, ubicacion, estado,
        orden = 'n_activo', direccion = 'DESC'
    } = req.query;

    const camposValidos = ['n_parte', 'modelo', 'descripcion', 'n_serie', 'n_activo', 'ubicacion', 'estado'];
    const campoOrden = camposValidos.includes(orden) ? orden : 'n_activo';
    const dir = direccion.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const condiciones = [];
    const valores = [];

    if (n_parte)    { condiciones.push('ar.n_parte LIKE ?');        valores.push(`%${n_parte}%`); }
    if (modelo)     { condiciones.push('mo.descripcion LIKE ?');    valores.push(`%${modelo}%`); }
    if (descripcion){ condiciones.push('ar.descripcion LIKE ?');    valores.push(`%${descripcion}%`); }
    if (n_serie)    { condiciones.push('ac.n_serie LIKE ?');        valores.push(`%${n_serie}%`); }
    if (n_activo)   { condiciones.push('ac.n_activo LIKE ?');       valores.push(`%${n_activo}%`); }
    if (ubicacion)  { condiciones.push('ae.nombre LIKE ?');         valores.push(`%${ubicacion}%`); }
    if (estado)     { condiciones.push('ac.estado = ?');            valores.push(estado); }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const [filas] = await db.execute(`
            SELECT 
                ar.n_parte,
                mo.descripcion AS modelo,
                ar.descripcion,
                ac.n_serie,
                ac.n_activo,
                ae.nombre AS ubicacion,
                ac.estado
            FROM activo ac
            JOIN articulo ar ON ac.id_articulo = ar.id_articulo
            JOIN modelo mo ON ar.id_modelo = mo.id_modelo
            JOIN aeropuerto ae ON ac.id_aeropuerto = ae.id_aeropuerto
            ${where}
            ORDER BY ${campoOrden} ${dir}
        `, valores);
        res.json(filas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// GET Hisotorial
router.get('/:n_activo/historial', async (req, res) => {
    const { n_activo } = req.params;

    try {
        // primero verificamos que el activo existe
        const [activo] = await db.execute(
            'SELECT id_activo FROM activo WHERE n_activo = ?',
            [n_activo]
        );

        if (!activo.length) {
            return res.status(404).json({ error: 'El activo indicado no existe' });
        }

        const [filas] = await db.execute(`
            SELECT
                mv.fecha,
                ao.nombre AS origen,
                ad.nombre AS destino,
                md.estado,
                te.nombre AS tecnico_responsable,
                mv.observaciones,
                mv.id_comision
            FROM movimiento_detalle md
            JOIN movimiento mv ON md.id_movimiento = mv.id_movimiento
            JOIN activo ac ON md.id_activo = ac.id_activo
            JOIN aeropuerto ao ON md.id_origen = ao.id_aeropuerto
            JOIN aeropuerto ad ON md.id_destino = ad.id_aeropuerto
            JOIN tecnico te ON mv.id_tecnico_responsable = te.id_tecnico
            WHERE ac.n_activo = ?
            ORDER BY mv.fecha ASC
        `, [n_activo]);

        res.json({
            n_activo,
            historial: filas
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});


module.exports = router;