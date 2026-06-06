// Archivo: server.js (Versión Multi-Barbería CORREGIDA)

const express = require('express');
const { Sequelize, DataTypes, Op, QueryTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const cloudinary = require('cloudinary').v2;
const OpenAI = require('openai');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Se mueve el middleware de archivos estáticos más abajo

const facturasDir = './facturas';
if (!fs.existsSync(facturasDir)) { fs.mkdirSync(facturasDir); }

// === INICIO: CONFIGURACIÓN DE OPENAI ===
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DATABASE_SCHEMA = `
  CREATE TABLE Citas ( cita_id INT PRIMARY KEY, cliente_id INT, barbero_id INT, fecha_hora_inicio DATETIME, fecha_hora_fin DATETIME, estado ENUM('programada', 'pagada', 'cancelada') );
  CREATE TABLE Clientes ( cliente_id INT PRIMARY KEY, nombre VARCHAR(255), apellido VARCHAR(255), telefono VARCHAR(255), email VARCHAR(255), fecha_nacimiento DATE );
  CREATE TABLE Barberos ( barbero_id INT PRIMARY KEY, nombre VARCHAR(255), apellido VARCHAR(255) );
  CREATE TABLE Pagos ( pago_id INT PRIMARY KEY, cita_id INT, monto_total DECIMAL(10, 2), fecha_pago DATETIME, metodo_pago ENUM('Efectivo', 'Nequi', 'Bancolombia', 'Davivienda') );
  CREATE TABLE Servicios ( servicio_id INT PRIMARY KEY, nombre VARCHAR(255), precio DECIMAL(10, 2) );
  CREATE TABLE Productos ( producto_id INT PRIMARY KEY, nombre VARCHAR(255), precio_venta DECIMAL(10, 2), costo_compra DECIMAL(10, 2), stock_actual INT );
  CREATE TABLE Ventas_Productos ( venta_producto_id INT PRIMARY KEY, producto_id INT, cantidad INT, precio_venta_momento DECIMAL, fecha_venta DATETIME );
`;
// === FIN: CONFIGURACIÓN DE OPENAI ===


const enviarMensajeWhatsapp = async (telefono, mensaje) => {
    const WHATSAPP_TOKEN = process.env.META_ACCESS_TOKEN;
    const WHATSAPP_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) { console.error('❌ Error: Faltan variables de entorno para la API de WhatsApp. El mensaje no será enviado.'); return; }
    const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const numeroLimpio = `57${telefono.toString().replace(/\D/g, '')}`;
    const data = { messaging_product: 'whatsapp', to: numeroLimpio, type: 'text', text: { body: mensaje } };
    try { await axios.post(url, data, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }); console.log(`✅ Mensaje de WhatsApp (API Meta) enviado a ${numeroLimpio}`); } catch (error) { console.error(`❌ Error al enviar WhatsApp a ${numeroLimpio} vía Meta API:`, error.response ? error.response.data : error.message); }
};

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, { host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, dialect: 'mysql', logging: false, timezone: '-05:00', dialectOptions: { connectTimeout: 60000 }, pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }, retry: { max: 3 } });

