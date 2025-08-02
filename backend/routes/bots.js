import express from 'express';
import fetch from 'node-fetch';
import WebhookHandler from '../services/WebhookHandler.js';
import Meeting from '../models/Meeting.js';

const router = express.Router();

const VPS_URL = process.env.VPS_URL || 'http://147.93.119.85:3000';
const VPS_SECRET = process.env.VPS_SECRET || '1234';

router.post('/join-by-link', async (req, res) => {
  try {
    console.log('Join-by-link request received:');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { invitationLink } = req.body;
    
    if (!invitationLink) {
      console.log('No invitation link provided');
      return res.status(400).json({ error: 'Invitation link required' });
    }

    console.log('Processing invitation link:', invitationLink);
    console.log('User:', req.user.email);

    const result = await WebhookHandler.handleBotJoinByLink(
      invitationLink, 
      req.user._id
    );

    console.log('WebhookHandler result:', JSON.stringify(result, null, 2));
    res.json(result);
  } catch (error) {
    console.log('Join-by-link error:', error.message);
    console.log('Error stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

router.get('/active', async (req, res) => {
  try {
    // Get active meetings from database
    const meetings = await Meeting.find({
      userId: req.user._id,
      status: { $in: ['recording', 'active'] }
    }).select('meetingId status recordingMethod startTime');

    // Get real-time status from VPS worker
    let vpsActiveBots = [];
    try {
      const vpsResponse = await fetch(`${VPS_URL}/bots`, {
        headers: { 'x-api-secret': VPS_SECRET },
        timeout: 5000
      });
      
      if (vpsResponse.ok) {
        const vpsData = await vpsResponse.json();
        vpsActiveBots = vpsData.bots || [];
      }
    } catch (vpsError) {
      console.log('VPS connection failed:', vpsError.message);
    }

    // Merge database and VPS data
    const enrichedMeetings = meetings.map(meeting => {
      const vpsBot = vpsActiveBots.find(bot => bot.meetingId === meeting.meetingId);
      return {
        ...meeting.toObject(),
        botStatus: vpsBot?.status || 'unknown',
        recording: vpsBot?.recording || false,
        lastUpdate: vpsBot?.lastUpdate || meeting.updatedAt
      };
    });

    res.json({
      success: true,
      activeBots: enrichedMeetings.length,
      meetings: enrichedMeetings,
      vpsConnected: vpsActiveBots.length >= 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/stop/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;

    // Verify user owns this meeting
    const meeting = await Meeting.findOne({
      meetingId,
      userId: req.user._id
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Stop bot on VPS worker
    try {
      const response = await fetch(`${VPS_URL}/stop-bot/${meetingId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': VPS_SECRET
        },
        timeout: 10000
      });

      const result = await response.json();
      
      if (response.ok) {
        // Update meeting status in database
        await Meeting.updateOne(
          { meetingId },
          { 
            status: 'completed',
            endTime: new Date()
          }
        );

        res.json({
          success: true,
          message: 'Bot stopped successfully',
          meetingId,
          vpsResult: result
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to stop bot on VPS'
        });
      }
    } catch (vpsError) {
      // VPS is down, but still update database
      await Meeting.updateOne(
        { meetingId },
        { 
          status: 'completed',
          endTime: new Date()
        }
      );

      res.json({
        success: true,
        message: 'Meeting marked as completed (VPS unreachable)',
        meetingId,
        warning: 'Could not contact VPS worker'
      });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;

    // Check if user owns this meeting
    const meeting = await Meeting.findOne({
      meetingId,
      userId: req.user._id
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Get detailed status from VPS worker
    try {
      const response = await fetch(`${VPS_URL}/status/${meetingId}`, {
        timeout: 5000
      });

      if (response.ok) {
        const vpsStatus = await response.json();
        res.json({
          success: true,
          meeting: meeting.toObject(),
          vpsStatus
        });
      } else {
        res.json({
          success: true,
          meeting: meeting.toObject(),
          vpsStatus: { error: 'VPS status unavailable' }
        });
      }
    } catch (vpsError) {
      res.json({
        success: true,
        meeting: meeting.toObject(),
        vpsStatus: { error: 'VPS unreachable' }
      });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/vps-health', async (req, res) => {
  try {
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

export default router; 