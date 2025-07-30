import express from 'express';
import WebhookHandler from '../services/WebhookHandler.js';
import Meeting from '../models/Meeting.js';

const router = express.Router();

router.post('/join-by-link', async (req, res) => {
  try {
    const { invitationLink } = req.body;
    
    if (!invitationLink) {
      return res.status(400).json({ error: 'Invitation link required' });
    }

    const result = await WebhookHandler.handleBotJoinByLink(
      invitationLink, 
      req.user._id
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/active', async (req, res) => {
  try {
    const meetings = await Meeting.find({
      userId: req.user._id,
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