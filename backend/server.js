import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import webhookRoutes from './routes/webhooks.js';
import recordingRoutes from './routes/recordings.js';
import botRoutes from './routes/bots.js';
import { authenticate } from './middleware/auth.js';

dotenv.config({ path: './config.env' });

const app = express();
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zoom-ai-bot')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'AiZoomAI Backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/recordings', authenticate, recordingRoutes);
app.use('/api/bots', authenticate, botRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, error: 'Server error' });
});

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});

export default app;
