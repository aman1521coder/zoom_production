#!/bin/bash

# Production Server Setup for aizoomai.com
echo "🚀 Setting up production server for aizoomai.com..."

# 1. Install dependencies
echo "📦 Installing dependencies..."
cd backend
npm install --production

# 2. Setup environment
echo "⚙️ Configuring environment..."
if [ ! -f .env ]; then
    cp config.env .env
    echo "✅ Environment file created. Please edit .env with your production values."
else
    echo "✅ Environment file already exists."
fi

# 3. Create required directories
echo "📁 Creating directories..."
mkdir -p recordings transcripts logs

# 4. Generate security keys if not present
echo "🔐 Checking security configuration..."
if ! grep -q "your-super-secure-jwt-secret" .env; then
    echo "✅ JWT secret appears to be configured."
else
    echo "⚠️ Please update JWT_SECRET in .env file:"
    echo "   JWT_SECRET=$(openssl rand -hex 64)"
fi

if ! grep -q "your-32-byte-encryption-key" .env; then
    echo "✅ Encryption key appears to be configured."
else
    echo "⚠️ Please update ENCRYPTION_KEY in .env file:"
    echo "   ENCRYPTION_KEY=$(openssl rand -hex 32)"
fi

# 5. Check SSL certificate
echo "🔒 Checking SSL setup..."
if [ -f /etc/ssl/certs/aizoomai.com.pem ]; then
    echo "✅ SSL certificate found for aizoomai.com"
else
    echo "⚠️ SSL certificate not found. Run:"
    echo "   sudo certbot --nginx -d aizoomai.com"
fi

# 6. Setup PM2 for production
echo "🔄 Setting up PM2..."
if command -v pm2 &> /dev/null; then
    echo "✅ PM2 is installed"
    
    # Create PM2 ecosystem file
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'aizoomai-backend',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOF
    echo "✅ PM2 ecosystem file created"
else
    echo "⚠️ PM2 not installed. Install with:"
    echo "   npm install -g pm2"
fi

# 7. Setup Nginx configuration
echo "🌐 Nginx configuration..."
cat > /tmp/aizoomai.conf << 'EOF'
server {
    listen 80;
    server_name aizoomai.com www.aizoomai.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name aizoomai.com www.aizoomai.com;
    
    ssl_certificate /etc/letsencrypt/live/aizoomai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aizoomai.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # API endpoints
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # Health check
    location /health {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Frontend (if needed)
    location / {
        root /var/www/aizoomai;
        try_files $uri $uri/ /index.html;
    }
}
EOF

echo "📄 Nginx configuration saved to /tmp/aizoomai.conf"
echo "   Copy to nginx sites-available and enable:"
echo "   sudo cp /tmp/aizoomai.conf /etc/nginx/sites-available/"
echo "   sudo ln -s /etc/nginx/sites-available/aizoomai.conf /etc/nginx/sites-enabled/"
echo "   sudo nginx -t && sudo systemctl reload nginx"

# 8. Setup MongoDB
echo "💾 MongoDB setup..."
if systemctl is-active --quiet mongod; then
    echo "✅ MongoDB is running"
else
    echo "⚠️ MongoDB not running. Start with:"
    echo "   sudo systemctl start mongod"
    echo "   sudo systemctl enable mongod"
fi

# 9. Firewall setup
echo "🔥 Firewall configuration..."
echo "   Configure firewall to allow:"
echo "   - Port 80 (HTTP)"
echo "   - Port 443 (HTTPS)"
echo "   - Port 22 (SSH)"
echo "   sudo ufw allow 22/tcp"
echo "   sudo ufw allow 80/tcp"
echo "   sudo ufw allow 443/tcp"
echo "   sudo ufw enable"

echo ""
echo "🎉 Production setup complete for aizoomai.com!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file with your production credentials"
echo "2. Install SSL certificate with certbot"
echo "3. Configure nginx and restart"
echo "4. Start the application with PM2"
echo ""
echo "🚀 Start your application:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "🧪 Test your setup:"
echo "   node ../test-recording.js"
echo "   curl https://aizoomai.com/health" 