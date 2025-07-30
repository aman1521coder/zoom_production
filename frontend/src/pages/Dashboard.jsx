import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Square, 
  Plus, 
  Activity, 
  Clock, 
  FileText,
  Users,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { botService, healthService } from '../services/api';

const Dashboard = () => {
  const [activeBots, setActiveBots] = useState([]);
  const [invitationLink, setInvitationLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [systemHealth, setSystemHealth] = useState({ backend: null, vps: null });

  useEffect(() => {
    loadActiveBots();
    checkSystemHealth();
    const interval = setInterval(() => {
      loadActiveBots();
      checkSystemHealth();
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

  const checkSystemHealth = async () => {
    try {
      const backendHealth = await Promise.allSettled([
        healthService.checkHealth()
      ]);

      setSystemHealth({
        backend: backendHealth[0].status === 'fulfilled' ? 'healthy' : 'offline',
        vps: 'healthy'
      });
    } catch (error) {
      console.error('Health check failed:', error);
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
        alert('Bot joined meeting successfully!');
      } else {
        alert('Failed to join meeting: ' + response.data.error);
      }
    } catch (error) {
      alert('Error joining meeting: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStopBot = async (meetingId) => {
    try {
      await botService.stopBot(meetingId);
      loadActiveBots();
      alert('Bot stopped successfully!');
    } catch (error) {
      alert('Error stopping bot: ' + error.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'recording': return 'status-recording';
      case 'completed': return 'status-completed';
      case 'processing': return 'status-processing';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100">
              <Activity className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Bots</p>
              <p className="text-2xl font-bold text-gray-900">{activeBots.length}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success-100">
              <CheckCircle className={`h-6 w-6 ${systemHealth.backend === 'healthy' ? 'text-success-600' : 'text-gray-400'}`} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Backend Status</p>
              <p className={`text-sm font-semibold ${systemHealth.backend === 'healthy' ? 'text-success-600' : 'text-danger-600'}`}>
                {systemHealth.backend === 'healthy' ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning-100">
              <Users className={`h-6 w-6 ${systemHealth.vps === 'healthy' ? 'text-success-600' : 'text-gray-400'}`} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">VPS Worker</p>
              <p className={`text-sm font-semibold ${systemHealth.vps === 'healthy' ? 'text-success-600' : 'text-danger-600'}`}>
                {systemHealth.vps === 'healthy' ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Join Meeting</h3>
        <form onSubmit={handleJoinMeeting} className="space-y-4">
          <div>
            <label htmlFor="invitation" className="block text-sm font-medium text-gray-700 mb-2">
              Zoom Invitation Link
            </label>
            <input
              type="url"
              id="invitation"
              value={invitationLink}
              onChange={(e) => setInvitationLink(e.target.value)}
              placeholder="https://zoom.us/j/123456789?pwd=..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !invitationLink.trim()}
            className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span>{loading ? 'Joining...' : 'Join Meeting'}</span>
          </button>
        </form>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Active Meetings</h3>
          <button
            onClick={loadActiveBots}
            className="btn-secondary flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>

        {activeBots.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">No Active Meetings</h4>
            <p className="text-gray-600">Join a meeting to start recording and transcription</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeBots.map((bot) => (
              <div key={bot.meetingId} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Activity className="h-5 w-5 text-primary-600" />
                        <span className="font-medium text-gray-900">Meeting {bot.meetingId}</span>
                      </div>
                      <span className={`status-badge ${getStatusColor(bot.status)}`}>
                        {bot.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span>Started {new Date(bot.startTime).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <FileText className="h-4 w-4" />
                        <span>Method: {bot.recordingMethod}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleStopBot(bot.meetingId)}
                      className="bg-danger-600 hover:bg-danger-700 text-white px-3 py-1 rounded text-sm flex items-center space-x-1"
                    >
                      <Square className="h-3 w-3" />
                      <span>Stop</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard; 