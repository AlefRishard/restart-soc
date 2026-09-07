const CryptoJS = require("crypto-js");

// Chave secreta usada para criptografar/descriptografar
const SECRET_KEY = process.env.SECRET_KEY || "chave_secreta_restart_123!";

function encriptar(texto) {
  return CryptoJS.AES.encrypt(texto, SECRET_KEY).toString();
}

function decriptar(hash) {
  const bytes = CryptoJS.AES.decrypt(hash, SECRET_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

module.exports = { encriptar, decriptar };