// --- DEFINICIÓN DE MODELOS (SIN CAMBIOS) ---
const InformacionFiscal = sequelize.define('Informacion_Fiscal', { barberia_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, Establecimiento_Comercio: { type: DataTypes.STRING(50) }, Responsable_facturacion: { type: DataTypes.STRING(50) }, Nit: { type: DataTypes.STRING(11) }, Dv: { type: DataTypes.STRING(1) }, NroResolucionDian: { type: DataTypes.STRING(20) }, numeraciondesde: { type: DataTypes.STRING(20) }, numeracionhasta: { type: DataTypes.STRING(20) }, Fecha_ini_vig: { type: DataTypes.DATEONLY }, Fecha_fin_vig: { type: DataTypes.DATEONLY }, Tipo_resolucion: { type: DataTypes.STRING(20) }, Direccion: { type: DataTypes.STRING(50) }, Telefono: { type: DataTypes.STRING(20) }, email: { type: DataTypes.STRING(60) }, Logo_URL: { type: DataTypes.STRING(255) }, consecutivo_factura: { type: DataTypes.INTEGER } }, { tableName: 'Informacion_Fiscal', timestamps: false });
const Usuario = sequelize.define('Usuarios', { 
    usuario_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, 
    nombre_completo: { type: DataTypes.STRING }, 
    email: { type: DataTypes.STRING }, 
    password_hash: { type: DataTypes.STRING }, 
    rol: { type: DataTypes.ENUM('administrador', 'barbero', 'recepcionista', 'cliente') }, 
    barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } 
}, { tableName: 'Usuarios', timestamps: false, indexes: [{ unique: true, fields: ['email', 'barberia_id'] }] });
const VentaProducto = sequelize.define('Ventas_Productos', { venta_producto_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, producto_id: { type: DataTypes.INTEGER }, cantidad: { type: DataTypes.INTEGER }, precio_venta_momento: { type: DataTypes.DECIMAL }, fecha_venta: { type: DataTypes.DATE }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Ventas_Productos', timestamps: false });
const Gasto = sequelize.define('Gastos', { gasto_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, descripcion: { type: DataTypes.STRING }, monto: { type: DataTypes.DECIMAL }, tipo: { type: DataTypes.ENUM('costo_fijo', 'costo_variable', 'gasto_operativo') }, fecha: { type: DataTypes.DATE }, usuario_id: { type: DataTypes.INTEGER }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Gastos', timestamps: false });
const Producto = sequelize.define('Productos', { producto_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, nombre: { type: DataTypes.STRING }, precio_venta: { type: DataTypes.DECIMAL }, costo_compra: { type: DataTypes.DECIMAL }, stock_actual: { type: DataTypes.INTEGER }, stock_minimo: { type: DataTypes.INTEGER }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Productos', timestamps: false, indexes: [{ unique: true, fields: ['nombre', 'barberia_id'] }] });
const Compra = sequelize.define('Compras', { compra_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, producto_id: { type: DataTypes.INTEGER }, cantidad: { type: DataTypes.INTEGER }, costo_total: { type: DataTypes.DECIMAL }, fecha_compra: { type: DataTypes.DATE }, usuario_id: { type: DataTypes.INTEGER }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Compras', timestamps: false });
const Cliente = sequelize.define('Clientes', { cliente_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, nombre: { type: DataTypes.STRING, allowNull: false }, apellido: { type: DataTypes.STRING, allowNull: false }, telefono: { type: DataTypes.STRING, allowNull: false }, email: { type: DataTypes.STRING }, fecha_nacimiento: { type: DataTypes.DATEONLY }, notas: { type: DataTypes.TEXT }, foto_antes_url: { type: DataTypes.STRING }, foto_despues_url: { type: DataTypes.STRING }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Clientes', timestamps: false, indexes: [ { unique: true, fields: ['telefono', 'barberia_id'] }, { unique: true, fields: ['email', 'barberia_id'] } ] });
const Barbero = sequelize.define('Barberos', { barbero_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, nombre: { type: DataTypes.STRING(255), allowNull: false }, apellido: { type: DataTypes.STRING(255), allowNull: false }, celular: { type: DataTypes.STRING(20) }, email: { type: DataTypes.STRING(50) }, tipo_pago: { type: DataTypes.ENUM('comision', 'arrendamiento'), defaultValue: 'comision' }, valor: { type: DataTypes.DECIMAL(10, 2) }, foto_url: { type: DataTypes.STRING(255) }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Barberos', timestamps: false, indexes: [{ unique: true, fields: ['celular', 'barberia_id'] }, { unique: true, fields: ['email', 'barberia_id'] }] });
const Servicio = sequelize.define('Servicios', { servicio_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, nombre: { type: DataTypes.STRING, allowNull: false }, precio: { type: DataTypes.DECIMAL(10, 2), allowNull: false }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Servicios', timestamps: false, indexes: [{ unique: true, fields: ['nombre', 'barberia_id'] }] });
const Cita = sequelize.define('Citas', { cita_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, cliente_id: { type: DataTypes.INTEGER, references: { model: Cliente, key: 'cliente_id' } }, barbero_id: { type: DataTypes.INTEGER, references: { model: Barbero, key: 'barberia_id' } }, fecha_hora_inicio: { type: DataTypes.DATE, allowNull: false }, fecha_hora_fin: { type: DataTypes.DATE, allowNull: false }, estado: { type: DataTypes.ENUM('programada', 'pagada', 'cancelada'), defaultValue: 'programada' }, fecha_cancelacion: { type: DataTypes.DATE, allowNull: true }, motivo_cancelacion: { type: DataTypes.TEXT, allowNull: true }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Citas', timestamps: false });
const Pago = sequelize.define('Pagos', { pago_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, cita_id: { type: DataTypes.INTEGER, references: { model: Cita, key: 'cita_id' } }, monto_total: { type: DataTypes.DECIMAL(10, 2), allowNull: false }, fecha_pago: { type: DataTypes.DATE, allowNull: false }, metodo_pago: { type: DataTypes.ENUM('Efectivo', 'Nequi', 'Bancolombia', 'Davivienda'), allowNull: false }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Pagos', timestamps: false });
const CitasServicios = sequelize.define('Citas_Servicios', { barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Citas_Servicios', timestamps: true });
const Horario = sequelize.define('Horarios', { horario_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, barbero_id: { type: DataTypes.INTEGER, references: { model: Barbero, key: 'barberia_id' } }, dia_semana: { type: DataTypes.INTEGER, allowNull: false }, hora_inicio: { type: DataTypes.TIME, allowNull: false }, hora_fin: { type: DataTypes.TIME, allowNull: false }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Horarios', timestamps: false, indexes: [{ unique: true, fields: ['barbero_id', 'dia_semana'] }] });
const Parametro = sequelize.define('Parametros', { parametro_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, nombre: { type: DataTypes.STRING }, valor: { type: DataTypes.STRING }, descripcion: { type: DataTypes.TEXT }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Parametros', timestamps: false, indexes: [{ unique: true, fields: ['nombre', 'barberia_id'] }] });
const ConsumoProducto = sequelize.define('Consumos_Productos', { consumo_producto_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, producto_id: { type: DataTypes.INTEGER }, cantidad: { type: DataTypes.INTEGER }, precio_costo_momento: { type: DataTypes.DECIMAL(10, 2) }, fecha_consumo: { type: DataTypes.DATE }, barberia_id: { type: DataTypes.INTEGER, references: { model: InformacionFiscal, key: 'barberia_id' } } }, { tableName: 'Consumos_Productos', timestamps: false });

// --- ASOCIACIONES (SIN CAMBIOS) ---
InformacionFiscal.hasMany(Usuario, { foreignKey: 'barberia_id' }); Usuario.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(Cliente, { foreignKey: 'barberia_id' }); Cliente.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(Barbero, { foreignKey: 'barberia_id' }); Barbero.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(Servicio, { foreignKey: 'barberia_id' }); Servicio.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(Cita, { foreignKey: 'barberia_id' }); Cita.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(Producto, { foreignKey: 'barberia_id' }); Producto.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(Gasto, { foreignKey: 'barberia_id' }); Gasto.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(Compra, { foreignKey: 'barberia_id' }); Compra.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(VentaProducto, { foreignKey: 'barberia_id' }); VentaProducto.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(ConsumoProducto, { foreignKey: 'barberia_id' }); ConsumoProducto.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(Pago, { foreignKey: 'barberia_id' }); Pago.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(Horario, { foreignKey: 'barberia_id' }); Horario.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
InformacionFiscal.hasMany(Parametro, { foreignKey: 'barberia_id' }); Parametro.belongsTo(InformacionFiscal, { foreignKey: 'barberia_id' });
Cliente.hasMany(Cita, { foreignKey: 'cliente_id' }); Cita.belongsTo(Cliente, { foreignKey: 'cliente_id' });
Barbero.hasMany(Cita, { foreignKey: 'barbero_id' }); 
Cita.belongsTo(Barbero, { foreignKey: 'barbero_id' });
Cita.belongsToMany(Servicio, { through: CitasServicios }); Servicio.belongsToMany(Cita, { through: CitasServicios });
Barbero.hasMany(Horario, { foreignKey: 'barberia_id' }); Horario.belongsTo(Barbero, { foreignKey: 'barberia_id' });
Cita.hasOne(Pago, { foreignKey: 'cita_id' }); Pago.belongsTo(Cita, { foreignKey: 'cita_id' });

// --- FUNCIONES Y MIDDLEWARE (SIN CAMBIOS) ---
const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream( { resource_type: "auto" }, (error, result) => { if (error) reject(error); else resolve(result); });
        uploadStream.end(fileBuffer);
    });
};
async function generarFacturaPDF(cita, pago, infoFiscal, consecutivo) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 30, size: 'A5' });
        const filePath = path.join(__dirname, 'facturas', `factura-${consecutivo}.pdf`);
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        doc.font('Helvetica-Bold').fontSize(14).text(infoFiscal.Establecimiento_Comercio, { align: 'center' });
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(10).text(infoFiscal.Responsable_facturacion, { align: 'center' });
        doc.text(`${infoFiscal.Nit}-${infoFiscal.Dv}`, { align: 'center' });
        doc.moveDown(2);
        const consecutivoFormateado = String(consecutivo).padStart(7, '0');
        doc.fontSize(12).font('Helvetica-Bold').text(`FACTURA DE VENTA N°: ${consecutivoFormateado}`, 30, doc.y, {align: 'center'});
        doc.moveDown(0.5);
        const fechaIni = new Date(infoFiscal.Fecha_ini_vig).toLocaleDateString('es-CO');
        const fechaFin = new Date(infoFiscal.Fecha_fin_vig).toLocaleDateString('es-CO');
        const resolucionTexto = `Res. DIAN ${infoFiscal.NroResolucionDian} Desde: ${infoFiscal.numeraciondesde} Hasta: ${infoFiscal.numeracionhasta} Vig: ${fechaIni} - ${fechaFin} Tipo Res: ${infoFiscal.Tipo_resolucion}`;
        doc.font('Helvetica').fontSize(7).text(resolucionTexto, { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).font('Helvetica').text(`Fecha: ${new Date(pago.fecha_pago).toLocaleString('es-CO')}`, { align: 'right' });
        doc.moveDown();
        doc.font('Helvetica-Bold').text('Cliente:', 30, doc.y).font('Helvetica').text(`${cita.Cliente.nombre} ${cita.Cliente.apellido}`, 120, doc.y - doc.currentLineHeight());
        doc.font('Helvetica-Bold').text('Atendido por:', 30, doc.y).font('Helvetica').text(`${cita.Barbero.nombre} ${cita.Barbero.apellido}`, 120, doc.y - doc.currentLineHeight());
        doc.moveDown();
        let tableTop = doc.y;
        doc.font('Helvetica-Bold');
        doc.text('Descripción', 30, tableTop);
        doc.text('Precio', 300, tableTop, { width: 70, align: 'right' });
        doc.moveTo(30, tableTop + 15).lineTo(390, tableTop + 15).stroke();
        tableTop += 25;
        doc.font('Helvetica');
        cita.Servicios.forEach(servicio => { doc.text(servicio.nombre, 30, tableTop, {width: 260}); doc.text(parseFloat(servicio.precio).toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), 300, tableTop, { align: 'right', width: 70 }); tableTop += 20; });
        doc.moveTo(30, tableTop + 5).lineTo(390, tableTop + 5).stroke();
        doc.font('Helvetica-Bold').text('TOTAL:', 200, tableTop + 15, { align: 'left' });
        doc.font('Helvetica-Bold').text(parseFloat(pago.monto_total).toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), 300, tableTop + 15, { align: 'right', width: 70 });
        doc.moveDown();
        doc.font('Helvetica').fontSize(9).text(`Método de pago: ${pago.metodo_pago}`, 30, doc.y);
        const bottom = doc.page.height - 80;
        doc.font('Helvetica').fontSize(8);
        doc.text(`${infoFiscal.Direccion} - Tel: ${infoFiscal.Telefono} - ${infoFiscal.email}`, 30, bottom, { align: 'center', width: 360 });
        doc.font('Helvetica-Bold').fontSize(10).text('¡GRACIAS POR TU VISITA!', 30, bottom + 20, { align: 'center', width: 360 });
        doc.end();
        writeStream.on('finish', () => resolve(filePath));
        writeStream.on('error', (err) => reject(err));
    });
}
const verificarToken = (req, res, next) => { const authHeader = req.headers['authorization']; const token = authHeader && authHeader.split(' ')[1]; if (!token) return res.sendStatus(401); jwt.verify(token, process.env.JWT_SECRET, (err, user) => { if (err) return res.sendStatus(403); req.user = user; next(); }); };

const verificarAdmin = (req, res, next) => {
    if (req.user.rol !== 'administrador') {
        return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de administrador.' });
    }
    next();
};

// --- RUTAS DE LA API (Endpoints) ---
// SE MUEVEN TODAS LAS RUTAS DE LA API ANTES DE SERVIR ARCHIVOS ESTÁTICOS

// Nueva ruta pública para obtener la lista de barberías.
app.get('/api/barberias', async (req, res) => {
    try {
        const barberias = await InformacionFiscal.findAll({
            attributes: [
                'barberia_id',
                ['Establecimiento_Comercio', 'nombre'], // Renombrar para que coincida con el frontend
                ['Logo_URL', 'logoUrl']
            ]
        });
        res.json(barberias);
    } catch (error) {
        console.error("Error al obtener la lista de barberías:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

// === ENDPOINT PARA EL DASHBOARD ===
app.get('/api/dashboard/summary', verificarToken, async (req, res) => {
    try {
        const barberiaId = req.user.barberia_id;

        // --- CÁLCULOS SEMANALES ---
        const weeklyQuery = `
            SELECT 
                d.fecha,
                COALESCE(SUM(CASE WHEN b.tipo_pago = 'comision' THEN p.monto_total * (1 - b.valor / 100) ELSE p.monto_total END), 0) as ingresosBarberia,
                COALESCE(SUM(CASE WHEN b.tipo_pago = 'comision' THEN p.monto_total * (b.valor / 100) ELSE 0 END), 0) as ingresosBarberos,
                COALESCE(g.total_gastos, 0) as gastos
            FROM (
                SELECT CURDATE() - INTERVAL (a.a) DAY as fecha
                FROM (SELECT 0 as a UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) as a
            ) as d
            LEFT JOIN Pagos p ON DATE(p.fecha_pago) = d.fecha AND p.barberia_id = :barberiaId
            LEFT JOIN Citas c ON p.cita_id = c.cita_id
            LEFT JOIN Barberos b ON c.barbero_id = b.barbero_id
            LEFT JOIN (
                SELECT DATE(fecha) as fecha_gasto, SUM(monto) as total_gastos
                FROM Gastos
                WHERE barberia_id = :barberiaId AND fecha >= CURDATE() - INTERVAL 6 DAY
                GROUP BY fecha_gasto
            ) as g ON d.fecha = g.fecha_gasto
            WHERE d.fecha >= CURDATE() - INTERVAL 6 DAY
            GROUP BY d.fecha
            ORDER BY d.fecha ASC;
        `;

        const weeklyData = await sequelize.query(weeklyQuery, {
            replacements: { barberiaId },
            type: QueryTypes.SELECT
        });

        const weekSummary = {
            labels: [],
            ingresosBarberia: [],
            ingresosBarberos: [],
            gastos: []
        };
        
        const dayNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
        weeklyData.forEach(row => {
            const date = new Date(row.fecha + 'T00:00:00-05:00'); // Asegurar zona horaria correcta
            weekSummary.labels.push(dayNames[date.getDay()]);
            weekSummary.ingresosBarberia.push(parseFloat(row.ingresosBarberia));
            weekSummary.ingresosBarberos.push(parseFloat(row.ingresosBarberos));
            weekSummary.gastos.push(parseFloat(row.gastos));
        });

        // --- CÁLCULOS MENSUALES ---
        const monthlyQuery = `
            SELECT
                COALESCE(SUM(CASE WHEN b.tipo_pago = 'comision' THEN p.monto_total * (1 - b.valor / 100) ELSE p.monto_total END), 0) as totalIngresosBarberia,
                COALESCE(SUM(CASE WHEN b.tipo_pago = 'comision' THEN p.monto_total * (b.valor / 100) ELSE 0 END), 0) as totalIngresosBarberos
            FROM Pagos p
            JOIN Citas c ON p.cita_id = c.cita_id
            JOIN Barberos b ON c.barbero_id = b.barbero_id
            WHERE p.barberia_id = :barberiaId
              AND MONTH(p.fecha_pago) = MONTH(CURDATE())
              AND YEAR(p.fecha_pago) = YEAR(CURDATE());
        `;
        
        const monthlyIncomeData = await sequelize.query(monthlyQuery, {
            replacements: { barberiaId },
            type: QueryTypes.SELECT
        });

        const totalGastosMes = await Gasto.sum('monto', {
            where: {
                barberia_id: barberiaId,
                fecha: {
                    [Op.gte]: Sequelize.literal('DATE_FORMAT(CURDATE(), "%Y-%m-01")'),
                    [Op.lt]: Sequelize.literal('DATE_FORMAT(CURDATE() + INTERVAL 1 MONTH, "%Y-%m-01")')
                }
            }
        });
        
        const monthSummary = {
            totalIngresosBarberia: parseFloat(monthlyIncomeData[0].totalIngresosBarberia),
            totalIngresosBarberos: parseFloat(monthlyIncomeData[0].totalIngresosBarberos),
            totalGastos: totalGastosMes || 0
        };

        res.json({
            semana: weekSummary,
            mes: monthSummary
        });

    } catch (error) {
        console.error('❌ Error en /api/dashboard/summary:', error);
        res.status(500).json({ message: 'Error interno del servidor al generar el resumen.' });
    }
});

app.post('/api/admin/ask-openai', verificarToken, verificarAdmin, async (req, res) => {
    const { pregunta } = req.body;
    if (!pregunta) { return res.status(400).json({ message: 'La pregunta es requerida.' }); }

    try {
        const barberiaIdParaPrompt = req.user.barberia_id;
        
        const prompt = `
		Eres un asistente experto en bases de datos MySQL y analista de datos para "BarberFlow+", una app de gestión de barberías. Tu única función es traducir la pregunta de un usuario a una consulta SQL pura y segura.

		### Esquema de la Base de Datos:
		${DATABASE_SCHEMA}

		### Contexto y Significado de Tablas Clave:
		- **Citas:** Registra cada cita. El campo 'estado' puede ser 'programada', 'completada', 'cancelada'.
		- **Pagos:** Son los INGRESOS del negocio. Cada pago está asociado a una cita.
		- **Gastos:** Son los EGRESOS del negocio (compras, salarios, etc.).
		- **Clientes:** Base de datos de los clientes de la barbería.
		- **Barberos:** Empleados que realizan los servicios.
		- **Servicios:** Catálogo de servicios que ofrece la barbería.

		### REGLAS CRÍTICAS E INQUEBRANTABLES:
		1.  **SOLO LECTURA:** La consulta DEBE ser únicamente de tipo SELECT.
		2.  **REGLA DE ORO (FILTRO OBLIGATORIO):** TODA consulta, sin excepción, DEBE contener un filtro por el ID de la barbería. La cláusula WHERE SIEMPRE debe incluir \`NombreTabla.barberia_id = ${barberiaIdParaPrompt}\`. Usa el nombre completo de la tabla para esta condición (ej. \`Pagos.barberia_id\`), NUNCA uses un alias (como \`p.barberia_id\`). Esto es vital para la seguridad.
		3.  **PRECISIÓN EN FECHAS:** Para preguntas sobre tiempo ("hoy", "este mes", "año pasado"), utiliza funciones de fecha de MySQL como CURDATE(), NOW(), DATE(), MONTH(), YEAR().
		4.  **SALIDA EXCLUSIVA:** Responde ÚNICAMENTE con el código SQL. No incluyas explicaciones, saludos, ni formato Markdown como \`\`\`sql. Solo el texto de la consulta.

		### Ejemplos de Preguntas y Consultas SQL Correctas:
		- **Usuario:** "¿Cuál fue el total de ventas de hoy?"
		- **SQL:** SELECT SUM(monto) AS total_ventas FROM Pagos WHERE DATE(fecha) = CURDATE() AND Pagos.barberia_id = ${barberiaIdParaPrompt};

		- **Usuario:** "Top 3 servicios más solicitados este mes"
		- **SQL:** SELECT s.nombre, COUNT(c.servicio_id) AS cantidad_citas FROM Citas c JOIN Servicios s ON c.servicio_id = s.id WHERE MONTH(c.fecha) = MONTH(CURDATE()) AND YEAR(c.fecha) = YEAR(CURDATE()) AND c.barberia_id = ${barberiaIdParaPrompt} GROUP BY s.nombre ORDER BY cantidad_citas DESC LIMIT 3;

		- **Usuario:** "¿Qué clientes no han vuelto en los últimos 6 meses?"
		- **SQL:** SELECT nombre, apellido, telefono FROM Clientes WHERE id NOT IN (SELECT cliente_id FROM Citas WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)) AND Clientes.barberia_id = ${barberiaIdParaPrompt};

		### Pregunta del Usuario a Traducir:	
		"${pregunta}"
	`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [ { role: 'user', content: prompt } ],
            max_tokens: 800,
            temperature: 0.0
        });

        let sqlQuery = completion.choices[0].message.content.trim();
        sqlQuery = sqlQuery.replace(/```sql/g, '').replace(/```/g, '').trim();

        console.log(`[OpenAI] Pregunta: "${pregunta}" -> SQL Generado: "${sqlQuery}"`);

        if (!sqlQuery.trim().toUpperCase().startsWith('SELECT')) {
            console.error(`[Seguridad OpenAI] Intento de consulta no permitida bloqueado: ${sqlQuery}`);
            return res.status(400).json({ message: 'La operación solicitada no es una consulta de lectura válida.' });
        }
        const filtroBarberiaRequerido = `barberia_id = ${barberiaIdParaPrompt}`;
        if (!sqlQuery.includes(filtroBarberiaRequerido)) {
             console.error(`[Seguridad OpenAI] Consulta bloqueada por falta de filtro de barberia_id: ${sqlQuery}`);
             return res.status(403).json({ message: 'La consulta generada es insegura y ha sido bloqueada. No incluye el filtro de barbería requerido.' });
        }

        const resultados = await sequelize.query(sqlQuery, { type: QueryTypes.SELECT, raw: true });
        res.status(200).json(resultados);

    } catch (error) {
        console.error('❌ Error en /api/admin/ask-openai:', error);
        if (error.response && error.response.data) {
            console.error('OpenAI response error:', error.response.data);
        }
        res.status(500).json({ message: 'Error al procesar la consulta con OpenAI.' });
    }
});

app.post('/api/register', async (req, res) => {
    const { nombre, apellido, email, password, telefono, fecha_nacimiento, barberia_id } = req.body;
    if (!nombre || !apellido || !email || !password || !barberia_id) { return res.status(400).json({ message: 'Todos los campos son obligatorios.' }); }
    const t = await sequelize.transaction();
    try {
        const usuarioExistente = await Usuario.findOne({ where: { email, barberia_id: barberia_id }, transaction: t });
        const clienteExistente = await Cliente.findOne({ where: { [Op.or]: [{email: email}, {telefono: telefono}] , barberia_id: barberia_id }, transaction: t });
        if (usuarioExistente || clienteExistente) {
            await t.rollback();
            return res.status(409).json({ message: 'El correo electrónico o teléfono ya está registrado en esta barbería.' });
        }
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        await Cliente.create({ nombre, apellido, email, telefono: telefono || null, fecha_nacimiento: fecha_nacimiento || null, barberia_id: barberia_id }, { transaction: t });
        await Usuario.create({ nombre_completo: `${nombre} ${apellido}`, email, password_hash, rol: 'cliente', barberia_id: barberia_id }, { transaction: t });
        await t.commit();
        res.status(201).json({ message: '¡Usuario registrado exitosamente! Ahora puedes iniciar sesión.' });
    } catch (error) {
        await t.rollback();
        console.error('Error en el registro de usuario:', error);
        res.status(500).json({ message: 'Error interno del servidor al registrar el usuario.' });
    }
});

app.post('/api/login', async (req, res) => { 
    try { 
        const { email, password, barberia_id } = req.body; 
        if (!email || !password || !barberia_id) { 
            return res.status(400).json({ message: 'El correo, la contraseña y el ID de la barbería son requeridos.' }); 
        } 
        
        const user = await Usuario.findOne({ where: { email, barberia_id: barberia_id } }); 

        if (!user) { 
            return res.status(401).json({ message: 'Credenciales incorrectas para esta barbería.' }); 
        } 
        const isPasswordCorrect = await bcrypt.compare(password, user.password_hash); 
        if (!isPasswordCorrect) { 
            return res.status(401).json({ message: 'Credenciales incorrectas.' }); 
        } 
        
        const payload = { id: user.usuario_id, rol: user.rol, barberia_id: user.barberia_id }; 
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' }); 
        res.status(200).json({ message: 'Login exitoso', token }); 
    } catch (error) { 
        console.error('Error en el login:', error); 
        res.status(500).json({ message: 'Error interno del servidor.' }); 
    } 
});

app.delete('/api/pagos/:id', verificarToken, verificarAdmin, async (req, res) => {
    const pagoId = req.params.id;
    const t = await sequelize.transaction();
    try {
        const pago = await Pago.findOne({
            where: {
                pago_id: pagoId,
                barberia_id: req.user.barberia_id
            },
            transaction: t
        });

        if (!pago) {
            await t.rollback();
            return res.status(404).json({ message: 'Pago no encontrado.' });
        }

        const cita = await Cita.findOne({
            where: {
                cita_id: pago.cita_id,
                barberia_id: req.user.barberia_id
            },
            transaction: t
        });

        if (cita) {
            cita.estado = 'programada';
            await cita.save({ transaction: t });
        }

        await pago.destroy({ transaction: t });

        await t.commit();
        res.status(200).json({ message: 'Pago eliminado exitosamente y estado de la cita revertido.' });

    } catch (error) {
        await t.rollback();
        console.error("Error al eliminar el pago:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

app.get('/api/configuracion', verificarToken, async (req, res) => { 
    try { 
        const infoFiscal = await InformacionFiscal.findByPk(req.user.barberia_id, { attributes: ['Establecimiento_Comercio', 'Logo_URL'] }); 
        if (!infoFiscal) { 
            return res.status(404).json({ message: 'No se encontró la configuración de la barbería.' }); 
        } 
        res.json({ nombre: infoFiscal.Establecimiento_Comercio, logoUrl: infoFiscal.Logo_URL }); 
    } catch (error) { 
        console.error("Error al obtener la configuración:", error); 
        res.status(500).json({ message: "Error interno del servidor" }); 
    } 
});

app.get('/api/dashboard/kpis', verificarToken, async (req, res) => { 
    try {
        const whereClause = { barberia_id: req.user.barberia_id };
        const dateClause = {
            [Op.gte]: Sequelize.literal('CURDATE()'),
            [Op.lt]: Sequelize.literal('CURDATE() + INTERVAL 1 DAY')
        };
        const pagosHoy = Number(await Pago.sum('monto_total', { where: { ...whereClause, fecha_pago: dateClause } })) || 0;
        const ventasProductosHoy = Number(await VentaProducto.sum('precio_venta_momento', { where: { ...whereClause, fecha_venta: dateClause } })) || 0;
        const ingresosTotales = pagosHoy + ventasProductosHoy;
        const gastosHoy = Number(await Gasto.sum('monto', { where: { ...whereClause, fecha: dateClause } })) || 0;
        const citasHoy = await Cita.count({ where: { ...whereClause, fecha_hora_inicio: dateClause } });
        const utilidadHoy = ingresosTotales - gastosHoy;
        res.json({ ingresos: ingresosTotales.toFixed(2), gastos: gastosHoy.toFixed(2), utilidad: utilidadHoy.toFixed(2), citas: citasHoy });
    } catch (error) {
        console.error("Error al obtener KPIs del dashboard:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

app.get('/api/productos/bajo-stock', verificarToken, async (req, res) => { try { const productosBajos = await Producto.findAll({ where: { stock_actual: { [Op.lte]: Sequelize.col('stock_minimo') }, barberia_id: req.user.barberia_id }, order: [['stock_actual', 'ASC']] }); res.json(productosBajos); } catch (error) { console.error("Error al obtener productos con bajo stock:", error); res.status(500).json({ message: "Error interno del servidor" }); } });
app.get('/api/productos', verificarToken, async (req, res) => { try { const productos = await Producto.findAll({ where: { barberia_id: req.user.barberia_id }, order: [['nombre', 'ASC']] }); res.json(productos); } catch (error) { console.error("Error al obtener productos:", error); res.status(500).json({ message: "Error interno del servidor" }); } });
app.post('/api/productos', verificarToken, verificarAdmin, async (req, res) => { try { const { nombre, precio_venta, costo_compra, stock_minimo } = req.body; await Producto.create({ nombre, precio_venta, costo_compra, stock_minimo, stock_actual: 0, barberia_id: req.user.barberia_id }); res.status(201).json({ message: 'Producto creado exitosamente' }); } catch (error) { if (error.name === 'SequelizeUniqueConstraintError') { res.status(409).json({ message: "Ya existe un producto con ese nombre en esta barbería." }); } else { console.error("Error al crear producto:", error); res.status(500).json({ message: "Error interno del servidor" }); } } });
app.post('/api/compras', verificarToken, verificarAdmin, async (req, res) => { try { const { producto_id, cantidad, costo_total } = req.body; await Compra.create({ producto_id, cantidad, costo_total, usuario_id: req.user.id, fecha_compra: new Date(), barberia_id: req.user.barberia_id }); await Producto.increment('stock_actual', { by: cantidad, where: { producto_id: producto_id, barberia_id: req.user.barberia_id } }); res.status(201).json({ message: 'Compra registrada y stock actualizado' }); } catch (error) { console.error("Error al registrar compra:", error); res.status(500).json({ message: "Error interno del servidor" }); } });
app.post('/api/ventas-consumo', verificarToken, verificarAdmin, async (req, res) => { const t = await sequelize.transaction(); try { const { producto_id, cantidad } = req.body; if (!producto_id || !cantidad || cantidad <= 0) { return res.status(400).json({ message: 'El ID del producto y una cantidad válida son requeridos.' }); } const producto = await Producto.findOne({ where: { producto_id, barberia_id: req.user.barberia_id }, transaction: t }); if (!producto) { await t.rollback(); return res.status(404).json({ message: 'Producto no encontrado.' }); } if (producto.stock_actual < cantidad) { await t.rollback(); return res.status(400).json({ message: `Stock insuficiente. Solo quedan ${producto.stock_actual} unidades de ${producto.nombre}.` }); } await VentaProducto.create({ producto_id: producto.producto_id, cantidad: cantidad, precio_venta_momento: producto.precio_venta * cantidad, fecha_venta: new Date(), barberia_id: req.user.barberia_id }, { transaction: t }); await producto.decrement('stock_actual', { by: cantidad, transaction: t }); await t.commit(); res.status(201).json({ message: 'Operación registrada y stock actualizado.' }); } catch (error) { await t.rollback(); console.error("Error al registrar venta/consumo:", error); res.status(500).json({ message: "Error interno del servidor." }); } });
app.post('/api/consumos', verificarToken, verificarAdmin, async (req, res) => { const t = await sequelize.transaction(); try { const { producto_id, cantidad } = req.body; if (!producto_id || !cantidad || cantidad <= 0) { return res.status(400).json({ message: 'El ID del producto y una cantidad válida son requeridos.' }); } const producto = await Producto.findOne({ where: { producto_id, barberia_id: req.user.barberia_id }, transaction: t }); if (!producto) { await t.rollback(); return res.status(404).json({ message: 'Producto no encontrado.' }); } if (producto.stock_actual < cantidad) { await t.rollback(); return res.status(400).json({ message: `Stock insuficiente para el consumo. Solo quedan ${producto.stock_actual} unidades de ${producto.nombre}.` }); } await ConsumoProducto.create({ producto_id: producto.producto_id, cantidad: cantidad, precio_costo_momento: producto.costo_compra, fecha_consumo: new Date(), barberia_id: req.user.barberia_id }, { transaction: t }); await producto.decrement('stock_actual', { by: cantidad, transaction: t }); await t.commit(); res.status(201).json({ message: 'Consumo interno registrado y stock actualizado.' }); } catch (error) { await t.rollback(); console.error("Error al registrar consumo interno:", error); res.status(500).json({ message: "Error interno del servidor." }); } });
app.get('/api/clientes', verificarToken, async (req, res) => { try { const clientes = await Cliente.findAll({ where: { barberia_id: req.user.barberia_id }, order: [['nombre', 'ASC']] }); res.json(clientes); } catch (error) { res.status(500).json({ message: "Error al obtener clientes" }); } });
app.post('/api/clientes', verificarToken, verificarAdmin, async (req, res) => { try { const { nombre, apellido, telefono, email, fecha_nacimiento, notas } = req.body; const nuevoCliente = await Cliente.create({ nombre, apellido, telefono, email, fecha_nacimiento, notas, barberia_id: req.user.barberia_id }); res.status(201).json(nuevoCliente); } catch (error) { if (error.name === 'SequelizeUniqueConstraintError') { console.error('--- DETALLE DE ERROR DE RESTRICCIÓN ÚNICA ---'); console.error('Mensaje Original:', error.original.sqlMessage); console.error('Campos con Error:', error.fields); console.error('------------------------------------------'); res.status(409).json({ message: "Error al crear el cliente. El teléfono o email ya están registrados en esta barbería." }); } else { console.error("Error al crear cliente:", error); res.status(500).json({ message: "Error interno del servidor." }); } } });
app.get('/api/clientes/:id/completo', verificarToken, async (req, res) => { try { const cliente = await Cliente.findOne({ where: { cliente_id: req.params.id, barberia_id: req.user.barberia_id }, include: [{ model: Cita, include: [Barbero, Servicio] }] }); if (!cliente) { return res.status(404).json({ message: 'Cliente no encontrado' }); } res.json(cliente); } catch (error) { console.error("Error al obtener cliente 360:", error); res.status(500).json({ message: "Error interno del servidor" }); } });
app.put('/api/clientes/:id', verificarToken, verificarAdmin, async (req, res) => { try { const cliente = await Cliente.findOne({ where: { cliente_id: req.params.id, barberia_id: req.user.barberia_id } }); if (!cliente) { return res.status(404).json({ message: 'Cliente no encontrado' }); } await cliente.update(req.body); return res.status(200).json(cliente); } catch (error) { if (error.name === 'SequelizeUniqueConstraintError') { res.status(409).json({ message: "Error al actualizar. El teléfono o email ya pertenecen a otro cliente en esta barbería." }); } else { console.error("Error al actualizar cliente:", error); res.status(500).json({ message: "Error interno del servidor." }); } } });
app.post('/api/clientes/:id/foto', verificarToken, verificarAdmin, upload.single('foto'), async (req, res) => {
    try {
        const cliente = await Cliente.findOne({ where: { cliente_id: req.params.id, barberia_id: req.user.barberia_id } });
        if (!cliente) { return res.status(404).json({ message: 'Cliente no encontrado' }); }
        if (!req.file) { return res.status(400).json({ message: 'No se ha subido ningún archivo.' }); }
        const cloudinaryResult = await uploadToCloudinary(req.file.buffer);
        const urlFoto = cloudinaryResult.secure_url;
        const tipoFoto = req.body.tipo;
        if (tipoFoto === 'antes') { await cliente.update({ foto_antes_url: urlFoto }); } else if (tipoFoto === 'despues') { await cliente.update({ foto_despues_url: urlFoto }); } else { return res.status(400).json({ message: "El tipo de foto es inválido." }); }
        res.status(200).json({ message: 'Foto subida exitosamente a Cloudinary', url: urlFoto });
    } catch (error) { console.error("Error al subir foto a Cloudinary:", error); res.status(500).json({ message: "Error interno del servidor." }); }
});
app.get('/api/barberos', verificarToken, async (req, res) => { try { const barberos = await Barbero.findAll({ where: { barberia_id: req.user.barberia_id }, order: [['nombre', 'ASC']] }); res.json(barberos); }	catch (error) { res.status(500).json({ message: "Error al obtener barberos" }); } });
app.post('/api/barberos', verificarToken, verificarAdmin, async (req, res) => { try { const nuevoBarbero = await Barbero.create({ ...req.body, barberia_id: req.user.barberia_id }); res.status(201).json(nuevoBarbero); } catch (error) { if (error.name === 'SequelizeUniqueConstraintError') { res.status(409).json({ message: "Error al crear el barbero. El celular o email ya están registrados en esta barbería." }); } else { console.error("Error al crear barbero:", error); res.status(500).json({ message: "Error interno del servidor." }); } } });
app.get('/api/barberos/:id', verificarToken, async (req, res) => { try { const barbero = await Barbero.findOne({ where: { barbero_id: req.params.id, barberia_id: req.user.barberia_id } }); if (barbero) { res.json(barbero); } else { res.status(404).json({ message: 'Barbero no encontrado' }); } } catch (error) { res.status(500).json({ message: "Error al obtener datos del barbero." }); } });
app.put('/api/barberos/:id', verificarToken, verificarAdmin, async (req, res) => { try { const barbero = await Barbero.findOne({ where: { barbero_id: req.params.id, barberia_id: req.user.barberia_id } }); if (!barbero) { return res.status(404).json({ message: 'Barbero no encontrado' }); } await barbero.update(req.body); return res.status(200).json(barbero); } catch (error) { if (error.name === 'SequelizeUniqueConstraintError') { res.status(409).json({ message: "Error al actualizar. El celular o email ya pertenecen a otro barbero en esta barbería." }); } else { console.error("Error al actualizar barbero:", error); res.status(500).json({ message: "Error interno del servidor." }); } } });
app.post('/api/barberos/:id/foto', verificarToken, verificarAdmin, upload.single('foto'), async (req, res) => {
    try {
        const barbero = await Barbero.findOne({ where: { barbero_id: req.params.id, barberia_id: req.user.barberia_id } });
        if (!barbero) { return res.status(404).json({ message: 'Barbero no encontrado' }); }
        if (!req.file) { return res.status(400).json({ message: 'No se ha subido ningún archivo.' }); }
        const cloudinaryResult = await uploadToCloudinary(req.file.buffer);
        const urlFoto = cloudinaryResult.secure_url;
        await barbero.update({ foto_url: urlFoto });
        res.status(200).json({ message: 'Foto de barbero subida exitosamente a Cloudinary', url: urlFoto });
    } catch (error) { console.error("Error al subir foto de barbero a Cloudinary:", error); res.status(500).json({ message: "Error interno del servidor." }); }
});
app.get('/api/servicios', verificarToken, async (req, res) => { try { const servicios = await Servicio.findAll({ where: { barberia_id: req.user.barberia_id }, order: [['nombre', 'ASC']] }); res.json(servicios); } catch (error) { res.status(500).json({ message: "Error al obtener servicios" }); } });
app.post('/api/servicios', verificarToken, verificarAdmin, async (req, res) => { try { const { nombre, precio } = req.body; if (!nombre || precio === undefined) { return res.status(400).json({ message: 'El nombre y el precio son requeridos.' }); } const nuevoServicio = await Servicio.create({ nombre, precio, barberia_id: req.user.barberia_id }); res.status(201).json({ message: 'Servicio creado exitosamente.', servicio: nuevoServicio }); } catch (error) { if (error.name === 'SequelizeUniqueConstraintError') { res.status(409).json({ message: "Ya existe un servicio con ese nombre en esta barbería." }); } else { console.error("Error al crear el servicio:", error); res.status(500).json({ message: "Error interno del servidor." }); } } });
app.put('/api/servicios/:id', verificarToken, verificarAdmin, async (req, res) => { try { const { id } = req.params; const { nombre, precio } = req.body; const servicio = await Servicio.findOne({ where: { servicio_id: id, barberia_id: req.user.barberia_id } }); if (!servicio) { return res.status(404).json({ message: 'Servicio no encontrado.' }); } await servicio.update({ nombre, precio }); res.status(200).json({ message: 'Servicio actualizado exitosamente.', servicio }); } catch (error) { if (error.name === 'SequelizeUniqueConstraintError') { res.status(409).json({ message: "Ya existe un servicio con ese nombre en esta barbería." }); } else { console.error("Error al actualizar el servicio:", error); res.status(500).json({ message: "Error interno del servidor." }); } } });
app.get('/api/citas', verificarToken, async (req, res) => { try { const { barbero_id } = req.query; let whereClause = { barberia_id: req.user.barberia_id }; if (barbero_id) { whereClause.barbero_id = barbero_id; } const citas = await Cita.findAll({ where: whereClause, include: [Cliente, Barbero, Servicio] }); const eventos = citas.map(cita => { const serviciosNombres = cita.Servicios.map(s => s.nombre).join(' + '); const color = cita.estado === 'pagada' ? '#27ae60' : (cita.estado === 'cancelada' ? '#808080' : '#b08f57'); return { id: cita.cita_id, title: `${cita.Cliente.nombre} ${cita.Cliente.apellido} (${serviciosNombres})`, start: cita.fecha_hora_inicio, end: cita.fecha_hora_fin, extendedProps: { barbero: `${cita.Barbero.nombre} ${cita.Barbero.apellido}`, estado: cita.estado }, backgroundColor: color, borderColor: color }; }); res.json(eventos); } catch (error) { console.error(error); res.status(500).json({ message: "Error al obtener citas" }); } });
app.post('/api/citas', verificarToken, async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { cliente_id, barbero_id, fecha_hora_inicio, fecha_hora_fin, servicios } = req.body;
        const nuevaCita = await Cita.create({ cliente_id, barbero_id, fecha_hora_inicio, fecha_hora_fin, barberia_id: req.user.barberia_id }, { transaction: t });
        if (servicios && servicios.length > 0) { await nuevaCita.setServicios(servicios, { transaction: t, through: { barberia_id: req.user.barberia_id } }); }
        await t.commit();
        const cliente = await Cliente.findByPk(cliente_id);
        if (cliente && cliente.telefono) { const fechaFormateada = new Date(fecha_hora_inicio).toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' }); const infoFiscal = await InformacionFiscal.findByPk(req.user.barberia_id); const nombreBarberia = infoFiscal ? infoFiscal.Establecimiento_Comercio : "tu barbería"; const mensaje = `Hola ${cliente.nombre}! Te confirmamos tu cita en *${nombreBarberia}* para el ${fechaFormateada}. ¡Te esperamos!`; enviarMensajeWhatsapp(cliente.telefono, mensaje); }
        res.status(201).json({ message: 'Cita creada exitosamente' });
    } catch (error) { await t.rollback(); console.error('Error al crear cita:', error); res.status(500).json({ message: 'Error al crear la cita' }); }
});
app.get('/api/citas/:id', verificarToken, async (req, res) => { try { const cita = await Cita.findOne({ where: { cita_id: req.params.id, barberia_id: req.user.barberia_id }, include: [ { model: Cliente, attributes: ['nombre', 'apellido'] }, { model: Barbero, attributes: ['nombre', 'apellido'] }, { model: Servicio, attributes: ['nombre', 'precio'], through: { attributes: [] } } ] }); if (!cita) { return res.status(404).json({ message: 'Cita no encontrada' }); } res.json(cita); } catch (error) { console.error("Error al obtener detalle de la cita:", error); res.status(500).json({ message: 'Error interno del servidor' }); } });
app.get('/api/barberos/:barbero_id/horario', verificarToken, async (req, res) => { try { const horarios = await Horario.findAll({ where: { barbero_id: req.params.barbero_id, barberia_id: req.user.barberia_id } }); res.json(horarios); } catch (error) { console.error("Error al obtener horario del barbero:", error); res.status(500).json({ message: "Error interno del servidor" }); } });
app.put('/api/citas/:id/cancelar', verificarToken, verificarAdmin, async (req, res) => { try { const { id } = req.params; const { motivo } = req.body; const cita = await Cita.findOne({ where: { cita_id: id, barberia_id: req.user.barberia_id } }); if (!cita) { return res.status(404).json({ message: 'Cita no encontrada.' }); } if (cita.estado !== 'programada') { return res.status(400).json({ message: `No se puede cancelar una cita que ya está ${cita.estado}.`}); } await cita.update({ estado: 'cancelada', motivo_cancelacion: motivo, fecha_cancelacion: new Date() }); res.status(200).json({ message: 'La cita ha sido cancelada exitosamente.' }); } catch (error) { console.error("Error al cancelar la cita:", error); res.status(500).json({ message: "Error interno del servidor." }); } });
app.post('/api/pagos', verificarToken, verificarAdmin, async (req, res) => { const t = await sequelize.transaction(); try { const { cita_id, monto_total, metodo_pago } = req.body; const infoFiscal = await InformacionFiscal.findByPk(req.user.barberia_id, { transaction: t }); if (!infoFiscal) { await t.rollback(); return res.status(500).json({ message: "No se encontró información fiscal para generar la factura." }); } const nuevoConsecutivo = infoFiscal.consecutivo_factura + 1; const citaExistente = await Cita.findOne({ where: { cita_id, barberia_id: req.user.barberia_id }, include: [Cliente, Barbero, Servicio], transaction: t }); if (!citaExistente) { await t.rollback(); return res.status(404).json({ message: "La cita especificada no existe." }); } if (citaExistente.estado === 'pagada') { await t.rollback(); return res.status(400).json({ message: "Esta cita ya ha sido pagada." }); } const nuevoPago = await Pago.create({ cita_id, monto_total, metodo_pago, fecha_pago: new Date(), barberia_id: req.user.barberia_id }, { transaction: t }); await infoFiscal.update({ consecutivo_factura: nuevoConsecutivo }, { transaction: t }); await citaExistente.update({ estado: 'pagada' }, { transaction: t }); const pdfPath = await generarFacturaPDF(citaExistente, nuevoPago, infoFiscal, nuevoConsecutivo); if (citaExistente.Cliente && citaExistente.Cliente.telefono) { const mensaje = `Hola ${citaExistente.Cliente.nombre}, te confirmamos tu pago de ${parseFloat(monto_total).toLocaleString('es-CO', {style: 'currency', currency: 'COP'})} por tu servicio en ${infoFiscal.Establecimiento_Comercio} (Factura N° ${String(nuevoConsecutivo).padStart(7, '0')}). ¡Gracias por tu visita!`; enviarMensajeWhatsapp(citaExistente.Cliente.telefono, mensaje); } await t.commit(); res.status(201).json({ message: "Pago registrado exitosamente. Factura generada.", pdfUrl: `/facturas/factura-${nuevoConsecutivo}.pdf` }); } catch (error) { await t.rollback(); console.error("Error al registrar el pago:", error); res.status(500).json({ message: "Error interno del servidor." }); } });
app.get('/api/reportes/ventas', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        if (!fechaInicio || !fechaFin) { return res.status(400).json({ message: "Las fechas de inicio y fin son requeridas." }); }
        
        const pagos = await Pago.findAll({
            where: {
                barberia_id: req.user.barberia_id,
                fecha_pago: { [Op.between]: [fechaInicio, fechaFin] }
            },
            include: [ { model: Cita, include: [ { model: Barbero, attributes: ['nombre', 'apellido'] }, { model: Cliente, attributes: ['nombre', 'apellido'] }, { model: Servicio, attributes: ['nombre'], through: { attributes: [] } } ] } ],
            order: [['fecha_pago', 'DESC']]
        });
        res.json(pagos);
    } catch (error) {
        console.error("Error al obtener reporte de ventas:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});
app.get('/api/reportes/gastos', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        if (!fechaInicio || !fechaFin) { return res.status(400).json({ message: "Las fechas de inicio y fin son requeridas." }); }
        
        const gastos = await Gasto.findAll({
            where: {
                barberia_id: req.user.barberia_id,
                fecha: { [Op.between]: [fechaInicio, fechaFin] }
            },
            order: [['fecha', 'DESC']]
        });
        res.json(gastos);
    } catch (error) {
        console.error("Error al obtener reporte de gastos:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});
app.get('/api/reportes/cancelaciones', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        if (!fechaInicio || !fechaFin) { return res.status(400).json({ message: "Las fechas de inicio y fin son requeridas." }); }
        
        const citasCanceladas = await Cita.findAll({
            where: {
                barberia_id: req.user.barberia_id,
                estado: 'cancelada',
                fecha_cancelacion: { [Op.between]: [fechaInicio, fechaFin] }
            },
            include: [ { model: Cliente, attributes: ['nombre', 'apellido'] }, { model: Barbero, attributes: ['nombre', 'apellido'] } ],
            order: [['fecha_cancelacion', 'DESC']]
        });
        res.json(citasCanceladas);
    } catch (error) {
        console.error("Error al obtener reporte de cancelaciones:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});
app.get('/api/reportes/liquidacion', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const { fechaInicio, fechaFin, barberoId } = req.query;
        if (!fechaInicio || !fechaFin) { return res.status(400).json({ message: "Las fechas de inicio y fin son requeridas." }); }
        
        let whereClause = { barberia_id: req.user.barberia_id };
        if (barberoId && barberoId !== 'todos') {
            whereClause.barbero_id = barberoId;
        }
        
        const barberos = await Barbero.findAll({ where: whereClause });
        const resultadoLiquidacion = [];
        
        for (const barbero of barberos) {
            const ingresos = await Pago.sum('monto_total', {
                include: [{
                    model: Cita,
                    required: true,
                    where: { barbero_id: barbero.barbero_id, barberia_id: req.user.barberia_id }
                }],
                where: {
                    barberia_id: req.user.barberia_id,
                    fecha_pago: { [Op.between]: [fechaInicio, fechaFin] }
                }
            });
            const totalIngresos = Number(ingresos) || 0;
            let valorAPagar = 0;
            if (barbero.tipo_pago === 'comision' && barbero.valor) {
                valorAPagar = totalIngresos * (barbero.valor / 100);
            }
            resultadoLiquidacion.push({
                barbero: `${barbero.nombre} ${barbero.apellido}`,
                ingresosGenerados: totalIngresos,
                porcentajeComision: barbero.tipo_pago === 'comision' ? barbero.valor : 'N/A',
                valorAPagar: valorAPagar
            });
        }
        res.json(resultadoLiquidacion);
    } catch (error) {
        console.error("Error al generar reporte de liquidación:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

// --- SERVIR ARCHIVOS ESTÁTICOS Y RUTA CATCH-ALL ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/facturas', express.static(path.join(__dirname, 'facturas')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- TAREAS PROGRAMADAS Y SERVIDOR ---

const enviarCorreosCumpleanos = async () => { 
    console.log(`⏰ Ejecutando tarea de cumpleaños...`); 
    const hoy = new Date(); 
    const mesActual = hoy.getMonth() + 1; 
    const diaActual = hoy.getDate(); 
    try { 
        const cumpleaneros = await Cliente.findAll({ 
            where: { 
                [Op.and]: [ 
                    Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('fecha_nacimiento')), mesActual), 
                    Sequelize.where(Sequelize.fn('DAY', Sequelize.col('fecha_nacimiento')), diaActual) 
                ] 
            },
            include: [InformacionFiscal]
        }); 
        
        if (cumpleaneros.length === 0) { 
            console.log(`-> No hay cumpleaños hoy.`); 
            return; 
        } 
        
        console.log(`-> ¡Se encontraron ${cumpleaneros.length} cumpleaños hoy! Enviando correos...`); 
        
        for (const cliente of cumpleaneros) { 
            if (cliente.email && cliente.Informacion_Fiscal) { 
                const nombreBarberia = cliente.Informacion_Fiscal.Establecimiento_Comercio;
                const mailOptions = { 
                    from: `"${nombreBarberia}" <${process.env.EMAIL_USER}>`, 
                    to: cliente.email, 
                    subject: `🎉 ¡Feliz Cumpleaños de parte de ${nombreBarberia}! 🎉`, 
                    html: `<h1>¡Feliz Cumpleaños, ${cliente.nombre}!</h1><p>Todo el equipo de ${nombreBarberia} te desea un día increíble.</p><p>¡Esperamos verte pronto para celebrar!</p><br><p>Saludos,</p><p><strong>El equipo de ${nombreBarberia}</strong></p>` 
                }; 
                transporter.sendMail(mailOptions, (error, info) => { 
                    if (error) { 
                        console.error(`Error al enviar correo a ${cliente.email}:`, error); 
                    } else { 
                        console.log(`Correo de cumpleaños enviado a: ${cliente.email} para barbería ID ${cliente.barberia_id}`); 
                    } 
                }); 
            } 
        } 
    } catch (error) { 
        console.error('Error en la tarea de verificación de cumpleaños:', error); 
    } 
};

cron.schedule('0 9 * * *', enviarCorreosCumpleanos, { scheduled: true, timezone: "America/Bogota" });
console.log('✅ Tarea de envío de correos de cumpleaños programada para las 9:00 AM todos los días.');

// --- INICIAR EL SERVIDOR ---
const iniciarServidor = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexión a la base de datos establecida correctamente.');
        
        // await sequelize.sync({ alter: true }); // No usar en producción
        
        console.log('✅ Modelos sincronizados con la base de datos.');
        app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Error fatal al iniciar el servidor:', error);
        process.exit(1);
    }
};

iniciarServidor();

