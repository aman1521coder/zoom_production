import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Square, 
  Plus, 
  Activity, 
  Clock, 
  FileText,
  Users,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { botService, healthService, vpsService, recordingService, transcriptService } from '../services/api';

const Dashboard = () => {
  const [activeBots, setActiveBots] = useState([]);
  const [invitationLink, setInvitationLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [systemHealth, setSystemHealth] = useState({ backend: null, vps: null });
  const [recentRecordings, setRecentRecordings] = useState([]);
  const [recentTranscripts, setRecentTranscripts] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    loadActiveBots();
    checkSystemHealth();
    loadRecentData();
    const interval = setInterval(() => {
      loadActiveBots();
      checkSystemHealth();
      loadRecentData();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadActiveBots = async () => {
    try {
      const response = await botService.getActiveBots();
      setActiveBots(response.data.meetings || []);
    } catch (error) {
      console.error('Failed to load active bots:', error);
    }
  };

  const loadRecentData = async () => {
    setLoadingData(true);
    try {
      console.log('Dashboard: Loading recent data...');
      console.log('Dashboard: Auth token exists:', !!localStorage.getItem('authToken'));
      
      const [recordingsResponse, transcriptsResponse] = await Promise.allSettled([
        recordingService.getRecordings(),
        transcriptService.getAllTranscripts()
      ]);

      if (recordingsResponse.status === 'fulfilled') {
        const recordings = recordingsResponse.value.data.recordings?.slice(0, 5) || [];
        setRecentRecordings(recordings);
        console.log('Dashboard: Recordings loaded:', recordings.length);
      } else {
        console.error('Dashboard: Recordings failed:', recordingsResponse.reason);
      }

      if (transcriptsResponse.status === 'fulfilled') {
        const transcripts = transcriptsResponse.value.data.transcripts?.slice(0, 5) || [];
        setRecentTranscripts(transcripts);
        console.log('Dashboard: Transcripts loaded:', transcripts.length);
        console.log('Dashboard: Transcripts data:', transcripts);
      } else {
        console.error('Dashboard: Transcripts failed:', transcriptsResponse.reason);
        console.error('Dashboard: Transcripts error response:', transcriptsResponse.reason?.response?.data);
        console.error('Dashboard: Transcripts error status:', transcriptsResponse.reason?.response?.status);
      }
    } catch (error) {
      console.error('Failed to load recent data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const checkSystemHealth = async () => {
    try {
      const [backendHealth, vpsHealth] = await Promise.allSettled([
        healthService.checkHealth(),
        healthService.checkVpsHealth()
      ]);

      let backendStatus = 'offline';
      if (backendHealth.status === 'fulfilled') {
        try {
          const data = backendHealth.value.data;
          backendStatus = (data && (data.status === 'healthy' || data.status === 'OK')) ? 'healthy' : 'offline';
        } catch (e) {
          backendStatus = 'offline';
        }
      }

      let vpsStatus = 'offline';
      if (vpsHealth.status === 'fulfilled') {
        try {
          const data = vpsHealth.value.data;
          const healthData = data.vps || data;
          vpsStatus = (healthData && healthData.status === 'healthy') ? 'healthy' : 'offline';
        } catch (e) {
          vpsStatus = 'offline';
        }
      } else {
        const errorMsg = vpsHealth.reason?.message || 'Unknown error';
        if (errorMsg.includes('CORS') || errorMsg.includes('Network Error') || errorMsg.includes('ERR_NETWORK')) {
          vpsStatus = 'cors-blocked';
        }
      }

      setSystemHealth({
        backend: backendStatus,
        vps: vpsStatus === 'cors-blocked' ? 'cors-blocked' : vpsStatus
      });

    } catch (error) {
      console.error('Health check failed:', error);
      setSystemHealth({
        backend: 'offline',
        vps: 'offline'
      });
    }
  };

  const handleJoinMeeting = async (e) => {
    e.preventDefault();
    if (!invitationLink.trim()) return;

    setLoading(true);
    try {
      const response = await botService.joinByLink(invitationLink);
      if (response.data.success) {
        setInvitationLink('');
        loadActiveBots();
        // Bot joining initiated - worker will take time to complete
        console.log('Bot join request sent successfully');
      } else {
        console.log('Bot join failed:', response.data.error);
      }
    } catch (error) {
      console.error('Error joining meeting:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStopBot = async (meetingId) => {
    try {
      await botService.stopBot(meetingId);
      loadActiveBots();
      console.log('Bot stop request sent successfully');
    } catch (error) {
      console.error('Error stopping bot:', error.message);
    }
  };

  const getStatusColor = (status, botStatus) => {
    if (botStatus) {
      switch (botStatus) {
        case 'joined': return 'bg-green-100 text-green-800';
        case 'recording': return 'bg-red-100 text-red-800';
        case 'entering_details': return 'bg-yellow-100 text-yellow-800';
        case 'starting': return 'bg-blue-100 text-blue-800';
        case 'failed': return 'bg-red-100 text-red-800';
        case 'transcribed': return 'bg-purple-100 text-purple-800';
        default: return 'bg-gray-100 text-gray-600';
      }
    }
    
    switch (status) {
      case 'recording': return 'bg-red-100 text-red-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'processing': return 'bg-yellow-100 text-yellow-800';
      case 'active': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getDisplayStatus = (meeting) => {
    if (meeting.botStatus && meeting.botStatus !== 'unknown') {
      return meeting.botStatus.replace('_', ' ');
    }
    return meeting.status;
  };

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Sessions</p>
              <p className="text-2xl font-bold text-gray-900">{activeBots.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <FileText className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Recordings</p>
              <p className="text-2xl font-bold text-gray-900">{recentRecordings.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Transcripts</p>
              <p className="text-2xl font-bold text-gray-900">{recentTranscripts.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <CheckCircle className={`h-6 w-6 ${systemHealth.backend === 'healthy' ? 'text-green-600' : 'text-gray-400'}`} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">System Status</p>
              <p className={`text-sm font-semibold ${systemHealth.backend === 'healthy' ? 'text-green-600' : 'text-red-600'}`}>
                {systemHealth.backend === 'healthy' ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Join Meeting */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Start New Session</h3>
        <form onSubmit={handleJoinMeeting} className="space-y-4">
          <div>
            <label htmlFor="invitation" className="block text-sm font-medium text-gray-700 mb-2">
              Meeting Invitation Link
            </label>
            <input
              type="url"
              id="invitation"
              value={invitationLink}
              onChange={(e) => setInvitationLink(e.target.value)}
              placeholder="https://zoom.us/j/123456789?pwd=..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !invitationLink.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span>{loading ? 'Starting...' : 'Start Recording'}</span>
          </button>
        </form>
      </div>

      {/* Active Meetings */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Active Sessions</h3>
          <button
            onClick={loadActiveBots}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>

        {activeBots.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">No Active Sessions</h4>
            <p className="text-gray-600">Start a new meeting session to begin recording</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeBots.map((bot) => (
              <div key={bot.meetingId} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Activity className="h-5 w-5 text-blue-600" />
                        <span className="font-medium text-gray-900">Session {bot.meetingId}</span>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(bot.status, bot.botStatus)}`}>
                        {getDisplayStatus(bot)}
                      </span>
                      {bot.recording && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Recording
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span>Started {new Date(bot.startTime).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleStopBot(bot.meetingId)}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm flex items-center space-x-1"
                  >
                    <Square className="h-3 w-3" />
                    <span>Stop</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Recordings */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Recent Recordings</h3>
            {loadingData && <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {recentRecordings.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-8 w-8 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">No recordings yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentRecordings.slice(0, 3).map((recording) => (
                <div key={recording._id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-gray-900">Session {recording.meetingId}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(recording.startTime).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      recording.status === 'completed' ? 'bg-green-100 text-green-800' :
                      recording.status === 'recording' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {recording.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transcripts */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Recent Transcripts</h3>
          </div>

          {recentTranscripts.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-8 w-8 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">No transcripts yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTranscripts.slice(0, 3).map((transcript) => (
                <div key={transcript._id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium text-gray-900">Session {transcript.meetingId}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(transcript.createdAt).toLocaleDateString()} • {transcript.wordCount || 0} words
                      </p>
                    </div>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Ready
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 