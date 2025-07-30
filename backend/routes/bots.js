import express from 'express';
import WebhookHandler from '../services/WebhookHandler.js';
import Meeting from '../models/Meeting.js';
import { verifyToken } from '../utils/encryption.js';

const router = express.Router();

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Access denied' });
    }

    const decoded = await verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.post('/join-by-link', authenticate, async (req, res) => {
  try {
    const { invitationLink } = req.body;
    
    if (!invitationLink) {
      return res.status(400).json({ error: 'Invitation link required' });
    }

    const result = await WebhookHandler.handleBotJoinByLink(
      invitationLink, 
      req.user.id
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/active', authenticate, async (req, res) => {
  try {
    const meetings = await Meeting.find({
      userId: req.user.id,
      status: { $in: ['recording', 'active'] }
    }).select('meetingId status recordingMethod startTime');

    res.json({
      success: true,
      activeBots: meetings.length,
      meetings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router; 