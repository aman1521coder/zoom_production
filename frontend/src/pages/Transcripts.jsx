import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Search, 
  Download, 
  Eye,
  RefreshCw,
  Calendar,
  Clock
} from 'lucide-react';

const Transcripts = () => {
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTranscript, setSelectedTranscript] = useState(null);

  useEffect(() => {
    loadTranscripts();
  }, []);

  const loadTranscripts = async () => {
    setLoading(true);
    try {
      // Mock data for now - replace with actual API call
      const mockTranscripts = [
        {
          id: '1',
          meetingId: '123456789',
          topic: 'Team Standup',
          fullText: 'Good morning everyone. Let\'s start with our daily standup. John, can you share what you worked on yesterday?',
          wordCount: 324,
          createdAt: new Date(Date.now() - 86400000),
          duration: 15,
          summary: 'Team discussed daily progress and upcoming sprint goals.',
          keyTopics: ['sprint planning', 'bug fixes', 'feature development']
        },
        {
          id: '2',
          meetingId: '987654321',
          topic: 'Product Review',
          fullText: 'Welcome to our quarterly product review. Today we\'ll be discussing the new features we\'ve launched...',
          wordCount: 1250,
          createdAt: new Date(Date.now() - 3600000),
          duration: 45,
          summary: 'Quarterly review of product features and roadmap discussion.',
          keyTopics: ['product roadmap', 'user feedback', 'metrics']
        }
      ];
      setTranscripts(mockTranscripts);
    } catch (error) {
      console.error('Failed to load transcripts:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTranscripts = transcripts.filter(transcript =>
    transcript.fullText?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transcript.topic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transcript.keyTopics?.some(topic => topic.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const truncateText = (text, maxLength = 150) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transcripts</h1>
          <p className="text-gray-600">Search and view your meeting transcripts</p>
        </div>
        <button
          onClick={loadTranscripts}
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
              placeholder="Search transcripts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 text-gray-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">Loading transcripts...</p>
          </div>
        ) : filteredTranscripts.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">No Transcripts Found</h4>
            <p className="text-gray-600">
              {searchTerm ? 'No transcripts match your search' : 'No transcripts available yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTranscripts.map((transcript) => (
              <div key={transcript.id} className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {transcript.topic || `Meeting ${transcript.meetingId}`}
                      </h3>
                      <span className="px-2 py-1 bg-primary-100 text-primary-700 text-xs rounded-full font-medium">
                        {transcript.wordCount} words
                      </span>
                    </div>

                    <p className="text-gray-700 mb-4">
                      {truncateText(transcript.fullText)}
                    </p>

                    {transcript.summary && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                        <h4 className="text-sm font-medium text-gray-900 mb-1">Summary</h4>
                        <p className="text-sm text-gray-700">{transcript.summary}</p>
                      </div>
                    )}

                    {transcript.keyTopics && transcript.keyTopics.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Key Topics</h4>
                        <div className="flex flex-wrap gap-2">
                          {transcript.keyTopics.map((topic, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>{transcript.createdAt.toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span>{formatDuration(transcript.duration)}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Meeting ID: {transcript.meetingId}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    <button 
                      onClick={() => setSelectedTranscript(transcript)}
                      className="btn-secondary text-sm flex items-center space-x-1"
                    >
                      <Eye className="h-3 w-3" />
                      <span>View Full</span>
                    </button>
                    <button className="btn-secondary text-sm flex items-center space-x-1">
                      <Download className="h-3 w-3" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTranscript && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">
                {selectedTranscript.topic || `Meeting ${selectedTranscript.meetingId}`}
              </h3>
              <button
                onClick={() => setSelectedTranscript(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="prose max-w-none">
                <p className="whitespace-pre-wrap">{selectedTranscript.fullText}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transcripts; 