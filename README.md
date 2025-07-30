# AiZoomAI - Meeting Automation Platform

Enterprise-grade meeting automation platform with AI transcription capabilities.

**Production URL:** https://aizoomai.com

## 🏗️ Complete Setup

### Backend Setup
```bash
cd backend
npm install
cp config.env .env
# Edit .env with your configuration
npm start
```

### Frontend Setup
```bash
cd frontend
npm install
cp config.env .env
# Edit .env with your API URLs
npm run build  # For production
npm run dev    # For development
```

## 🔧 Environment Configuration

### Backend (.env)
```bash
# Required
MONGODB_URI=mongodb://localhost:27017/meeting-automation
OPENAI_API_KEY=your-openai-key
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-32-byte-key

# Production Domain
BACKEND_URL=https://aizoomai.com
FRONTEND_URL=https://aizoomai.com
DOMAIN=aizoomai.com

# VPS Worker
VPS_URL=http://147.93.119.85:3000
VPS_SECRET=1234
```

### Frontend (.env)
```bash
# API Configuration
VITE_API_URL=https://aizoomai.com/api
VITE_VPS_URL=http://147.93.119.85:3000

# App Configuration
VITE_APP_NAME=AiZoomAI
VITE_APP_VERSION=1.0.0
```

## 🚀 Production Deployment

### 1. Quick Deploy Script
```bash
./server-setup.sh
```

### 2. Manual Deployment

#### Backend
```bash
cd backend
npm install --production
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Frontend
```bash
cd frontend
npm install
npm run build
# Copy dist/ to your web server
```

### 3. Nginx Configuration
```nginx
server {
    listen 443 ssl;
    server_name aizoomai.com;
    
    # API Backend
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Frontend
    location / {
        root /var/www/aizoomai/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

## 📡 API Endpoints

**Base URL:** `https://aizoomai.com/api`

### Webhooks
- `POST /webhooks/zoom` - Zoom webhook events
- `POST /webhooks/manual` - Manual testing

### Recordings
- `POST /recordings/upload/:meetingId` - VPS upload endpoint
- `POST /recordings/start/:meetingId` - Start recording
- `POST /recordings/stop/:meetingId` - Stop recording

### Bots
- `POST /bots/join-by-link` - Join meeting via link
- `GET /bots/active` - Get active bots

### Health
- `GET /health` - System health check

## 🌐 Frontend Features

### Dashboard
- Real-time system health monitoring
- Join meetings via invitation link
- View active bots and recordings
- System status indicators

### Meetings
- Meeting history with search
- Recording status tracking
- Participant information
- Duration and timing details

### Transcripts
- Full-text transcript search
- Word count and summaries
- Key topic extraction
- Download capabilities

### Settings
- API endpoint configuration
- Recording preferences
- Language settings
- System information

## 🧪 Testing Your System

### Test Backend Health
```bash
curl https://aizoomai.com/health
```

### Test Frontend
```bash
# Development
cd frontend && npm run dev
# Open http://localhost:3000

# Production
cd frontend && npm run build && npm run preview
```

### Test Complete System
```bash
node test-recording.js
```

## 🔄 Recording Flow

1. **Zoom Webhook** → `https://aizoomai.com/api/webhooks/zoom`
2. **Bot Launch** → VPS worker joins meeting with recording config
3. **Audio Capture** → Real-time recording on VPS
4. **Upload** → `https://aizoomai.com/api/recordings/upload/{meetingId}`
5. **Transcription** → OpenAI Whisper processes audio
6. **Frontend Update** → Real-time dashboard updates

## 📱 Frontend Technology Stack

- **React 18** - Modern UI framework
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Beautiful icons
- **Axios** - HTTP client for API calls
- **React Router** - Client-side routing

## 🔒 Security Features

- **HTTPS/SSL** enabled for production
- **JWT authentication** for API access
- **Encrypted sensitive data** storage
- **CORS protection** and security headers
- **Environment-based secrets** management

## 🌟 Production URLs

- **Frontend:** https://aizoomai.com
- **API:** https://aizoomai.com/api
- **Health Check:** https://aizoomai.com/health
- **Webhook:** https://aizoomai.com/api/webhooks/zoom

## 📞 Zoom Integration

Set your Zoom webhook URL to:
```
https://aizoomai.com/api/webhooks/zoom
```

Your meeting automation platform is now complete with both backend and frontend! 🎉 