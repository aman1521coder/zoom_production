import express from 'express';
import WebhookHandler from '../services/WebhookHandler.js';

const router = express.Router();

// Handle Zoom webhook validation (GET request)
router.get('/zoom', (req, res) => {
  console.log('Zoom webhook validation request:', req.query);
  
  if (req.query.challenge) {
    console.log('Responding to Zoom webhook validation');
    return res.status(200).send(req.query.challenge);
  }
  
  res.status(200).json({ message: 'Webhook endpoint active' });
});

router.post('/zoom', async (req, res) => {
  try {
    console.log(' WEBHOOK RECEIVED:', {
      headers: req.headers,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    if (!req.body || typeof req.body !== 'object') {
      console.error('Invalid webhook body:', req.body);
      return res.status(400).json({ success: false, error: 'Invalid request body' });
    }

    const { event, payload } = req.body;
    
    if (!event) {
      console.error('Missing event field in webhook:', req.body);
      return res.status(400).json({ success: false, error: 'Missing event field' });
    }

    console.log(`Processing webhook event: "${event}"`);
    let result;

    switch (event) {
      case 'meeting.started':
        console.log('Processing meeting.started webhook');
        if (!payload) {
          console.error('Missing payload for meeting.started');
          result = { success: false, error: 'Missing payload for meeting.started' };
        } else {
        result = await WebhookHandler.handleMeetingStarted(payload);
        }
        console.log('Meeting.started result:', result);
        break;
        
      case 'meeting.ended':
        console.log('Processing meeting.ended webhook');
        if (!payload) {
          console.error('Missing payload for meeting.ended');
          result = { success: false, error: 'Missing payload for meeting.ended' };
        } else {
        result = await WebhookHandler.handleMeetingEnded(payload);
        }
        console.log('Meeting.ended result:', result);
        break;
        
      default:
        console.log('Unknown webhook event:', event);
        result = { success: true, message: 'Event ignored' };
    }

    res.json(result);
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint for manual webhook testing
router.post('/test-meeting-start', async (req, res) => {
  try {
    console.log('🧪 MANUAL TEST: Simulating meeting.started webhook');
    
    const { meetingId, hostId, password, topic } = req.body;
    
    if (!meetingId || !hostId) {
      return res.status(400).json({ 
        error: 'meetingId and hostId are required for testing' 
      });
    }

    const testPayload = {
      object: {
        id: meetingId,
        host_id: hostId,
        password: password || '',
        topic: topic || 'Test Meeting'
      }
    };

    console.log('🧪 Test payload:', testPayload);
    const result = await WebhookHandler.handleMeetingStarted(testPayload);
    console.log('🧪 Test result:', result);

    res.json({
      success: true,
      message: 'Manual test completed',
      result
    });
  } catch (error) {
    console.error('🧪 Manual test error:', error);
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

// Direct endpoint to stop worker bot for specific meeting
router.post('/stop-bot/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await WebhookHandler.stopWorkerBot(meetingId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint to clear stuck active requests
router.post('/clear-active-requests', async (req, res) => {
  try {
    console.log('🧹 Clearing all active requests');
    WebhookHandler.activeRequests.clear();
    res.json({ 
      success: true, 
      message: 'Active requests cleared' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router; 