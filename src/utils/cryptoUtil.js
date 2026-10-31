const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Derives and validates a 32-byte encryption key from the environment.
 * Fails securely if REVIEW_ENCRYPTION_KEY is missing or insecure.
 */
function getEncryptionKey() {
  const envKey = process.env.REVIEW_ENCRYPTION_KEY;
  if (!envKey || typeof envKey !== 'string' || envKey.trim().length < 16) {
    throw new Error('Missing or invalid REVIEW_ENCRYPTION_KEY: A secure dedicated key of at least 16 characters is required.');
  }

  // If provided as a 64-char hex string (32 bytes)
  if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }

  // Derive a 32-byte key via SHA-256
  return crypto.createHash('sha256').update(envKey).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param {string} plaintext - The secret text to encrypt
 * @returns {string} - Formatted as iv:authTag:ciphertext (hex encoded)
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return null;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(String(plaintext), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string and verifies the authentication tag.
 * @param {string} encryptedStr - Formatted as iv:authTag:ciphertext (hex encoded)
 * @returns {string} - Decrypted plaintext string
 */
function decrypt(encryptedStr) {
  if (!encryptedStr || typeof encryptedStr !== 'string') {
    return null;
  }

  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format: Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid ciphertext parameters: Corrupted IV or AuthTag length');
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    throw new Error('Authentication tag verification failed: Data may have been tampered with or key is incorrect');
  }
}

/**
 * Safely masks a sensitive secret for API responses.
 * Never returns plaintext or complete values.
 */
function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return null;
  const trimmed = secret.trim();
  if (trimmed.length <= 4) return '****';
  return `****...${trimmed.slice(-4)}`;
}

module.exports = {
  encrypt,
  decrypt,
  maskSecret,
  getEncryptionKey
};

