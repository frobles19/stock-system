const express = require('express');
const router = express.Router();
const db = require('../db');

// POST
router.post('/', async (req, res) => {
    const { fecha_salida, fecha_llegada_estimada, aeropuertos, id_tecnicos } = req.body;

    if (!fecha_salida || !fecha_llegada_estimada) {
        return res.status(400).json({ error: 'fecha_salida y fecha_llegada_estimada son obligatorias' });
    }
    if (!aeropuertos || !aeropuertos.length) {
        return res.status(400).json({ error: 'Debe indicar al menos un aeropuerto' });
    }
    if (!id_tecnicos || !id_tecnicos.length) {
        return res.status(400).json({ error: 'Debe indicar al menos un tecnico' });
    }
    for (const a of aeropuertos) {
        if (!a.id_aeropuerto || !a.id_tareas || !a.id_tareas.length) {
            return res.status(400).json({ error: 'Cada aeropuerto debe tener al menos una tarea' });
        }
    }
    if (new Date(fecha_llegada_estimada) < new Date(fecha_salida)) {
        return res.status(400).json({ error: 'fecha_llegada_estimada debe ser mayor o igual a fecha_salida' });
    }

    const conexion = await db.getConnection();
    try {
        await conexion.beginTransaction();

        // 1. Insertar comision
        const [resultado] = await conexion.execute(
            'INSERT INTO comision (fecha_salida, fecha_llegada_estimada, estado) VALUES (?, ?, ?)',
            [fecha_salida, fecha_llegada_estimada, 'EN_CURSO']
        );
        const id_comision = resultado.insertId;

        // 2. Insertar comision_aeropuerto y sus tareas
        for (const a of aeropuertos) {
            await conexion.execute(
                'INSERT INTO comision_aeropuerto (id_comision, id_aeropuerto) VALUES (?, ?)',
                [id_comision, a.id_aeropuerto]
            );
            for (const id_tarea of a.id_tareas) {
                await conexion.execute(
                    'INSERT INTO comision_aeropuerto_tarea (id_comision, id_aeropuerto, id_tarea) VALUES (?, ?, ?)',
                    [id_comision, a.id_aeropuerto, id_tarea]
                );
            }
        }

        // 3. Insertar comision_tecnico
        for (const id_tecnico of id_tecnicos) {
            await conexion.execute(
                'INSERT INTO comision_tecnico (id_comision, id_tecnico) VALUES (?, ?)',
                [id_comision, id_tecnico]
            );
        }

        await conexion.commit();
        res.status(201).json({ id_comision, fecha_salida, fecha_llegada_estimada, aeropuertos, id_tecnicos });
    } catch (error) {
        await conexion.rollback();
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'Algún aeropuerto, tecnico o tarea indicado no existe' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    } finally {
        conexion.release();
    }
});

