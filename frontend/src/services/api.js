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

export const botService = {
  joinByLink: (invitationLink) =>
    api.post('/bots/join-by-link', { invitationLink }),
  
  getActiveBots: () =>
    api.get('/bots/active'),
  
  stopBot: (meetingId) =>
    api.post(`/bots/stop/${meetingId}`),
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
};

export const healthService = {
  checkHealth: () =>
    api.get('/health', { baseURL: 'https://aizoomai.com' }),
  
  checkVpsHealth: () =>
    axios.get('http://147.93.119.85:3000/health'),
};

export default api; 