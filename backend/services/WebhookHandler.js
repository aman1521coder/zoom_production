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
    const { id: meetingId, topic, host_id: hostId } = payload.object;
    
    console.log(`🔍 WEBHOOK PAYLOAD DEBUG:`, JSON.stringify(payload, null, 2));
    console.log(` WEBHOOK: Meeting started - ${meetingId} by host ${hostId}`);
    
    const user = await User.findOne({ zoomId: hostId });
    if (!user) {
      const errorMsg = `USER NOT FOUND: No user registered for Zoom host ID ${hostId}. User needs to connect their Zoom account first.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (this.activeRequests.has(meetingId)) {
      const errorMsg = `ALREADY PROCESSING: Meeting ${meetingId} is already being processed.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    this.activeRequests.set(meetingId, Date.now());

    try {
      console.log(`Starting automatic bot join for registered user: ${user.email}`);
      
      // Save/update meeting record in database
      let meetingRecord = await Meeting.findOneAndUpdate(
        { meetingId, userId: user._id },
        { 
          meetingId, 
          userId: user._id, 
          topic: topic || 'Zoom Meeting',
          status: 'active',
          startTime: new Date(),
          metadata: {
            webhookTriggered: true,
            lastWebhookTime: new Date()
          }
        },
        { upsert: true, new: true }
      );
      
      console.log(`Meeting record updated: ${meetingId} for user ${user.email}`);
      
      // Try to get password from database first
      let password = '';
      let meetingTopic = meetingRecord.topic || topic || '';
      
      if (meetingRecord.password) {
        password = meetingRecord.password;
        console.log(`Found stored password for meeting ${meetingId}`);
      } else {
        console.log(`No password in database for meeting ${meetingId}, fetching from Zoom API`);
        
        try {
          const zoomMeetingData = await this.fetchMeetingFromZoomAPI(meetingId, user);
          
          if (zoomMeetingData && zoomMeetingData.password) {
            password = zoomMeetingData.password;
            meetingTopic = zoomMeetingData.topic || topic || '';
            console.log(`Zoom API success: Retrieved password for meeting ${meetingId}`);
            
            // Update database with retrieved password
            await Meeting.findOneAndUpdate(
              { meetingId, userId: user._id },
              { 
                password: password,
                topic: meetingTopic,
                metadata: {
                  ...meetingRecord.metadata,
                  passwordFromAPI: true,
                  lastAPIFetch: new Date()
                }
              }
            );
            console.log(`Saved API password to database for future use`);
          } else if (zoomMeetingData === null) {
            const errorMsg = `Zoom API failed: Could not fetch meeting ${meetingId} details. Check authentication and permissions.`;
            console.error(errorMsg);
            throw new Error(errorMsg);
          } else {
            const errorMsg = `Meeting ${meetingId} exists but has no password set.`;
            console.error(errorMsg);
            throw new Error(errorMsg);
          }
        } catch (apiError) {
          console.error(`Zoom API fetch error: ${apiError.message}`);
          throw apiError;
        }
      }
      
      console.log(`Final password result for meeting ${meetingId}: ${password ? 'found' : 'not found'}`);
    
    if (!password) {
      console.log(`No password found for meeting ${meetingId} - bot will attempt to join without password`);
    } else {
      console.log(`Proceeding with password for meeting ${meetingId}`);
    }
    
    const botResult = await this.autoJoinMeeting(meetingId, hostId, password, meetingTopic, user._id);
      
      console.log(`Automatic join result:`, botResult);
      
      return botResult;
    } catch (error) {
      console.error('Meeting start handling error:', error.message);
      return { success: false, error: error.message, meetingId };
    } finally {
      this.activeRequests.delete(meetingId);
    }
  }

  async handleMeetingEnded(payload) {
    console.log('Meeting ended payload:', JSON.stringify(payload, null, 2));
    
    if (!payload || !payload.object) {
      console.error('Invalid payload structure for meeting.ended:', payload);
      return { success: false, error: 'Invalid payload structure' };
    }
    
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
      console.log(`Attempting to connect to VPS: ${this.vpsUrl}`);
      
      const response = await fetch(`${this.vpsUrl}/webhook/meeting-ended`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': this.apiSecret
        },
        body: JSON.stringify({
          meetingId,
          reason
        }),
        timeout: 5000  // 5 second timeout
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Worker bot stopped successfully:', result);
        return { success: true, result };
      } else {
        const errorText = await response.text();
        console.warn(`Worker bot stop failed (${response.status}):`, errorText.substring(0, 200));
        
        if (response.status === 502) {
          console.warn('VPS worker server appears to be down (502 Bad Gateway)');
          return { success: false, error: 'VPS worker server unavailable', workerDown: true };
        }
        
        return { success: false, error: `Worker stop error: ${response.status}` };
      }
    } catch (error) {
      console.warn(`Worker bot stop failed - VPS connection error:`, error.message);
      return { success: false, error: 'VPS connection failed', workerDown: true };
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

      console.log('Manual launch config:', JSON.stringify(config, null, 2));

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

  async autoJoinMeeting(meetingId, hostId, password = '', topic = '', userId = null) {
    try {
      const config = {
        meetingId,
        hostId,
        userId: userId,
        password: password || '',
        topic: topic || 'Zoom Meeting',
        enableRecording: true,
        recordingSettings: {
          audioOnly: true,
          autoUpload: true,
          uploadUrl: `${process.env.BACKEND_URL || 'https://aizoomai.com'}/api/recordings/upload/${meetingId}`
        }
      };

      console.log('Auto-joining meeting with config:', JSON.stringify(config, null, 2));

      const response = await fetch(`${this.vpsUrl}/auto-join-meeting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': this.apiSecret
        },
        body: JSON.stringify(config)
      });

      console.log('VPS Auto-Join Response Status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('VPS Auto-Join Success:', JSON.stringify(result, null, 2));
        return { success: true, result };
      }

      const error = await response.text();
      console.log('VPS Auto-Join Error:', error);
      return { success: false, error: `Failed to auto-join meeting: ${response.status} - ${error}` };
    } catch (error) {
      console.error('Failed to auto-join meeting:', error.message);
      return { success: false, error: error.message };
    }
  }



  async handleBotJoinByLink(invitationLink, userId) {
    try {
      console.log('Manual join - Original link:', invitationLink);
      console.log('Manual join - UserId:', userId);
      
      const linkMatch = invitationLink.match(/\/j\/(\d+)(?:\?pwd=([^&]+))?/);
      
      if (!linkMatch) {
        console.log('Invalid invitation link format');
        throw new Error('Invalid invitation link');
      }

      const meetingId = linkMatch[1];
      const password = linkMatch[2] || '';
      
      console.log('Extracted meeting ID:', meetingId);
      console.log('Extracted password:', password ? 'YES' : 'NO');

      if (password) {
        try {
          await Meeting.findOneAndUpdate(
            { meetingId, userId },
            { 
              meetingId, 
              userId, 
              password,
              status: 'active',
              startTime: new Date()
            },
            { upsert: true }
          );
          console.log(`Stored password for meeting ${meetingId} in database`);
        } catch (dbError) {
          console.log(`Failed to store password in database: ${dbError.message}`);
        }
      }

      return await this.launchBot(meetingId, password, userId);
    } catch (error) {
      console.log('handleBotJoinByLink failed:', error.message);
      return { success: false, error: error.message };
    }
  }

    async fetchMeetingFromZoomAPI(meetingId, user) {
    try {
      console.log(`Fetching meeting details from Zoom API for meeting ${meetingId}`);
      
      if (!user.accessToken) {
        const errorMsg = `No access token for user ${user.email} - cannot fetch meeting details. User needs to re-authenticate with Zoom.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      let currentToken = user.accessToken;
      const meetingData = await this.makeZoomAPICall(meetingId, currentToken, user);
      
      if (meetingData) {
        console.log(`Zoom API success: Found meeting ${meetingId}`);
        
        if (meetingData.password) {
          console.log(`Meeting password found for ${meetingId}`);
        } else {
          console.log(`Meeting ${meetingId} has no password set`);
        }
        
        return {
          meetingId: meetingData.id,
          topic: meetingData.topic,
          password: meetingData.password || '',
          joinUrl: meetingData.join_url,
          type: meetingData.type,
          status: meetingData.status
        };
      } else {
        const errorMsg = `Zoom API failed: Could not retrieve meeting ${meetingId} details`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error(`Zoom API fetch error:`, error.message);
      throw error;
    }
  }

  async makeZoomAPICall(meetingId, accessToken, user) {
    try {
      console.log(`Zoom API call: GET https://api.zoom.us/v2/meetings/${meetingId}`);

      const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`Zoom API response: Status ${response.status}`);
      
      const responseText = await response.text();
      
      if (response.ok) {
        const meetingData = JSON.parse(responseText);
        return meetingData;
      } else if (response.status === 401) {
        console.log(`Token expired: Attempting to refresh token for user ${user.email}`);
        
        const newTokens = await this.refreshZoomToken(user);
        if (newTokens) {
          console.log(`Token refreshed: Retrying API call with new token`);
          
          const retryResponse = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
            headers: {
              'Authorization': `Bearer ${newTokens.access_token}`,
              'Content-Type': 'application/json'
            }
          });

          if (retryResponse.ok) {
            const retryData = await retryResponse.text();
            console.log(`Retry success: Meeting data retrieved with refreshed token`);
            return JSON.parse(retryData);
          } else {
            const retryError = await retryResponse.text();
            console.error(`Retry failed (${retryResponse.status}):`, retryError);
            throw new Error(`Token refresh succeeded but API call still failed: ${retryError}`);
          }
        } else {
          throw new Error(`Token refresh failed: User ${user.email} needs to re-authenticate`);
        }
      } else {
        let errorMsg = `Zoom API error (${response.status}): ${responseText}`;
        
        if (response.status === 404) {
          errorMsg = `Meeting not found: Meeting ${meetingId} doesn't exist or user has no access`;
        } else if (response.status === 403) {
          errorMsg = `Permission denied: User doesn't have permission to access meeting ${meetingId}`;
        }
        
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error(`Zoom API call error:`, error.message);
      throw error;
    }
  }

  async refreshZoomToken(user) {
    try {
      if (!user.refreshToken) {
        console.error(`No refresh token for user ${user.email}`);
        return null;
      }

      console.log(`Refreshing token for user ${user.email}`);

      const CLIENT_ID = process.env.ZOOM_BOT_CLIENT_ID;
      const CLIENT_SECRET = process.env.ZOOM_BOT_CLIENT_SECRET;

      const response = await fetch('https://zoom.us/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: user.refreshToken
        })
      });

      if (response.ok) {
        const tokenData = await response.json();
        console.log(`Token refresh success for user ${user.email}`);

        await User.findByIdAndUpdate(user._id, {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenExpiry: new Date(Date.now() + (tokenData.expires_in * 1000))
        });

        console.log(`Saved new tokens for user ${user.email}`);
        return tokenData;
      } else {
        const error = await response.text();
        console.error(`Token refresh failed (${response.status}):`, error);
        return null;
      }
    } catch (error) {
      console.error(`Token refresh error:`, error.message);
      return null;
    }
  }
}

export default new WebhookHandler(); 