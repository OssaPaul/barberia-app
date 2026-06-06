// Archivo: crearHash.js
const bcrypt = require('bcryptjs');

// La contraseña que QUIERES usar para iniciar sesión
const miClaveSecreta = 'clave123';

// Generamos el hash
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(miClaveSecreta, salt);

console.log('Tu contraseña en texto plano es:', miClaveSecreta);
console.log('Pega este HASH en la base de datos:', hash);