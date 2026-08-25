const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/aeropuertos',         require('./routes/aeropuertos'));
app.use('/api/tecnicos',            require('./routes/tecnicos'));
app.use('/api/sistemas',            require('./routes/sistemas'));
app.use('/api/modelos',             require('./routes/modelos'));
app.use('/api/articulos',           require('./routes/articulos'));
app.use('/api/activos',             require('./routes/activos'));
app.use('/api/comisiones',          require('./routes/comisiones'));
app.use('/api/movimientos',         require('./routes/movimientos'));
app.use('/api/movimientos_detalle', require('./routes/movimientos_detalle'));

const PUERTO = 3000;
app.listen(PUERTO, () => {
    console.log(`Servidor backend corriendo en http://localhost:${PUERTO}`);
});