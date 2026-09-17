const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';

function getKey() {
  const key = process.env.ENCRYPTION_KEY || '';
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 characters long. Check your .env file.');
  }
  return Buffer.from(key, 'utf8');
}

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  // Store iv alongside ciphertext (iv:ciphertext, both hex)
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(payload) {
  if (!payload) return null;
  const [ivHex, dataHex] = payload.split(':');
  if (!ivHex || !dataHex) return null;
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
