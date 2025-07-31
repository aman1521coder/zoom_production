import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import webhookRoutes from './routes/webhooks.js';
import recordingRoutes from './routes/recordings.js';
import botRoutes from './routes/bots.js';
import transcriptRoutes from './routes/transcripts.js';
import { authenticate } from './middleware/auth.js';

dotenv.config({ path: './config.env' });

const app = express();
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zoom-ai-bot')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

app.use(cors({
  origin: '*', // Allow all origins for debugging
  credentials: true
}));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'AiZoomAI Backend',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'AiZoomAI Backend API',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/recordings', recordingRoutes);  
app.use('/api/bots', authenticate, botRoutes);
app.use('/api/transcripts', authenticate, transcriptRoutes);

// Debug endpoint to verify API routing
app.get('/api/debug', (req, res) => {
  res.json({
    success: true,
    message: 'API routing is working',
    timestamp: new Date().toISOString(),
    environment: {
      VPS_SECRET: process.env.VPS_SECRET ? 'SET' : 'NOT SET',
      MONGODB_URI: process.env.MONGODB_URI ? 'SET' : 'NOT SET',
      NODE_ENV: process.env.NODE_ENV || 'not set'
    }
  });
});

// Public VPS health check (no auth required)
app.get('/api/vps-health', async (req, res) => {
  try {
    const VPS_URL = process.env.VPS_URL || 'http://147.93.119.85:3000';
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(`${VPS_URL}/health`, {
      timeout: 5000
    });

    if (response.ok) {
      const vpsHealth = await response.json();
      res.json({
        success: true,
        vps: vpsHealth,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'VPS health check failed',
        status: response.status
      });
    }
  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'VPS unreachable',
      message: error.message
    });
  }
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, error: 'Server error' });
});

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});

export default app;
