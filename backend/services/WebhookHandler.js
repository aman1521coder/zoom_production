import fetch from 'node-fetch';
import User from '../models/User.js';
import Meeting from '../models/Meeting.js';
import RecordingManager from './RecordingManager.js';
import TranscriptProcessor from './TranscriptProcessor.js';

class WebhookHandler {
  constructor() {
    this.vpsUrl = process.env.VPS_URL || 'http://147.93.119.85:3000';
    this.apiSecret = process.env.VPS_SECRET || '1234';
    this.activeRequests = new Map();
  }

  async handleMeetingStarted(payload) {
    const { id: meetingId, topic, host_id: hostId, password } = payload.object;
    
    const user = await User.findOne({ zoomId: hostId });
    if (!user) {
      return { success: false, error: 'User not registered' };
    }

    if (this.activeRequests.has(meetingId)) {
      return { success: false, error: 'Already processing' };
    }

    this.activeRequests.set(meetingId, Date.now());

    try {
      const botResult = await this.launchBot(meetingId, password, user._id);
      if (botResult.success) {
        const recordingResult = await RecordingManager.startRecording(
          meetingId, 
          user._id, 
          'vps_bot'
        );
        
        if (recordingResult.success) {
          return { 
            success: true, 
            message: 'Bot launched and recording started',
            meetingId,
            recordingMethod: 'vps_bot'
          };
        }
      }
      
      return { success: false, error: 'Failed to start recording' };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      this.activeRequests.delete(meetingId);
    }
  }

  async handleMeetingEnded(payload) {
    const { id: meetingId, host_id: hostId } = payload.object;
    
    try {
      const stopResult = await RecordingManager.stopRecording(meetingId);
      
      if (stopResult.success && stopResult.recordingPath) {
        const user = await User.findOne({ zoomId: hostId });
        if (user) {
          await TranscriptProcessor.processRecording(
            meetingId,
            stopResult.recordingPath,
            user._id
          );
        }
      }

      return { success: true, message: 'Meeting ended and processing started' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async launchBot(meetingId, password, userId) {
    try {
      const config = {
        meetingId,
        password: password || '',
        userId,
        enableRecording: true,
        recordingSettings: {
          audioOnly: true,
          autoUpload: true,
          uploadUrl: `${process.env.BACKEND_URL || 'https://aizoomai.com'}/api/recordings/upload/${meetingId}`
        }
      };

      const response = await fetch(`${this.vpsUrl}/launch-bot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': this.apiSecret
        },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        const result = await response.json();
        return { success: true, result };
      }

      const error = await response.text();
      throw new Error(`VPS error: ${error}`);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleBotJoinByLink(invitationLink, userId) {
    try {
      const linkMatch = invitationLink.match(/\/j\/(\d+)(?:\?pwd=([^&]+))?/);
      if (!linkMatch) {
        throw new Error('Invalid invitation link');
      }

      const meetingId = linkMatch[1];
      const password = linkMatch[2] || '';

      return await this.launchBot(meetingId, password, userId);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new WebhookHandler(); 