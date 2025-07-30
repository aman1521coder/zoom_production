import express from 'express';
import WebhookHandler from '../services/WebhookHandler.js';

const router = express.Router();

router.post('/zoom', async (req, res) => {
  try {
    const { event, payload } = req.body;
    let result;

    switch (event) {
      case 'meeting.started':
        result = await WebhookHandler.handleMeetingStarted(payload);
        break;
        
      case 'meeting.ended':
        result = await WebhookHandler.handleMeetingEnded(payload);
        break;
        
      default:
        result = { success: true, message: 'Event ignored' };
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/manual', async (req, res) => {
  try {
    const { event, payload } = req.body;
    let result;

    if (event === 'meeting.started') {
      result = await WebhookHandler.handleMeetingStarted(payload);
    } else if (event === 'meeting.ended') {
      result = await WebhookHandler.handleMeetingEnded(payload);
    } else {
      result = { success: false, error: 'Invalid event type' };
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router; 