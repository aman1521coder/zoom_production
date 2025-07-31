import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://aizoomai.com/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
    }
    return Promise.reject(error);
  }
);
export const meetingService={
  api
}

export const botService = {
  joinByLink: (invitationLink) =>
    api.post('/bots/join-by-link', { invitationLink }),
  
  getActiveBots: () =>
    api.get('/bots/active'),
  
  stopBot: (meetingId) =>
    api.post(`/webhooks/stop-bot/${meetingId}`, { reason: 'manual_stop' }),
};

export const recordingService = {
  startRecording: (meetingId, userId, method = 'vps_bot') =>
    api.post(`/recordings/start/${meetingId}`, { userId, method }),
  
  stopRecording: (meetingId) =>
    api.post(`/recordings/stop/${meetingId}`),
  
  getRecordings: () =>
    api.get('/recordings'),
};

export const transcriptService = {
  getTranscript: (meetingId) =>
    api.get(`/transcripts/${meetingId}`),
  
  getAllTranscripts: () =>
    api.get('/transcripts'),
  
  searchTranscripts: (query) =>
    api.get(`/transcripts/search?q=${encodeURIComponent(query)}`),
  
  deleteTranscript: (transcriptId) =>
    api.delete(`/transcripts/${transcriptId}`),
};

export const healthService = {
  checkHealth: () =>
    axios.get(`https://aizoomai.com/health`, { timeout: 5000 }),
  
  checkVpsHealth: async () => {
    try {
      // Try direct VPS connection first
      const response = await axios.get('http://147.93.119.85:3000/health', { 
        timeout: 5000,
        validateStatus: (status) => status < 500 
      });
      return response;
    } catch (error) {
      // If CORS blocks direct access, use public backend proxy
      try {
        return await axios.get(`${API_BASE_URL}/vps-health`, { timeout: 5000 });
      } catch (backendError) {
        throw error; // Return original VPS error
      }
    }
  },
};

export const vpsService = {
  getBotStatus: (meetingId) =>
    axios.get(`http://147.93.119.85:3000/status/${meetingId}`, { timeout: 5000 }),
    
  getActiveBots: () =>
    axios.get('http://147.93.119.85:3000/bots', { timeout: 5000 }),
};

export default api; 