// GET
router.get('/', async (req, res) => {
    const {
        id_comision, estado,
        orden = 'fecha_salida', direccion = 'DESC'
    } = req.query;

    const camposValidos = ['id_comision', 'fecha_salida', 'fecha_llegada_real', 'estado'];
    const campoOrden = camposValidos.includes(orden) ? orden : 'fecha_salida';
    const dir = direccion.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const condiciones = [];
    const valores = [];

    if (id_comision) { condiciones.push('co.id_comision = ?');  valores.push(id_comision); }
    if (estado)      { condiciones.push('co.estado = ?');       valores.push(estado); }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const [filas] = await db.execute(`
            SELECT
                co.id_comision,
                co.fecha_salida,
                co.fecha_llegada_real,
                co.estado,
                GROUP_CONCAT(DISTINCT te.nombre ORDER BY te.nombre SEPARATOR '||') AS tecnicos,
                GROUP_CONCAT(DISTINCT ae.nombre ORDER BY ae.nombre SEPARATOR '||') AS destinos,
                GROUP_CONCAT(DISTINCT ta.descripcion ORDER BY ta.descripcion SEPARATOR '||') AS tareas
            FROM comision co
            LEFT JOIN comision_tecnico ct ON co.id_comision = ct.id_comision
            LEFT JOIN tecnico te ON ct.id_tecnico = te.id_tecnico
            LEFT JOIN comision_aeropuerto ca ON co.id_comision = ca.id_comision
            LEFT JOIN aeropuerto ae ON ca.id_aeropuerto = ae.id_aeropuerto
            LEFT JOIN comision_aeropuerto_tarea cat ON ca.id_comision = cat.id_comision AND ca.id_aeropuerto = cat.id_aeropuerto
            LEFT JOIN tarea ta ON cat.id_tarea = ta.id_tarea
            ${where}
            GROUP BY co.id_comision
            ORDER BY ${campoOrden} ${dir}
        `, valores);

        // convertir strings concatenados en arrays
        const resultado = filas.map(f => ({
            ...f,
            tecnicos: f.tecnicos ? f.tecnicos.split('||') : [],
            destinos: f.destinos ? f.destinos.split('||') : [],
            tareas:   f.tareas   ? f.tareas.split('||')   : []
        }));

        res.json(resultado);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// GET Historial
router.get('/:id_comision', async (req, res) => {
    const { id_comision } = req.params;

    try {
        // verificamos que la comision existe
        const [comision] = await db.execute(
            'SELECT * FROM comision WHERE id_comision = ?',
            [id_comision]
        );

        if (!comision.length) {
            return res.status(404).json({ error: 'La comision indicada no existe' });
        }

        // tecnicos
        const [tecnicos] = await db.execute(`
            SELECT te.nombre
            FROM comision_tecnico ct
            JOIN tecnico te ON ct.id_tecnico = te.id_tecnico
            WHERE ct.id_comision = ?
        `, [id_comision]);

        // destinos con tareas
        const [destinos] = await db.execute(`
            SELECT
                ae.nombre AS destino,
                GROUP_CONCAT(ta.descripcion ORDER BY ta.descripcion SEPARATOR '||') AS tareas
            FROM comision_aeropuerto ca
            JOIN aeropuerto ae ON ca.id_aeropuerto = ae.id_aeropuerto
            LEFT JOIN comision_aeropuerto_tarea cat ON ca.id_comision = cat.id_comision AND ca.id_aeropuerto = cat.id_aeropuerto
            LEFT JOIN tarea ta ON cat.id_tarea = ta.id_tarea
            WHERE ca.id_comision = ?
            GROUP BY ae.id_aeropuerto
        `, [id_comision]);

        // movimientos con activos
        const [movimientos] = await db.execute(`
            SELECT
                mv.id_movimiento,
                mv.fecha,
                te.nombre AS tecnico_responsable,
                mv.observaciones,
                ac.n_activo,
                ar.descripcion AS articulo,
                ao.nombre AS origen,
                ad.nombre AS destino,
                md.estado
            FROM movimiento mv
            JOIN tecnico te ON mv.id_tecnico_responsable = te.id_tecnico
            LEFT JOIN movimiento_detalle md ON mv.id_movimiento = md.id_movimiento
            LEFT JOIN activo ac ON md.id_activo = ac.id_activo
            LEFT JOIN articulo ar ON ac.id_articulo = ar.id_articulo
            LEFT JOIN aeropuerto ao ON md.id_origen = ao.id_aeropuerto
            LEFT JOIN aeropuerto ad ON md.id_destino = ad.id_aeropuerto
            WHERE mv.id_comision = ?
            ORDER BY mv.fecha ASC
        `, [id_comision]);

        res.json({
            ...comision[0],
            tecnicos: tecnicos.map(t => t.nombre),
            destinos: destinos.map(d => ({
                destino: d.destino,
                tareas: d.tareas ? d.tareas.split('||') : []
            })),
            movimientos
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// PATCH estado y fecha_llegada_real
router.patch('/:id_comision', async (req, res) => {
    const { id_comision } = req.params;
    const { estado, fecha_llegada_real } = req.body;

    if (!estado) {
        return res.status(400).json({ error: 'estado es obligatorio' });
    }
    if (!['EN_CURSO', 'FINALIZADA'].includes(estado)) {
        return res.status(400).json({ error: 'estado debe ser EN_CURSO o FINALIZADA' });
    }
    if (estado === 'FINALIZADA' && !fecha_llegada_real) {
        return res.status(400).json({ error: 'fecha_llegada_real es obligatoria para finalizar una comision' });
    }
    if (estado === 'EN_CURSO' && fecha_llegada_real) {
        return res.status(400).json({ error: 'Una comision EN_CURSO no puede tener fecha_llegada_real' });
    }

    try {
        const [comision] = await db.execute(
            'SELECT id_comision FROM comision WHERE id_comision = ?',
            [id_comision]
        );
        if (!comision.length) {
            return res.status(404).json({ error: 'La comision indicada no existe' });
        }

        await db.execute(
            'UPDATE comision SET estado = ?, fecha_llegada_real = ? WHERE id_comision = ?',
            [estado, fecha_llegada_real || null, id_comision]
        );
        res.json({ id_comision, estado, fecha_llegada_real });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// POST agregar destino con tareas
router.post('/:id_comision/destinos', async (req, res) => {
    const { id_comision } = req.params;
    const { id_aeropuerto, id_tareas } = req.body;

    if (!id_aeropuerto || !id_tareas || !id_tareas.length) {
        return res.status(400).json({ error: 'id_aeropuerto e id_tareas son obligatorios' });
    }

    const conexion = await db.getConnection();
    try {
        await conexion.beginTransaction();

        await conexion.execute(
            'INSERT INTO comision_aeropuerto (id_comision, id_aeropuerto) VALUES (?, ?)',
            [id_comision, id_aeropuerto]
        );
        for (const id_tarea of id_tareas) {
            await conexion.execute(
                'INSERT INTO comision_aeropuerto_tarea (id_comision, id_aeropuerto, id_tarea) VALUES (?, ?, ?)',
                [id_comision, id_aeropuerto, id_tarea]
            );
        }

        await conexion.commit();
        res.status(201).json({ id_comision, id_aeropuerto, id_tareas });
    } catch (error) {
        await conexion.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ese destino ya está en la comision' });
        }
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'El aeropuerto o tarea indicada no existe' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    } finally {
        conexion.release();
    }
});

// DELETE quitar destino
router.delete('/:id_comision/destinos/:id_aeropuerto', async (req, res) => {
    const { id_comision, id_aeropuerto } = req.params;

    try {
        const [resultado] = await db.execute(
            'DELETE FROM comision_aeropuerto WHERE id_comision = ? AND id_aeropuerto = ?',
            [id_comision, id_aeropuerto]
        );
        if (!resultado.affectedRows) {
            return res.status(404).json({ error: 'Ese destino no está en la comision' });
        }
        res.json({ mensaje: 'Destino eliminado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// POST agregar tecnico
router.post('/:id_comision/tecnicos', async (req, res) => {
    const { id_comision } = req.params;
    const { id_tecnico } = req.body;

    if (!id_tecnico) {
        return res.status(400).json({ error: 'id_tecnico es obligatorio' });
    }

    try {
        await db.execute(
            'INSERT INTO comision_tecnico (id_comision, id_tecnico) VALUES (?, ?)',
            [id_comision, id_tecnico]
        );
        res.status(201).json({ id_comision, id_tecnico });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ese tecnico ya está en la comision' });
        }
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'El tecnico indicado no existe' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// DELETE quitar tecnico
router.delete('/:id_comision/tecnicos/:id_tecnico', async (req, res) => {
    const { id_comision, id_tecnico } = req.params;

    try {
        const [resultado] = await db.execute(
            'DELETE FROM comision_tecnico WHERE id_comision = ? AND id_tecnico = ?',
            [id_comision, id_tecnico]
        );
        if (!resultado.affectedRows) {
            return res.status(404).json({ error: 'Ese tecnico no está en la comision' });
        }
        res.json({ mensaje: 'Tecnico eliminado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// POST agregar tarea a un destino
router.post('/:id_comision/destinos/:id_aeropuerto/tareas', async (req, res) => {
    const { id_comision, id_aeropuerto } = req.params;
    const { id_tarea } = req.body;

    if (!id_tarea) {
        return res.status(400).json({ error: 'id_tarea es obligatorio' });
    }

    try {
        await db.execute(
            'INSERT INTO comision_aeropuerto_tarea (id_comision, id_aeropuerto, id_tarea) VALUES (?, ?, ?)',
            [id_comision, id_aeropuerto, id_tarea]
        );
        res.status(201).json({ id_comision, id_aeropuerto, id_tarea });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Esa tarea ya está en ese destino' });
        }
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'La tarea o destino indicado no existe' });
        }
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

// DELETE quitar tarea de un destino
router.delete('/:id_comision/destinos/:id_aeropuerto/tareas/:id_tarea', async (req, res) => {
    const { id_comision, id_aeropuerto, id_tarea } = req.params;

    try {
        const [resultado] = await db.execute(
            'DELETE FROM comision_aeropuerto_tarea WHERE id_comision = ? AND id_aeropuerto = ? AND id_tarea = ?',
            [id_comision, id_aeropuerto, id_tarea]
        );
        if (!resultado.affectedRows) {
            return res.status(404).json({ error: 'Esa tarea no está en ese destino' });
        }
        res.json({ mensaje: 'Tarea eliminada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Hubo un problema con la base de datos' });
    }
});

module.exports = router;