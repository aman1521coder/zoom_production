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
    console.log(`VPS URL configured: ${this.vpsUrl}`);
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
      // First, notify the worker to stop bot recording
      const workerStopResult = await this.stopWorkerBot(meetingId, 'zoom_webhook');
      console.log('Worker bot stop result:', workerStopResult);

      // Then handle backend recording stop
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

      return { 
        success: true, 
        message: 'Meeting ended and processing started',
        workerStopped: workerStopResult.success,
        backendStopped: stopResult.success
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async stopWorkerBot(meetingId, reason = 'manual') {
    try {
      console.log(`Stopping worker bot for meeting ${meetingId} (${reason})`);
      
      const response = await fetch(`${this.vpsUrl}/webhook/meeting-ended`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': this.apiSecret
        },
        body: JSON.stringify({
          meetingId,
          reason
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Worker bot stopped successfully:', result);
        return { success: true, result };
      } else {
        const errorText = await response.text();
        console.error('Worker bot stop failed:', errorText);
        return { success: false, error: `Worker stop error: ${response.status} - ${errorText}` };
      }
    } catch (error) {
      console.error('Worker bot stop failed:', error.message);
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

      console.log('Launching bot with config:', JSON.stringify(config, null, 2));
      console.log('VPS URL:', this.vpsUrl);
      console.log('API Secret:', this.apiSecret ? 'SET' : 'NOT SET');

      const response = await fetch(`${this.vpsUrl}/launch-bot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': this.apiSecret
        },
        body: JSON.stringify(config)
      });

      console.log('VPS Response Status:', response.status);
      console.log('VPS Response Headers:', Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const result = await response.json();
        console.log('VPS Response Success:', JSON.stringify(result, null, 2));
        return { success: true, result };
      }

      const error = await response.text();
      console.log('VPS Response Error:', error);
      throw new Error(`VPS error: ${error}`);
    } catch (error) {
      console.log('Launch bot failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async handleBotJoinByLink(invitationLink, userId) {
    try {
      console.log('Parsing invitation link:', invitationLink);
      
      const linkMatch = invitationLink.match(/\/j\/(\d+)(?:\?pwd=([^&]+))?/);
      console.log('🧩 Regex match result:', linkMatch);
      
      if (!linkMatch) {
        console.log('Invalid invitation link format');
        throw new Error('Invalid invitation link');
      }

      const meetingId = linkMatch[1];
      const password = linkMatch[2] || '';
      
      console.log(' Extracted meeting ID:', meetingId);
      console.log(' Extracted password:', password ? 'YES' : 'NO');

      return await this.launchBot(meetingId, password, userId);
    } catch (error) {
      console.log('handleBotJoinByLink failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export default new WebhookHandler(); 