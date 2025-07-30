import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import Meeting from '../models/Meeting.js';
import Transcript from '../models/Transcript.js';

class RecordingManager {
  constructor() {
    this.vpsUrl = process.env.VPS_URL || 'http://147.93.119.85:3000';
    this.apiSecret = process.env.VPS_SECRET || '1234';
    this.backendUrl = process.env.BACKEND_URL || 'https://aizoomai.com';
    this.recordingsPath = path.join(process.cwd(), 'recordings');
    
    this.ensureRecordingsDirectory();
  }

  ensureRecordingsDirectory() {
    if (!fs.existsSync(this.recordingsPath)) {
      fs.mkdirSync(this.recordingsPath, { recursive: true });
    }
  }

  async startRecording(meetingId, userId, method = 'vps_bot') {
    try {
      const meeting = await Meeting.findOneAndUpdate(
        { meetingId },
        {
          userId,
          meetingId,
          status: 'recording',
          recordingMethod: method,
          recordingStartTime: new Date()
        },
        { upsert: true, new: true }
      );

      if (method === 'vps_bot') {
        return await this.startVpsRecording(meetingId, userId);
      }

      return { success: true, method, meeting };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async startVpsRecording(meetingId, userId) {
    try {
      const config = {
        meetingId,
        userId,
        enableRecording: true,
        recordingConfig: {
          audioOnly: true,
          format: 'webm',
          uploadEndpoint: `${this.backendUrl}/api/recordings/upload/${meetingId}`
        }
      };

      const response = await fetch(`${this.vpsUrl}/start-recording`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': this.apiSecret
        },
        body: JSON.stringify(config)
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        await Meeting.updateOne(
          { meetingId },
          { status: 'recording', metadata: { vpsResponse: result } }
        );
        return { success: true, vpsResult: result };
      }

      throw new Error(result.error || 'VPS recording failed');
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async stopRecording(meetingId) {
    try {
      const meeting = await Meeting.findOne({ meetingId });
      if (!meeting) {
        return { success: false, error: 'Meeting not found' };
      }

      if (meeting.recordingMethod === 'vps_bot') {
        const stopResult = await this.stopVpsRecording(meetingId);
        if (stopResult.success && stopResult.recordingPath) {
          await Meeting.updateOne(
            { meetingId },
            { 
              status: 'processing',
              recordingEndTime: new Date(),
              recordingPath: stopResult.recordingPath
            }
          );
          return { success: true, recordingPath: stopResult.recordingPath };
        }
      }

      await Meeting.updateOne(
        { meetingId },
        { status: 'completed', endTime: new Date() }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async stopVpsRecording(meetingId) {
    try {
      const response = await fetch(`${this.vpsUrl}/stop-recording/${meetingId}`, {
        method: 'POST',
        headers: { 'x-api-secret': this.apiSecret }
      });

      if (response.ok) {
        const result = await response.json();
        return { success: true, recordingPath: result.recordingPath };
      }

      return await this.findRecordingFile(meetingId);
    } catch (error) {
      return await this.findRecordingFile(meetingId);
    }
  }

  async findRecordingFile(meetingId) {
    try {
      const files = fs.readdirSync(this.recordingsPath);
      const recordingFile = files.find(file => 
        file.includes(meetingId) && 
        (file.endsWith('.webm') || file.endsWith('.wav'))
      );

      if (recordingFile) {
        const recordingPath = path.join(this.recordingsPath, recordingFile);
        return { success: true, recordingPath };
      }

      return { success: false, error: 'Recording file not found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleUpload(meetingId, file) {
    try {
      const meeting = await Meeting.findOne({ meetingId });
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      const recordingPath = path.join(this.recordingsPath, file.filename);
      
      await Meeting.updateOne(
        { meetingId },
        {
          status: 'processing',
          recordingPath,
          recordingEndTime: new Date()
        }
      );

      return { success: true, recordingPath, meeting };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new RecordingManager(); 