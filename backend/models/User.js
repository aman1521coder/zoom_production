import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/encryption.js';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  firstName: String,
  lastName: String,
  zoomId: {
    type: String,
    unique: true,
    sparse: true
  },
  accessToken: {
    type: String,
    set: function(token) {
      if (!token) return token;
      const encrypted = encrypt(token);
      return encrypted ? JSON.stringify(encrypted) : token;
    },
    get: function(encryptedToken) {
      if (!encryptedToken) return encryptedToken;
      try {
        const parsed = JSON.parse(encryptedToken);
        return decrypt(parsed);
      } catch {
        return encryptedToken;
      }
    }
  },
  refreshToken: {
    type: String,
    set: function(token) {
      if (!token) return token;
      const encrypted = encrypt(token);
      return encrypted ? JSON.stringify(encrypted) : token;
    },
    get: function(encryptedToken) {
      if (!encryptedToken) return encryptedToken;
      try {
        const parsed = JSON.parse(encryptedToken);
        return decrypt(parsed);
      } catch {
        return encryptedToken;
      }
    }
  },
  tokenExpiry: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  preferences: {
    autoRecord: {
      type: Boolean,
      default: true
    },
    transcriptLanguage: {
      type: String,
      default: 'en-US'
    }
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

userSchema.index({ email: 1 });
userSchema.index({ zoomId: 1 });

export default mongoose.model('User', userSchema); 