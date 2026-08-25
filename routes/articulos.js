const express = require('express');
const router = express.Router();
const db = require('../db');

// POST
router.post('/', async (req, res) => {
    const { id_modelo, n_parte, descripcion, tipo } = req.body;

    if (!n_parte || !descripcion || !tipo) {
        return res.status(400).json({ error: 'n_parte, descripcion y tipo son obligatorios' });
    }
    if (!['HERRAMIENTA', 'REPUESTO'].includes(tipo)) {
        return res.status(400).json({ error: 'tipo debe ser HERRAMIENTA o REPUESTO' });
    }
    if (tipo === 'REPUESTO' && !id_modelo) {
        return res.status(400).json({ error: 'Un repuesto debe tener un modelo asignado' });
    }

    try {
        const [resultado] = await db.execute(
            'INSERT INTO articulo (id_modelo, n_parte, descripcion, tipo, rotativo) VALUES (?, ?, ?, ?, ?)',
            [id_modelo, n_parte, descripcion, tipo, 1]
        );
        res.status(201).json({ id_articulo: resultado.insertId, id_modelo, n_parte, descripcion, tipo });
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'El modelo indicado no existe' });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ese n_parte ya está registrado' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

//GET
router.get('/', async (req, res) => {
    const {
        n_parte, sistema, modelo, descripcion, tipo,
        orden = 'n_parte', direccion = 'DESC'
    } = req.query;

    const camposValidos = ['n_parte', 'sistema', 'modelo', 'descripcion', 'tipo'];
    const campoOrden = camposValidos.includes(orden) ? orden : 'n_parte';
    const dir = direccion.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const condiciones = [];
    const valores = [];

    if (n_parte)     { condiciones.push('ar.n_parte LIKE ?');      valores.push(`%${n_parte}%`); }
    if (sistema)     { condiciones.push('si.descripcion LIKE ?');  valores.push(`%${sistema}%`); }
    if (modelo)      { condiciones.push('mo.descripcion LIKE ?');  valores.push(`%${modelo}%`); }
    if (descripcion) { condiciones.push('ar.descripcion LIKE ?');  valores.push(`%${descripcion}%`); }
    if (tipo)        { condiciones.push('ar.tipo = ?');            valores.push(tipo); }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const [filas] = await db.execute(`
            SELECT
                ar.n_parte,
                si.descripcion AS sistema,
                mo.descripcion AS modelo,
                ar.descripcion,
                ar.tipo
            FROM articulo ar
            JOIN modelo mo ON ar.id_modelo = mo.id_modelo
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

// PATCH
router.patch('/:n_activo/estado', async (req, res) => {
    const { n_activo } = req.params;
    const { estado_nuevo, id_tecnico, observaciones } = req.body;

    if (!estado_nuevo || !id_tecnico) {
        return res.status(400).json({ error: 'estado_nuevo e id_tecnico son obligatorios' });
    }
    if (!['EN_SERVICIO', 'FUERA_DE_SERVICIO', 'DADO_DE_BAJA'].includes(estado_nuevo)) {
        return res.status(400).json({ error: 'estado_nuevo debe ser EN_SERVICIO, FUERA_DE_SERVICIO o DADO_DE_BAJA' });
    }

    const conexion = await db.getConnection();
    try {
        await conexion.beginTransaction();

        // 1. Buscar activo y estado actual
        const [activo] = await conexion.execute(
            'SELECT id_activo, estado FROM activo WHERE n_activo = ?',
            [n_activo]
        );
        if (!activo.length) {
            await conexion.rollback();
            return res.status(404).json({ error: 'El activo indicado no existe' });
        }

        const { id_activo, estado } = activo[0];

        if (estado === estado_nuevo) {
            await conexion.rollback();
            return res.status(400).json({ error: 'El activo ya tiene ese estado' });
        }

        // 2. Actualizar estado en activo
        await conexion.execute(
            'UPDATE activo SET estado = ? WHERE id_activo = ?',
            [estado_nuevo, id_activo]
        );

        // 3. Registrar en historial
        await conexion.execute(
            'INSERT INTO historial_estado_activo (id_activo, estado_anterior, estado_nuevo, id_tecnico, observaciones) VALUES (?, ?, ?, ?, ?)',
            [id_activo, estado, estado_nuevo, id_tecnico, observaciones || null]
        );

        await conexion.commit();
        res.json({ n_activo, estado_anterior: estado, estado_nuevo, id_tecnico, observaciones });
    } catch (error) {
        await conexion.rollback();
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'El tecnico indicado no existe' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    } finally {
        conexion.release();
    }
});

module.exports = router;