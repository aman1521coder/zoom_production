import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const secretKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);

export const encrypt = (text) => {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, secretKey);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      iv: iv.toString('hex'),
      encrypted: encrypted,
      tag: authTag.toString('hex')
    };
  } catch (error) {
    return null;
  }
};

export const decrypt = (encryptedData) => {
  try {
    const decipher = crypto.createDecipher(algorithm, secretKey);
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    return null;
  }
};

export const hashPassword = async (password) => {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 12);
};

export const verifyPassword = async (password, hash) => {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hash);
};

export const generateToken = async (payload) => {
  const jwt = await import('jsonwebtoken');
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
};

export const verifyToken = async (token) => {
  const jwt = await import('jsonwebtoken');
  return jwt.verify(token, process.env.JWT_SECRET);
}; 