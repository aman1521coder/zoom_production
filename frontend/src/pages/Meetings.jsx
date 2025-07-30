import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  FileText, 
  Users, 
  Download,
  RefreshCw,
  Search
} from 'lucide-react';

const Meetings = () => {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadMeetings();
  }, []);

  const loadMeetings = async () => {
    setLoading(true);
    try {
      // Mock data for now - replace with actual API call
      const mockMeetings = [
        {
          meetingId: '123456789',
          topic: 'Team Standup',
          status: 'completed',
          recordingMethod: 'vps_bot',
          startTime: new Date(Date.now() - 86400000),
          endTime: new Date(Date.now() - 85500000),
          duration: 15,
          participantCount: 5,
          hasTranscript: true
        },
        {
          meetingId: '987654321',
          topic: 'Product Review',
          status: 'processing',
          recordingMethod: 'vps_bot',
          startTime: new Date(Date.now() - 3600000),
          endTime: new Date(Date.now() - 1800000),
          duration: 30,
          participantCount: 8,
          hasTranscript: false
        }
      ];
      setMeetings(mockMeetings);
    } catch (error) {
      console.error('Failed to load meetings:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMeetings = meetings.filter(meeting =>
    meeting.topic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    meeting.meetingId.includes(searchTerm)
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'recording': return 'status-recording';
      case 'completed': return 'status-completed';
      case 'processing': return 'status-processing';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meeting History</h1>
          <p className="text-gray-600">View and manage your recorded meetings</p>
        </div>
        <button
          onClick={loadMeetings}
          disabled={loading}
          className="btn-primary flex items-center space-x-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="card">
        <div className="flex items-center space-x-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 text-gray-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">Loading meetings...</p>
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">No Meetings Found</h4>
            <p className="text-gray-600">
              {searchTerm ? 'No meetings match your search' : 'No meetings recorded yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMeetings.map((meeting) => (
              <div key={meeting.meetingId} className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {meeting.topic || `Meeting ${meeting.meetingId}`}
                      </h3>
                      <span className={`status-badge ${getStatusColor(meeting.status)}`}>
                        {meeting.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4" />
                        <span>{meeting.startTime.toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4" />
                        <span>{formatDuration(meeting.duration)}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4" />
                        <span>{meeting.participantCount} participants</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4" />
                        <span>{meeting.hasTranscript ? 'Transcript available' : 'No transcript'}</span>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-gray-500">
                      Meeting ID: {meeting.meetingId} • 
                      Started: {meeting.startTime.toLocaleTimeString()} • 
                      Method: {meeting.recordingMethod}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    {meeting.hasTranscript && (
                      <button className="btn-secondary text-sm flex items-center space-x-1">
                        <FileText className="h-3 w-3" />
                        <span>View Transcript</span>
                      </button>
                    )}
                    {meeting.status === 'completed' && (
                      <button className="btn-secondary text-sm flex items-center space-x-1">
                        <Download className="h-3 w-3" />
                        <span>Download</span>
                      </button>
                    )}
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

export default Meetings;