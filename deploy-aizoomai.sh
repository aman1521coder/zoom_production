#!/bin/bash

# Complete Deployment Script for AiZoomAI.com
echo "🚀 Deploying AiZoomAI Meeting Automation Platform..."
echo "🌐 Domain: aizoomai.com"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running as root for system commands
check_permissions() {
    if [[ $EUID -eq 0 ]]; then
        print_warning "Running as root. Some commands may need user permissions."
    fi
}

# 1. Backend Setup
setup_backend() {
    echo "📦 Setting up Backend..."
    cd backend
    
    if [ ! -f package.json ]; then
        print_error "Backend package.json not found!"
        exit 1
    fi
    
    # Install dependencies
    npm install --production
    print_status "Backend dependencies installed"
    
    # Setup environment
    if [ ! -f .env ]; then
        cp config.env .env
        print_warning "Environment file created. Please edit backend/.env with your production values:"
        echo "  - MONGODB_URI (your MongoDB connection)"
        echo "  - OPENAI_API_KEY (your OpenAI key)"
        echo "  - JWT_SECRET (generate with: openssl rand -hex 64)"
        echo "  - ENCRYPTION_KEY (generate with: openssl rand -hex 32)"
    else
        print_status "Environment file already exists"
    fi
    
    # Create directories
    mkdir -p recordings transcripts logs
    print_status "Backend directories created"
    
    cd ..
}

# 2. Frontend Setup
setup_frontend() {
    echo "🎨 Setting up Frontend..."
    cd frontend
    
    if [ ! -f package.json ]; then
        print_error "Frontend package.json not found!"
        exit 1
    fi
    
    # Install dependencies
    npm install
    print_status "Frontend dependencies installed"
    
    # Setup environment
    if [ ! -f .env ]; then
        cp config.env .env
        print_status "Frontend environment file created"
    fi
    
    # Build for production
    npm run build
    if [ -d "dist" ]; then
        print_status "Frontend built successfully"
    else
        print_error "Frontend build failed!"
        exit 1
    fi
    
    cd ..
}

# 3. SSL Certificate Setup
setup_ssl() {
    echo "🔒 Setting up SSL Certificate..."
    
    if command -v certbot &> /dev/null; then
        print_status "Certbot is installed"
        print_warning "Run this command to get SSL certificate:"
        echo "  sudo certbot --nginx -d aizoomai.com -d www.aizoomai.com"
    else
        print_warning "Certbot not installed. Install with:"
        echo "  sudo apt update && sudo apt install certbot python3-certbot-nginx"
        echo "  Then run: sudo certbot --nginx -d aizoomai.com"
    fi
}

# 4. Nginx Configuration
setup_nginx() {
    echo "🌐 Setting up Nginx..."
    
    cat > /tmp/aizoomai-nginx.conf << 'EOF'
# HTTP redirect to HTTPS
server {
    listen 80;
    server_name aizoomai.com www.aizoomai.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name aizoomai.com www.aizoomai.com;
    
    # SSL configuration (certbot will manage these)
    ssl_certificate /etc/letsencrypt/live/aizoomai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aizoomai.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # API Backend
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
    
    # Frontend
    location / {
        root /var/www/aizoomai/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
EOF
    
    print_status "Nginx configuration saved to /tmp/aizoomai-nginx.conf"
    print_warning "To apply nginx configuration:"
    echo "  sudo cp /tmp/aizoomai-nginx.conf /etc/nginx/sites-available/aizoomai.com"
    echo "  sudo ln -s /etc/nginx/sites-available/aizoomai.com /etc/nginx/sites-enabled/"
    echo "  sudo nginx -t && sudo systemctl reload nginx"
}

# 5. PM2 Setup
setup_pm2() {
    echo "🔄 Setting up PM2..."
    
    if command -v pm2 &> /dev/null; then
        print_status "PM2 is installed"
        
        cd backend
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
    time: true,
    max_memory_restart: '1G',
    restart_delay: 4000
  }]
};
EOF
        print_status "PM2 ecosystem file created"
        cd ..
    else
        print_warning "PM2 not installed. Install with:"
        echo "  sudo npm install -g pm2"
    fi
}

# 6. Frontend Deployment
deploy_frontend() {
    echo "📁 Deploying Frontend..."
    
    FRONTEND_DIR="/var/www/aizoomai"
    
    if [ -d "frontend/dist" ]; then
        print_warning "To deploy frontend, run as root:"
        echo "  sudo mkdir -p $FRONTEND_DIR"
        echo "  sudo cp -r frontend/dist/* $FRONTEND_DIR/"
        echo "  sudo chown -R www-data:www-data $FRONTEND_DIR"
        echo "  sudo chmod -R 755 $FRONTEND_DIR"
    else
        print_error "Frontend dist directory not found. Run 'npm run build' in frontend/"
    fi
}

# 7. Database Setup
setup_database() {
    echo "💾 Database Setup..."
    
    if systemctl is-active --quiet mongod; then
        print_status "MongoDB is running"
    else
        print_warning "MongoDB not running. Start with:"
        echo "  sudo systemctl start mongod"
        echo "  sudo systemctl enable mongod"
    fi
    
    print_warning "For production, secure your MongoDB:"
    echo "  1. Enable authentication"
    echo "  2. Create database user"
    echo "  3. Update MONGODB_URI in backend/.env"
}

# 8. Firewall Setup
setup_firewall() {
    echo "🔥 Firewall Setup..."
    
    print_warning "Configure firewall to allow:"
    echo "  sudo ufw allow 22/tcp   # SSH"
    echo "  sudo ufw allow 80/tcp   # HTTP"
    echo "  sudo ufw allow 443/tcp  # HTTPS"
    echo "  sudo ufw enable"
}

# 9. Final Steps
final_steps() {
    echo ""
    echo "🎉 Deployment Setup Complete!"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Edit backend/.env with your production credentials"
    echo "2. Install SSL certificate with certbot"
    echo "3. Configure and restart nginx"
    echo "4. Deploy frontend files to /var/www/aizoomai/"
    echo "5. Start backend with PM2"
    echo ""
    echo "🚀 Start your services:"
    echo "  cd backend && pm2 start ecosystem.config.js"
    echo "  pm2 save && pm2 startup"
    echo ""
    echo "🧪 Test your deployment:"
    echo "  curl https://aizoomai.com/health"
    echo "  node test-recording.js"
    echo ""
    echo "🌐 Your AiZoomAI platform will be available at:"
    echo "  https://aizoomai.com"
}

# Main execution
main() {
    check_permissions
    setup_backend
    setup_frontend
    setup_ssl
    setup_nginx
    setup_pm2
    deploy_frontend
    setup_database
    setup_firewall
    final_steps
}

# Run main function
main 