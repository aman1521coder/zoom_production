# Production Deployment Guide - aizoomai.com

## 🚀 Quick Deploy to aizoomai.com

### 1. Environment Setup
```bash
cd backend
cp config.env .env
# Edit .env with production values for aizoomai.com
```

### 2. Production Environment Variables
```bash
# Core Configuration
BACKEND_URL=https://aizoomai.com
FRONTEND_URL=https://aizoomai.com
DOMAIN=aizoomai.com
NODE_ENV=production
PORT=5000

# Webhook Configuration
WEBHOOK_URL=https://aizoomai.com/api/webhooks/zoom

# Database (Production MongoDB)
MONGODB_URI=mongodb://user:pass@localhost:27017/meeting-automation?authSource=admin
```

### 3. Security Configuration
```bash
# Generate secure keys
openssl rand -hex 32  # For ENCRYPTION_KEY
openssl rand -hex 64  # For JWT_SECRET
```

### 4. SSL/HTTPS Setup
Ensure your server has SSL certificate for aizoomai.com:
```bash
# Using Let's Encrypt (recommended)
sudo certbot --nginx -d aizoomai.com
```

### 5. Nginx Configuration
```nginx
server {
    listen 443 ssl;
    server_name aizoomai.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/private.key;
    
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /health {
        proxy_pass http://localhost:5000;
    }
}
```

### 6. VPS Worker Configuration
Update your VPS worker to send recordings to production:
```javascript
// VPS worker should upload to:
const BACKEND_URL = 'https://aizoomai.com';
const uploadEndpoint = `${BACKEND_URL}/api/recordings/upload/${meetingId}`;
```

### 7. Start Production Server
```bash
npm install --production
NODE_ENV=production npm start
```

## 🔒 Security Checklist

- ✅ SSL certificate installed for aizoomai.com
- ✅ Environment variables secured
- ✅ Database authentication enabled  
- ✅ Sensitive data encrypted at rest
- ✅ HTTPS redirect configured
- ✅ Rate limiting configured
- ✅ Error messages sanitized

## 📊 Production Monitoring

Health check endpoint:
```bash
curl https://aizoomai.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

## 🧪 Production Testing

Run the test suite against production:
```bash
BACKEND_URL=https://aizoomai.com node test-recording.js
```

Expected output:
```
✅ Backend health: healthy
✅ VPS health: healthy - Active bots: 0
✅ Webhook test passed: Bot launched and recording started
✅ Upload test passed: Recording uploaded and transcribed
🎉 Overall: ALL TESTS PASSED
🚀 Recording system is ready for production!
```

## 🔄 Production Recording Flow

1. **Zoom Webhook** → `https://aizoomai.com/api/webhooks/zoom`
2. **Bot Launch** → VPS worker joins meeting with recording
3. **Audio Capture** → Real-time recording on VPS
4. **Upload** → `https://aizoomai.com/api/recordings/upload/{meetingId}`
5. **Transcription** → OpenAI Whisper processes audio
6. **Database Storage** → Encrypted transcript saved

## 📡 Production API Usage

### Configure Zoom Webhook
In your Zoom Marketplace app, set webhook URL to:
```
https://aizoomai.com/api/webhooks/zoom
```

### Start Recording via Link
```bash
curl -X POST https://aizoomai.com/api/bots/join-by-link \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"invitationLink": "https://zoom.us/j/123456789?pwd=abc123"}'
```

### Check Recording Status
```bash
curl https://aizoomai.com/api/bots/active \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🌐 Domain Configuration Complete

Your production system is now configured for **aizoomai.com**! 

All recording uploads will go to:
`https://aizoomai.com/api/recordings/upload/{meetingId}`

Set your Zoom webhook URL to:
`https://aizoomai.com/api/webhooks/zoom`

🎉 **Production deployment ready for aizoomai.com!** 