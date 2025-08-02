import express from 'express';
import puppeteer from 'puppeteer';
import crypto from 'crypto';
import axios from 'axios';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Override system locale to prevent en-US defaults
process.env.LANG = 'C';
process.env.LC_ALL = 'C';
process.env.LANGUAGE = 'en';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.WORKER_PORT || 5000;
const API_SECRET_KEY = process.env.WORKER_API_SECRET || "1234";
const ZOOM_SDK_CLIENT_ID = process.env.ZOOM_MEETING_SDK_KEY;
const ZOOM_SDK_CLIENT_SECRET = process.env.ZOOM_MEETING_SDK_SECRET;
const MAIN_SERVER_URL = process.env.MAIN_SERVER_URL;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// High-Performance Redis Manager
class RedisManager {
    constructor() {
        this.cache = new Map();
        this.redis = null;
        this.status = 'disconnected';
        this.subscriber = null;
        this.publisher = null;
        this.initializeRedis();
    }

    async initializeRedis() {
        try {
            const Redis = (await import('ioredis')).default;
            
            // Main Redis connection with optimized settings
            this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
                connectTimeout: 10000,
                lazyConnect: true,
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                enableReadyCheck: true,
                keepAlive: 30000,
                family: 4,
                keyPrefix: 'zoom_worker:',
                db: 0
            });
            
            // Separate connections for pub/sub (Redis best practice)
            this.publisher = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
                keyPrefix: 'zoom_worker:'
            });
            
            this.subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
                keyPrefix: 'zoom_worker:'
            });
            
            this.redis.on('connect', () => {
                this.status = 'connected';
                console.log('Redis cluster connected with high-performance settings');
                this.setupSubscriptions();
            });

            this.redis.on('error', (error) => {
                console.log('Redis error - using memory fallback:', error.message);
                this.redis = null;
                this.status = 'memory-fallback';
            });

            // Connect all instances
            await Promise.all([
                this.redis.connect(),
                this.publisher.connect(),
                this.subscriber.connect()
            ]);

        } catch (error) {
            console.log('Redis unavailable - using memory fallback');
            this.status = 'memory-fallback';
        }
    }

    async setupSubscriptions() {
        if (!this.subscriber) return;
        
        await this.subscriber.subscribe('transcription_complete');
        await this.subscriber.subscribe('bot_commands');
        await this.subscriber.subscribe('meeting_ended');
        await this.subscriber.subscribe('meeting_started');
        
        this.subscriber.on('message', (channel, message) => {
            this.handleRedisMessage(channel, message);
        });
        
        console.log('Redis subscriptions active: transcription_complete, bot_commands, meeting_ended, meeting_started');
    }

    async handleRedisMessage(channel, message) {
        try {
            const data = JSON.parse(message);
            
            switch (channel) {
                case 'transcription_complete':
                    console.log(`Transcription completed for meeting ${data.meetingId}`);
                    break;
                case 'bot_commands':
                    console.log(`Bot command received: ${data.command}`);
                    this.handleBotCommand(data);
                    break;
                case 'meeting_ended':
                    console.log(`Webhook meeting end signal for meeting ${data.meetingId}`);
                    this.handleMeetingEndWebhook(data);
                    break;
            }
        } catch (error) {
            console.error('Error handling Redis message:', error.message);
        }
    }

    async handleBotCommand(data) {
        const { meetingId, command } = data;
        const bot = activeBots.get(meetingId);
        
        if (!bot) {
            console.log(`No active bot found for meeting ${meetingId}`);
            return;
        }

        switch (command) {
            case 'stop_recording':
                console.log(`Stopping recording for meeting ${meetingId} via webhook`);
                await bot.stopRecording();
                await bot.cleanup();
                activeBots.delete(meetingId);
                break;
            case 'end_meeting':
                console.log(`Ending meeting ${meetingId} via webhook`);
                await bot.stopRecording();
                await bot.cleanup();
                activeBots.delete(meetingId);
                break;
        }
    }

    async handleMeetingEndWebhook(data) {
        const { meetingId } = data;
        const bot = activeBots.get(meetingId);
        
        if (bot) {
            console.log(`Processing webhook meeting end for ${meetingId}`);
            await bot.stopRecording();
            await bot.cleanup();
            activeBots.delete(meetingId);
        }
    }

    async setCache(key, value, ttlSeconds = 3600) {
        if (this.redis && this.status === 'connected') {
            try {
                await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
                return true;
            } catch (error) {
                console.error('Cache set error:', error.message);
            }
        }
        
        this.cache.set(key, value);
        setTimeout(() => this.cache.delete(key), ttlSeconds * 1000);
        return true;
    }

    async getCache(key) {
        if (this.redis && this.status === 'connected') {
            try {
                const result = await this.redis.get(key);
                return result ? JSON.parse(result) : null;
            } catch (error) {
                console.error('Cache get error:', error.message);
            }
        }
        
        return this.cache.get(key) || null;
    }

    async recordMetric(type, value, tags = {}) {
        if (this.redis && this.status === 'connected') {
            try {
                const metric = {
                    type,
                    value,
                    tags,
                    timestamp: Date.now()
                };
                await this.redis.lpush('metrics', JSON.stringify(metric));
                await this.redis.ltrim('metrics', 0, 999);
            } catch (error) {
                console.error('Metrics error:', error.message);
            }
        }
    }
}

const redis = new RedisManager();
const activeBots = new Map();
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || path.join(__dirname, 'recordings');

// PERFORMANCE & CONCURRENCY OPTIMIZATIONS
const MAX_CONCURRENT_BOTS = parseInt(process.env.MAX_CONCURRENT_BOTS) || 10;
const MAX_BROWSER_INSTANCES = parseInt(process.env.MAX_BROWSER_INSTANCES) || 5;
const MEMORY_LIMIT_MB = parseInt(process.env.MEMORY_LIMIT_MB) || 4096;
const browserUsage = new Map();
let nextBrowserId = 0;

class BrowserPool {
    constructor() {
        this.browsers = new Map();
        this.available = [];
        this.inUse = new Set();
        this.maxBrowsers = MAX_BROWSER_INSTANCES;
        this.cleanupInterval = null;
        this.startCleanupTimer();
    }

    startCleanupTimer() {
        // Clean up idle browsers every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleBrowsers();
        }, 5 * 60 * 1000);
    }

    async getBrowser() {
        // Check if we have available browsers
        if (this.available.length > 0) {
            const browserId = this.available.pop();
            this.inUse.add(browserId);
            const browser = this.browsers.get(browserId);
            console.log(`Reusing browser ${browserId} from pool (${this.available.length} available)`);
            return { browser, browserId };
        }

        // Create new browser if under limit
        if (this.browsers.size < this.maxBrowsers) {
            const browserId = `browser_${++nextBrowserId}`;
            const browser = await this.createOptimizedBrowser();
            this.browsers.set(browserId, browser);
            this.inUse.add(browserId);
            console.log(`Created new browser ${browserId} (${this.browsers.size}/${this.maxBrowsers})`);
            return { browser, browserId };
        }

        // Wait for available browser (with timeout)
        console.log('Browser pool full, waiting for available browser...');
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Browser pool timeout - all browsers busy'));
            }, 30000);

            const checkAvailable = setInterval(() => {
                if (this.available.length > 0) {
                    clearTimeout(timeout);
                    clearInterval(checkAvailable);
                    const browserId = this.available.pop();
                    this.inUse.add(browserId);
                    const browser = this.browsers.get(browserId);
                    console.log(`Got waiting browser ${browserId} from pool`);
                    resolve({ browser, browserId });
                }
            }, 100);
        });
    }

    releaseBrowser(browserId) {
        if (this.inUse.has(browserId)) {
            this.inUse.delete(browserId);
            this.available.push(browserId);
            console.log(`Released browser ${browserId} to pool (${this.available.length} available)`);
        }
    }

    async createOptimizedBrowser() {
        return await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--autoplay-policy=no-user-gesture-required',
                '--allow-running-insecure-content',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
                '--enable-experimental-web-platform-features',
                '--enable-features=MediaStreamTrackTransfer',
                '--allow-file-access-from-files',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--enable-features=VaapiVideoDecoder',
                '--memory-pressure-off',
                '--max_old_space_size=512',
                '--aggressive-cache-discard',
                '--lang=en',
                '--accept-lang=en'
            ],
            defaultViewport: { width: 1366, height: 768 }, // Reduced from 1920x1080 for efficiency
            protocolTimeout: 60000
        });
    }

    async cleanupIdleBrowsers() {
        console.log(`Browser pool cleanup: ${this.available.length} available, ${this.inUse.size} in use`);
        
        // Keep at least 1 browser in pool, close excess idle browsers
        while (this.available.length > 1) {
            const browserId = this.available.shift();
            const browser = this.browsers.get(browserId);
            if (browser) {
                try {
                    await browser.close();
                    this.browsers.delete(browserId);
                    console.log(`Cleaned up idle browser ${browserId}`);
                } catch (error) {
                    console.log(`Error cleaning up browser ${browserId}:`, error.message);
                }
            }
        }
    }

    async cleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        for (const [browserId, browser] of this.browsers) {
            try {
                await browser.close();
                console.log(`Closed browser ${browserId} during shutdown`);
            } catch (error) {
                console.log(`Error closing browser ${browserId}:`, error.message);
            }
        }
        
        this.browsers.clear();
        this.available.length = 0;
        this.inUse.clear();
    }
}

const browserPool = new BrowserPool();

// Resource monitoring and limits
class ResourceMonitor {
    constructor() {
        this.startMonitoring();
    }

    startMonitoring() {
        // Monitor every 30 seconds
        setInterval(() => {
            this.checkResources();
        }, 30000);
    }

    checkResources() {
        const memUsage = process.memoryUsage();
        const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const totalMemMB = Math.round(memUsage.rss / 1024 / 1024);
        
        console.log(`Resource check: ${activeBots.size}/${MAX_CONCURRENT_BOTS} bots, ${memMB}MB heap, ${totalMemMB}MB total`);
        
        // Memory pressure handling
        if (totalMemMB > MEMORY_LIMIT_MB * 0.8) {
            console.log(`High memory usage detected: ${totalMemMB}MB > ${MEMORY_LIMIT_MB * 0.8}MB threshold`);
            this.handleMemoryPressure();
        }
        
        // Record metrics
        redis.recordMetric('worker_memory_usage', totalMemMB, {
            active_bots: activeBots.size,
            heap_used: memMB
        });
    }

    async handleMemoryPressure() {
        console.log('Handling memory pressure...');
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
            console.log('Forced garbage collection');
        }
        
        // Clean up old bots that may be stuck
        const cutoffTime = Date.now() - (30 * 60 * 1000); // 30 minutes
        let cleanedCount = 0;
        
        for (const [meetingId, bot] of activeBots.entries()) {
            if (bot.startTime.getTime() < cutoffTime) {
                console.log(`Cleaning up old bot ${meetingId} due to memory pressure`);
                try {
                    await bot.cleanup();
                    activeBots.delete(meetingId);
                    cleanedCount++;
                } catch (error) {
                    console.log(`Error cleaning up bot ${meetingId}:`, error.message);
                }
            }
        }
        
        console.log(`Cleaned up ${cleanedCount} old bots due to memory pressure`);
    }

    canCreateNewBot() {
        const memUsage = process.memoryUsage();
        const totalMemMB = Math.round(memUsage.rss / 1024 / 1024);
        
        if (activeBots.size >= MAX_CONCURRENT_BOTS) {
            console.log(`Bot limit reached: ${activeBots.size}/${MAX_CONCURRENT_BOTS}`);
            return { allowed: false, reason: 'concurrent_limit' };
        }
        
        if (totalMemMB > MEMORY_LIMIT_MB * 0.9) {
            console.log(`Memory limit reached: ${totalMemMB}MB > ${MEMORY_LIMIT_MB * 0.9}MB`);
            return { allowed: false, reason: 'memory_limit' };
        }
        
        return { allowed: true };
    }
}

const resourceMonitor = new ResourceMonitor();

if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Meeting URL parsing function
function parseZoomMeetingInfo(input) {
    console.log('Parsing input:', input);
    
    let meetingId = '';
    let domain = 'zoom.us';
    let finalPassword = '';

    if (typeof input === 'string' && input.includes('zoom.')) {
        try {
            const url = new URL(input);
            domain = url.hostname;
            
            const pathMatch = url.pathname.match(/\/j\/(\d+)/);
            if (pathMatch) {
                meetingId = pathMatch[1];
            }
            
            const pwdParam = url.searchParams.get('pwd');
            if (pwdParam) {
                finalPassword = pwdParam;
            }
            
            console.log(`Extracted from URL - Domain: ${domain}, Meeting: ${meetingId}, Password: ${finalPassword ? 'YES' : 'NO'}`);
        } catch (error) {
            console.error('URL parsing error:', error.message);
            const numberMatch = input.match(/\d{9,11}/);
            if (numberMatch) {
                meetingId = numberMatch[0];
                console.log(`Using meeting ID: ${meetingId}, Password: ${finalPassword ? 'YES' : 'NO'}`);
            } else if (input.trim().length > 0) {
                // Flexible fallback - use input as-is
                meetingId = input.trim();
                console.log(`Using flexible meeting ID from URL error: ${meetingId}`);
            }
        }
    } else if (typeof input === 'string') {
        // First try strict 9-11 digit format
        const numberMatch = input.match(/\d{9,11}/);
        if (numberMatch) {
            meetingId = numberMatch[0];
        } else if (input.trim().length > 0) {
            // Accept any non-empty string as meeting ID (more flexible)
            meetingId = input.trim();
            console.log(`Using flexible meeting ID: ${meetingId}`);
        }
    }

    const result = { 
        meetingId, 
        domain, 
        password: finalPassword,
        webClientUrl: `https://${domain}/wc/join/${meetingId}` + (finalPassword ? `?pwd=${finalPassword}` : '')
    };
    console.log('Parsed result:', JSON.stringify(result, null, 2));
    return result;
}

// Webhook function
async function sendWebhook(event, data) {
    if (!WEBHOOK_URL) {
        console.log(`No webhook URL configured, skipping: ${event}`);
        return;
    }

    try {
        const payload = {
            event,
            data,
            timestamp: new Date().toISOString(),
            worker_id: process.env.WORKER_ID || 'worker-1'
        };
        
        console.log(`Sending webhook: ${event}`);
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            console.log(`Webhook sent successfully: ${event}`);
        } else {
            console.log(`Webhook failed (${response.status}): ${event}`);
        }
    } catch (error) {
        console.log(`Webhook error for ${event}:`, error.message);
    }
}

// Bot Manager Class
class BotManager {
    constructor(meetingId, userId = null) {
        this.meetingId = meetingId;
        this.userId = userId;
        this.status = 'initializing';
        console.log(`BotManager constructor - meetingId: ${meetingId}, userId: ${userId}, userId type: ${typeof userId}`);
        console.log(`BotManager userId validation: isObjectId=${typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)}, length=${userId?.length}`);
        this.startTime = new Date();
        this.browser = null;
        this.browserId = null;
        this.page = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordingPath = null;
        this.error = null;
        this.logs = [];
        this.saveInterval = null;
        this.endDetectionInterval = null;
        this.uploadAttempted = false;
        this.transcriptionAttempted = false;
        this.shouldStop = false;  // Flag to signal immediate stop
        this.stopReason = '';     // Reason for stopping
    }

    async updateStatus(status, details = {}) {
        this.status = status;
        this.lastUpdate = new Date();
        const logEntry = {
            timestamp: new Date().toISOString(),
            status,
            details
        };
        this.logs.push(logEntry);
        
        if (this.logs.length > 50) {
            this.logs = this.logs.slice(-50);
        }
        
        await redis.recordMetric('bot_status_change', 1, {
            meetingId: this.meetingId,
            status,
            duration: Date.now() - this.startTime.getTime()
        });

        console.log(`Bot ${this.meetingId}: ${status}`, details);
    }

    // Signal the bot to stop immediately
    signalStop(reason = 'User requested stop') {
        console.log(`Bot ${this.meetingId}: Stop signal received - ${reason}`);
        this.shouldStop = true;
        this.stopReason = reason;
        
        // Stop synthetic audio generation if active
        if (this.page) {
            this.page.evaluate(() => {
                // Set stop flag to prevent new synthetic audio creation
                window.botShouldStop = true;
                
                // Stop existing recording
                if (window.mediaRecorder && window.mediaRecorder.state === 'recording') {
                    console.log('Stopping synthetic audio recording due to stop signal');
                    window.mediaRecorder.stop();
                }
                if (window.recordingStream) {
                    window.recordingStream.getTracks().forEach(track => track.stop());
                }
            }).catch(err => console.log('Error stopping synthetic audio:', err.message));
        }
    }

    // Check if bot should stop
    shouldStopRecording() {
        if (this.shouldStop) {
            console.log(`Bot ${this.meetingId}: Stopping due to: ${this.stopReason}`);
            return true;
        }
        
        // Also check if meeting is in failed/ended states
        if (['failed', 'ended', 'cleaned_up'].includes(this.status)) {
            console.log(`Bot ${this.meetingId}: Stopping due to status: ${this.status}`);
            return true;
        }
        
        return false;
    }

    async startRecording() {
        try {
            const timestamp = Date.now();
            this.recordingPath = path.join(RECORDINGS_DIR, `recording_${timestamp}_${this.meetingId}.webm`);
            
            console.log(`Starting recording for meeting ${this.meetingId}`);
            
            await redis.setCache(`recording:${this.meetingId}:start`, timestamp, 7200);
            
            // CRITICAL: Turn off video BEFORE recording starts (multiple attempts)
            console.log('CRITICAL: Ensuring video is OFF before recording...');
            
            for (let attempt = 1; attempt <= 3; attempt++) {
                console.log(`Video off attempt ${attempt}/3 before recording`);
                await this.aggressiveVideoOff();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.log('Video off sequence completed, proceeding with recording...');
            
            // Try to capture meeting audio by accessing Zoom's audio streams directly
            const recordingResult = await this.page.evaluate(() => {
                return new Promise((resolve) => {
                    try {
                        console.log('Starting meeting audio capture...');
                        
                        // Function to find and capture Zoom's audio streams
                        function findZoomAudioStreams() {
                            console.log('AGGRESSIVE: Searching for Zoom audio streams...');
                            
                            // Look for audio elements that Zoom creates
                            const audioElements = document.querySelectorAll('audio');
                            console.log(`Found ${audioElements.length} audio elements`);
                            
                            // Look for video elements with audio tracks (more thorough)
                            const videoElements = document.querySelectorAll('video');
                            console.log(`Found ${videoElements.length} video elements`);
                            
                            let foundStream = null;
                            let streamSource = '';
                            
                            // PRIORITY 1: Try to get stream from video elements with active audio
                            for (let i = 0; i < videoElements.length; i++) {
                                const video = videoElements[i];
                                console.log(` Video ${i + 1}:`, {
                                    srcObject: !!video.srcObject,
                                    src: video.src || 'none',
                                    muted: video.muted,
                                    paused: video.paused,
                                    volume: video.volume,
                                    className: video.className,
                                    hasAudioTracks: video.srcObject ? video.srcObject.getAudioTracks().length : 0
                                });
                                
                                if (video.srcObject && !video.muted) {
                                    const audioTracks = video.srcObject.getAudioTracks();
                                    const videoTracks = video.srcObject.getVideoTracks();
                                    console.log(` Video ${i + 1} tracks:`, {
                                        audioTracks: audioTracks.length,
                                        videoTracks: videoTracks.length,
                                        audioEnabled: audioTracks.some(t => t.enabled && t.readyState === 'live'),
                                        audioReadyState: audioTracks.map(t => t.readyState),
                                        audioLabels: audioTracks.map(t => t.label)
                                    });
                                    
                                    // Prefer streams with live audio tracks
                                    if (audioTracks.length > 0 && audioTracks.some(t => t.readyState === 'live')) {
                                        console.log(` Found LIVE video element ${i + 1} with ${audioTracks.length} live audio track(s)`);
                                        foundStream = video.srcObject;
                                        streamSource = `video-element-${i + 1}`;
                                        break;
                                    }
                                }
                            }
                            
                            // PRIORITY 2: Try dedicated audio elements with active streams
                            if (!foundStream) {
                                for (let i = 0; i < audioElements.length; i++) {
                                    const audio = audioElements[i];
                                    console.log(` Audio ${i + 1}:`, {
                                        srcObject: !!audio.srcObject,
                                        src: audio.src || 'none',
                                        muted: audio.muted,
                                        paused: audio.paused,
                                        volume: audio.volume,
                                        readyState: audio.readyState
                                    });
                                    
                                    if (audio.srcObject && !audio.muted && audio.readyState >= 2) {
                                        console.log(` Found active audio element ${i + 1} with stream`);
                                        foundStream = audio.srcObject;
                                        streamSource = `audio-element-${i + 1}`;
                                        break;
                                    }
                                }
                            }
                            
                            // PRIORITY 3: Try global stream variables that Zoom might create
                            if (!foundStream) {
                                const globalStreams = [
                                    'localStream', 'remoteStream', 'meetingStream', 'audioStream',
                                    'participantStream', 'sharedStream', 'mainStream'
                                ];
                                for (const streamName of globalStreams) {
                                    if (window[streamName] && typeof window[streamName].getAudioTracks === 'function') {
                                        const audioTracks = window[streamName].getAudioTracks();
                                        if (audioTracks.length > 0 && audioTracks.some(t => t.readyState === 'live')) {
                                            console.log(` Found global stream: ${streamName} with ${audioTracks.length} live audio tracks`);
                                            foundStream = window[streamName];
                                            streamSource = `global-${streamName}`;
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            // PRIORITY 4: Try to capture desktop audio (Zoom screen share audio)
                            if (!foundStream) {
                                try {
                                    console.log(' Attempting to capture screen audio as fallback...');
                                    navigator.mediaDevices.getDisplayMedia({ 
                                        audio: true, 
                                        video: false 
                                    }).then(screenStream => {
                                        if (screenStream.getAudioTracks().length > 0) {
                                            console.log(' Captured screen audio stream');
                                            foundStream = screenStream;
                                            streamSource = 'screen-audio';
                                        }
                                    }).catch(e => {
                                        console.log('Screen audio capture failed:', e.message);
                                    });
                                } catch (e) {
                                    console.log('Screen audio not available:', e.message);
                                }
                            }
                            
                            console.log(` Audio stream search result: ${foundStream ? `Found from ${streamSource}` : 'No streams found'}`);
                            return foundStream;
                        }
                        
                        // Try multiple times to find streams (Zoom loads them asynchronously)
                        let attempts = 0;
                        const maxAttempts = 20; // Increased attempts for better success rate
                        
                        function attemptCapture() {
                            attempts++;
                            console.log(` Audio capture attempt ${attempts}/${maxAttempts}`);
                            
                            const zoomStream = findZoomAudioStreams();
                            
                            if (zoomStream) {
                                console.log('🎉 Successfully found Zoom audio stream!');
                                
                                window.recordingStream = zoomStream;
                                window.recordedChunks = [];
                                
                                const mimeType = 'audio/webm;codecs=opus';
                                
                                try {
                                    window.mediaRecorder = new MediaRecorder(zoomStream, {
                                        mimeType: mimeType,
                                        bitsPerSecond: 128000
                                });
                                
                                window.mediaRecorder.ondataavailable = (event) => {
                                    if (event.data.size > 0) {
                                        window.recordedChunks.push(event.data);
                                            console.log(` Captured meeting audio chunk: ${event.data.size} bytes (Total: ${window.recordedChunks.length} chunks)`);
                                    }
                                };
                                
                                window.mediaRecorder.onstart = () => {
                                        console.log(' Meeting audio recording started successfully!');
                                };
                                
                                window.mediaRecorder.onerror = (event) => {
                                        console.error(' Meeting audio recording error:', event.error);
                                };
                                
                                window.mediaRecorder.onstop = () => {
                                        console.log(' Meeting audio recording stopped');
                                };
                                
                                window.mediaRecorder.start(1000);
                                
                                resolve({ 
                                    success: true, 
                                        method: 'zoom_audio_stream',
                                        mimeType: mimeType,
                                        source: 'real_meeting_audio'
                                    });
                                    return;
                                } catch (recorderError) {
                                    console.error(' MediaRecorder creation failed:', recorderError.message);
                                }
                            }
                            
                            if (attempts < maxAttempts) {
                                // Check if bot should stop before retrying
                                if (window.botShouldStop) {
                                    console.log(' Bot stop signal detected during audio retry, aborting');
                                    resolve({ success: false, error: 'Bot stop signal received' });
                                    return;
                                }
                                
                                console.log(`⏳ No audio streams found yet, retrying in 3 seconds... (${attempts}/${maxAttempts})`);
                                setTimeout(attemptCapture, 3000); // Increased wait time
                            } else {
                                // Check if bot should stop before creating synthetic audio
                                if (window.botShouldStop) {
                                    console.log(' Bot stop signal detected, aborting synthetic audio creation');
                                    resolve({ success: false, error: 'Bot stop signal received' });
                                    return;
                                }
                                
                                console.log(' Max attempts reached, creating minimal synthetic audio for transcription');
                                
                                // Create a very minimal synthetic audio stream for transcription
                                try {
                                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                                    const oscillator = audioContext.createOscillator();
                                    const gainNode = audioContext.createGain();
                                    const dest = audioContext.createMediaStreamDestination();
                                    
                                    // Create almost-silent tone
                                    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime); // Higher frequency
                                    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime); // Very low volume
                                    
                                    oscillator.connect(gainNode);
                                    gainNode.connect(dest);
                                    oscillator.start();
                                    
                                    const syntheticStream = dest.stream;
                                    window.recordingStream = syntheticStream;
                                        window.recordedChunks = [];
                                        
                                    window.mediaRecorder = new MediaRecorder(syntheticStream, {
                                            mimeType: 'audio/webm;codecs=opus'
                                        });
                                        
                                        window.mediaRecorder.ondataavailable = (event) => {
                                            // Check for stop signal before processing chunks
                                            if (window.botShouldStop) {
                                                console.log(' Stop signal detected, terminating synthetic audio');
                                                if (window.mediaRecorder && window.mediaRecorder.state === 'recording') {
                                                    window.mediaRecorder.stop();
                                                }
                                                return;
                                            }
                                            
                                            if (event.data.size > 0) {
                                                window.recordedChunks.push(event.data);
                                            console.log(` Synthetic audio chunk: ${event.data.size} bytes (FALLBACK)`);
                                            }
                                        };
                                        
                                        window.mediaRecorder.start(1000);
                                    
                                        resolve({ 
                                            success: true, 
                                        method: 'synthetic_audio_fallback',
                                            mimeType: 'audio/webm;codecs=opus',
                                            source: 'synthetic_fallback'
                                        });
                                } catch (synthError) {
                                    console.error(' Synthetic audio creation failed:', synthError.message);
                                    resolve({ success: false, error: 'All audio capture methods failed' });
                                }
                            }
                        }
                        
                        // Start the capture attempts
                        attemptCapture();
                        
                    } catch (error) {
                        console.error('Audio capture setup failed:', error.message);
                        resolve({ success: false, error: error.message });
                    }
                });
            });

            if (recordingResult.success) {
                console.log(`Recording started using ${recordingResult.method} with ${recordingResult.mimeType}`);
                
                // Add voice announcement
                await this.announceRecordingStart();
                
                await this.updateStatus('recording', { 
                    method: recordingResult.method,
                    mimeType: recordingResult.mimeType 
                });
                
                await redis.recordMetric('recording_started', 1, {
                    meetingId: this.meetingId,
                    method: recordingResult.method
                });
                
                return true;
            } else {
                console.error(`Recording failed to start: ${recordingResult.error}`);
                await this.updateStatus('recording_failed', { error: recordingResult.error });
                return false;
            }
        } catch (error) {
            console.error('Recording start failed:', error.message);
            await this.updateStatus('recording_failed', { error: error.message });
            return false;
        }
    }

    async stopRecording(shouldUpload = true) {
        try {
            console.log(`Stopping recording for meeting ${this.meetingId}`);
            
            const chunkData = await this.page.evaluate(() => {
                return new Promise(async (resolve) => {
                    if (window.mediaRecorder && window.mediaRecorder.state !== 'inactive') {
                        window.mediaRecorder.onstop = async () => {
                            console.log(`MediaRecorder stopped, extracting ${window.recordedChunks?.length || 0} chunks`);
                            
                            const chunkBuffers = [];
                            for (const chunk of window.recordedChunks || []) {
                                try {
                                    const arrayBuffer = await chunk.arrayBuffer();
                                    const uint8Array = new Uint8Array(arrayBuffer);
                                    chunkBuffers.push(Array.from(uint8Array));
                                } catch (e) {
                                    console.error('Failed to convert chunk in stop:', e.message);
                                }
                            }
                            
                            resolve({
                                success: true,
                                chunks: chunkBuffers,
                                totalChunks: window.recordedChunks?.length || 0
                            });
                        };
                        window.mediaRecorder.stop();
                        
                        if (window.recordingStream) {
                            window.recordingStream.getTracks().forEach(track => track.stop());
                        }
                    } else {
                        console.log('No active MediaRecorder, extracting existing chunks');
                        
                        const chunkBuffers = [];
                        for (const chunk of window.recordedChunks || []) {
                            try {
                                const arrayBuffer = await chunk.arrayBuffer();
                                const uint8Array = new Uint8Array(arrayBuffer);
                                chunkBuffers.push(Array.from(uint8Array));
                            } catch (e) {
                                console.error('Failed to convert existing chunk:', e.message);
                            }
                        }
                        
                        resolve({
                            success: true,
                            chunks: chunkBuffers,
                            totalChunks: window.recordedChunks?.length || 0
                        });
                    }
                });
            });

            if (chunkData.success && chunkData.chunks.length > 0 && this.recordingPath) {
                const buffers = chunkData.chunks.map(chunkArray => Buffer.from(chunkArray));
                const finalBuffer = Buffer.concat(buffers);
                
                fs.writeFileSync(this.recordingPath, finalBuffer);
                console.log(`Final recording saved: ${this.recordingPath} (${finalBuffer.length} bytes, ${chunkData.totalChunks} chunks)`);
                
                if (shouldUpload) {
                    await this.processTranscription();
                }
                return this.recordingPath;
            } else {
                console.log('No recording data to save');
                return null;
            }
        } catch (error) {
            console.error('Recording stop failed:', error.message);
            return null;
        }
    }

    async processTranscription() {
        if (!this.recordingPath || !fs.existsSync(this.recordingPath)) {
            console.log('No recording file found for transcription');
            return false;
        }

        if (this.transcriptionAttempted) {
            console.log('Transcription already attempted, skipping');
            return false;
        }
        this.transcriptionAttempted = true;

        try {
            await this.updateStatus('transcribing');
            console.log(`Starting transcription for meeting ${this.meetingId}`);

            const startTime = Date.now();
            const transcriptionResult = await this.transcribeAudio(this.recordingPath);
            const processingTime = Date.now() - startTime;
            
            await redis.recordMetric('transcription_duration', processingTime, {
                meetingId: this.meetingId,
                fileSize: fs.statSync(this.recordingPath).size
            });
            
            if (transcriptionResult.success) {
                console.log(`Transcription completed: ${transcriptionResult.text.length} characters in ${processingTime}ms`);
        console.log(`Transcription result validation:`, {
            text: { value: transcriptionResult.text, exists: !!transcriptionResult.text, length: transcriptionResult.text?.length },
            duration: { value: transcriptionResult.duration, exists: !!transcriptionResult.duration },
            meetingId: { value: this.meetingId, exists: !!this.meetingId },
            userId: { value: this.userId, exists: !!this.userId }
        });
                
                await redis.setCache(`transcript:${this.meetingId}`, transcriptionResult, 86400);
                
                const saveResult = await this.saveTranscriptToBackend(transcriptionResult);
                
                if (saveResult.success) {
                    await this.updateStatus('completed');
                    console.log(`Transcript saved to backend successfully`);
                    
                    if (redis.publisher) {
                        await redis.publisher.publish('transcription_complete', JSON.stringify({
                            meetingId: this.meetingId,
                            transcriptId: saveResult.transcriptId,
                            processingTime,
                            wordCount: transcriptionResult.text.split(' ').length
                        }));
                    }
                    
                    fs.unlinkSync(this.recordingPath);
                    console.log('Recording file cleaned up after transcription');
                    
                    await redis.recordMetric('transcription_success', 1, {
                        meetingId: this.meetingId,
                        processingTime
                    });
                    
                    return true;
                } else {
                    await this.updateStatus('save_failed');
                    console.error('Failed to save transcript to backend:', saveResult.error);
                    return false;
                }
            } else {
                await this.updateStatus('transcription_failed');
                console.error('Transcription failed:', transcriptionResult.error);
                return false;
            }
        } catch (error) {
            console.error('Transcription process failed:', error.message);
            await this.updateStatus('transcription_failed');
            return false;
        }
    }

    async announceRecordingStart() {
        try {
            console.log('Starting voice announcement sequence...');
            
            // Wait for meeting to be fully loaded
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // STEP 1: Ensure bot is unmuted for announcement
            console.log('Step 1: Temporarily unmuting bot for announcement...');
            
            const unmutedSuccessfully = await this.page.evaluate(() => {
                try {
                    let success = false;
                    
                    // Find and click unmute button - try multiple selectors
                    const unmuteSelectors = [
                        'button[aria-label*="unmute" i]',
                        'button[aria-label*="Unmute microphone" i]',
                        'button[aria-label*="Turn on microphone" i]',
                        'button[title*="unmute" i]',
                        'button[title*="Turn on microphone" i]',
                        'button[class*="unmute"]',
                        '#preview-audio-control-button',
                        '#audio-preview-microphone-button',
                        '#microphone-button',
                        '#audio-button',
                        'button[data-testid*="audio"]',
                        'button[data-testid*="microphone"]'
                    ];
                    
                    for (const selector of unmuteSelectors) {
                        try {
                            const buttons = document.querySelectorAll(selector);
                            buttons.forEach(button => {
                                if (button && button.click) {
                                    const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
                                    const title = (button.getAttribute('title') || '').toLowerCase();
                                    
                                    // Click if it's an unmute button
                                    if (ariaLabel.includes('unmute') || ariaLabel.includes('turn on') || 
                                        title.includes('unmute') || title.includes('turn on')) {
                                        button.click();
                                        success = true;
                                        console.log(`Unmuted via: ${selector}`);
                                    }
                                }
                            });
                        } catch (e) {
                            // Continue to next selector
                        }
                    }
                    
                    return success;
                } catch (e) {
                    console.log('Unmute failed:', e.message);
                    return false;
                }
            });
            
            console.log(`Unmute result: ${unmutedSuccessfully}`);
            
            // STEP 2: Wait for unmute to take effect
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // STEP 3: Make voice announcement with multiple methods
            console.log('Step 2: Making voice announcement...');
            
            const announcementResult = await this.page.evaluate(() => {
                const results = [];
                
                try {
                    // Method 1: Speech Synthesis API
                    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.speak) {
                        const message = "Recording started";
                        
                        const utterance = new SpeechSynthesisUtterance(message);
                        utterance.rate = 0.8;
                        utterance.volume = 1.0; // Maximum volume
                        utterance.pitch = 1.0;
                        utterance.lang = 'en-US';
                        
                        // Set voice if available
                        const voices = speechSynthesis.getVoices();
                        if (voices.length > 0) {
                            utterance.voice = voices[0];
                        }
                        
                        speechSynthesis.speak(utterance);
                        results.push('Speech synthesis announcement made');
                    } else {
                        results.push('Speech synthesis not available');
                    }
                    
                } catch (speechError) {
                    results.push(`Speech synthesis failed: ${speechError.message}`);
                }
                
                try {
                    // Method 2: Audio element approach
                    const audio = document.createElement('audio');
                    
                    // Create a simple beep sound as data URI
                    const beepDataUri = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmghAz+Y2vPLeh4FJ4DN8deLOAggbrrt0qNIAwAA';
                    
                    audio.src = beepDataUri;
                    audio.volume = 0.8;
                    audio.play().then(() => {
                        results.push('Audio beep played');
                    }).catch(err => {
                        results.push(`Audio beep failed: ${err.message}`);
                    });
                    
                } catch (audioError) {
                    results.push(`Audio method failed: ${audioError.message}`);
                }
                
                try {
                    // Method 3: Try to send a chat message as announcement
                    const chatInput = document.querySelector('textarea[placeholder*="chat" i], input[placeholder*="chat" i], textarea[aria-label*="chat" i]');
                    if (chatInput) {
                        chatInput.focus();
                        chatInput.value = 'Recording started';
                        
                        // Trigger input event
                        const inputEvent = new Event('input', { bubbles: true });
                        chatInput.dispatchEvent(inputEvent);
                        
                        // Try to find and click send button
                        const sendButton = document.querySelector('button[aria-label*="send" i], button[title*="send" i], button[type="submit"]');
                        if (sendButton) {
                            setTimeout(() => sendButton.click(), 500);
                            results.push('Chat message sent as announcement');
                        }
                    }
                } catch (chatError) {
                    results.push(`Chat announcement failed: ${chatError.message}`);
                }
                
                return results;
            });
            
            console.log('Announcement results:', announcementResult);
            
            // STEP 4: Wait for announcement to complete
            await new Promise(resolve => setTimeout(resolve, 4000));
            
            // STEP 5: Re-mute the bot
            console.log('Step 3: Re-muting bot after announcement...');
            
            const remutedSuccessfully = await this.page.evaluate(() => {
                try {
                    let success = false;
                    
                    const muteSelectors = [
                        'button[aria-label*="mute" i]:not([aria-label*="unmute" i])',
                        'button[aria-label*="Mute microphone" i]',
                        'button[aria-label*="Turn off microphone" i]',
                        'button[title*="mute" i]:not([title*="unmute" i])',
                        'button[title*="Turn off microphone" i]',
                        '#preview-audio-control-button',
                        '#audio-preview-microphone-button'
                    ];
                    
                    for (const selector of muteSelectors) {
                        try {
                            const buttons = document.querySelectorAll(selector);
                            buttons.forEach(button => {
                                if (button && button.click) {
                                    const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
                                    const title = (button.getAttribute('title') || '').toLowerCase();
                                    
                                    // Click if it's a mute button
                                    if ((ariaLabel.includes('mute') && !ariaLabel.includes('unmute')) || 
                                        ariaLabel.includes('turn off') ||
                                        (title.includes('mute') && !title.includes('unmute')) || 
                                        title.includes('turn off')) {
                                        button.click();
                                        success = true;
                                        console.log(`Re-muted via: ${selector}`);
                                    }
                                }
                            });
                        } catch (e) {
                            // Continue to next selector
                        }
                    }
                    
                    return success;
                } catch (e) {
                    console.log('Re-mute failed:', e.message);
                    return false;
                }
            });
            
            console.log(`Re-mute result: ${remutedSuccessfully}`);
            console.log('Voice announcement sequence completed successfully');
            
        } catch (error) {
            console.log("Voice announcement sequence failed:", error.message);
        }
    }

    async aggressiveVideoOff() {
        try {
            console.log('Starting aggressive video off sequence...');
            
            // Reduced attempts from 5 to 2 to prevent infinite loops
            for (let attempt = 1; attempt <= 2; attempt++) {
                console.log(`Video off attempt ${attempt}/2`);
                
                const results = await this.page.evaluate((attemptNum) => {
                    const results = [];
                    
                    try {
                        // Strategy 1: Find and click ALL possible video-related buttons
                        const videoButtonSelectors = [
                            // Standard Zoom selectors
                            'button[aria-label*="turn off camera" i]',
                            'button[aria-label*="stop camera" i]',
                            'button[aria-label*="camera off" i]',
                            'button[aria-label*="stop video" i]',
                            'button[aria-label*="turn off video" i]',
                            'button[aria-label*="disable video" i]',
                            'button[aria-label*="video off" i]',
                            'button[title*="stop video" i]',
                            'button[title*="turn off video" i]',
                            'button[title*="camera off" i]',
                            
                            // ID-based selectors
                            '#preview-video-control-button',
                            '#video-preview-camera-button',
                            '#camera-button',
                            '#video-button',
                            
                            // Class-based selectors (limited to prevent excessive clicking)
                            'button[class*="video"]:not([aria-label*="start" i])',
                            'button[class*="camera"]:not([aria-label*="start" i])'
                        ];
                        
                        let clickedButtons = 0;
                        videoButtonSelectors.forEach((selector, index) => {
                            try {
                                const buttons = document.querySelectorAll(selector);
                                buttons.forEach((button, btnIndex) => {
                                    if (button && button.click && clickedButtons < 3) { // Limit to 3 clicks max
                                        // Check if button indicates video is currently on
                                        const buttonText = (button.textContent || '').toLowerCase();
                                        const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
                                        const title = (button.getAttribute('title') || '').toLowerCase();
                                        
                                        const indicatesVideoOn = 
                                            buttonText.includes('stop') || 
                                            buttonText.includes('turn off') || 
                                            buttonText.includes('disable') ||
                                            ariaLabel.includes('stop') || 
                                            ariaLabel.includes('turn off') || 
                                            ariaLabel.includes('disable') ||
                                            title.includes('stop') || 
                                            title.includes('turn off') || 
                                            title.includes('disable');
                                        
                                        // Only click if it's clearly a "turn off" button or first few buttons
                                        if (indicatesVideoOn || clickedButtons < 2) {
                                            button.click();
                                            clickedButtons++;
                                            results.push(`Clicked video button ${clickedButtons}: ${selector}`);
                                        }
                                    }
                                });
                            } catch (e) {
                                // Continue to next selector
                            }
                        });
                        
                        results.push(`Total video buttons clicked: ${clickedButtons}`);
                        
                    } catch (buttonError) {
                        results.push(`Button clicking failed: ${buttonError.message}`);
                    }
                    
                    try {
                        // Strategy 2: Programmatically stop video streams (simplified)
                        let stoppedTracks = 0;
                        
                        const videos = document.querySelectorAll('video');
                        videos.forEach((video, index) => {
                            if (video.srcObject) {
                                const videoTracks = video.srcObject.getVideoTracks();
                                videoTracks.forEach((track, trackIndex) => {
                                    if (track.readyState === 'live') {
                                        track.stop();
                                        track.enabled = false;
                                        stoppedTracks++;
                                        results.push(`Stopped video track ${trackIndex} from video element ${index}`);
                                    }
                                });
                            }
                        });
                        
                        results.push(`Total video tracks stopped: ${stoppedTracks}`);
                        
                    } catch (streamError) {
                        results.push(`Stream stopping failed: ${streamError.message}`);
                    }
                    
                    try {
                        // Strategy 3: Hide video elements with CSS
                        const style = document.createElement('style');
                        style.textContent = `
                            video[autoplay]:not([muted]) { display: none !important; opacity: 0 !important; }
                            video[data-preview="true"] { display: none !important; }
                            .video-preview { display: none !important; }
                            [class*="video-preview"] { display: none !important; }
                            [class*="camera-preview"] { display: none !important; }
                            [data-testid*="video"] { opacity: 0 !important; }
                            [aria-label*="video preview"] { display: none !important; }
                        `;
                        document.head.appendChild(style);
                        results.push('Applied aggressive CSS video hiding');
                        
                    } catch (cssError) {
                        results.push(`CSS hiding failed: ${cssError.message}`);
                    }
                    
                    // Strategy 4: Set all video elements to hidden/muted
                    try {
                        const videos = document.querySelectorAll('video');
                        videos.forEach((video, index) => {
                            video.style.display = 'none';
                            video.style.opacity = '0';
                            video.muted = true;
                            video.pause();
                            if (video.srcObject) {
                                const tracks = video.srcObject.getTracks();
                                tracks.forEach(track => {
                                    if (track.kind === 'video') {
                                        track.stop();
                                        track.enabled = false;
                                    }
                                });
                            }
                        });
                        results.push(`Processed ${videos.length} video elements`);
                    } catch (videoError) {
                        results.push(`Video element processing failed: ${videoError.message}`);
                    }
                    
                    return results;
                }, attempt);
                
                console.log(`Attempt ${attempt} results:`, results);
                
                // Wait between attempts (reduced from 2s to 1s)
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.log('Aggressive video off sequence completed');
            return ['Video off sequence completed with 2 attempts'];
            
        } catch (error) {
            console.log('Aggressive video off failed:', error.message);
            return [`Function failed: ${error.message}`];
        }
    }

    async transcribeAudio(audioPath) {
        try {
            if (!OPENAI_API_KEY) {
                throw new Error('OpenAI API key not configured');
            }

            const FormData = (await import('form-data')).default;
            const formData = new FormData();
            formData.append('file', fs.createReadStream(audioPath));
            formData.append('model', 'whisper-1');
            formData.append('language', 'en');

            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    ...formData.getHeaders()
                },
                body: formData
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenAI API error: ${error}`);
            }

            const result = await response.json();
            return {
                success: true,
                text: result.text,
                duration: result.duration || 0
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    async saveTranscriptToBackend(transcriptionResult) {
        try {
            const fullText = transcriptionResult?.text?.trim();

            // Enhanced validation - don't save empty or meaningless transcripts
            if (!this.meetingId || !this.userId || !fullText || fullText.length < 3) {
                console.error(' Aborting transcript save due to missing or insufficient data.', {
                    meetingId: this.meetingId || 'MISSING',
                    userId: this.userId || 'MISSING',
                    fullText: fullText || 'MISSING_OR_EMPTY',
                    textLength: fullText ? fullText.length : 0,
                    reason: !fullText ? 'No transcript text' : fullText.length < 3 ? 'Text too short (likely noise)' : 'Other validation failed'
                });
                return { success: false, error: 'Insufficient transcript data - meeting may have had no audio content or only brief noise.' };
            }

            const stats = fs.statSync(this.recordingPath);
            let userIdForBackend = this.userId;
            
            // Check if userId is a MongoDB ObjectId (24 hex characters)
            const isObjectId = typeof this.userId === 'string' && this.userId.match(/^[0-9a-fA-F]{24}$/);
            
            console.log(`USERID VALIDATION: userId="${this.userId}", isObjectId=${isObjectId}, type=${typeof this.userId}`);
            
            if (!isObjectId) {
                // This is likely a Zoom hostId, need to get proper MongoDB userId from backend
                console.log(`INVALID USERID: "${this.userId}" is not a MongoDB ObjectId, fetching proper userId from backend...`);
                
                try {
                    const secretKey = process.env.VPS_SECRET || process.env.MAIN_SERVER_SECRET || '1234';
                    const baseUrl = MAIN_SERVER_URL.replace(/\/api$/, '');
                    const userLookupUrl = `${baseUrl}/api/maintenance/get-user-by-zoom-id/${this.userId}`;
                    
                    const userResponse = await fetch(userLookupUrl, {
                        headers: {
                            'x-admin-secret': secretKey
                        }
                    });
                    
                    if (userResponse.ok) {
                        const userData = await userResponse.json();
                        if (userData.userId) {
                            userIdForBackend = userData.userId;
                            console.log(`USER LOOKUP SUCCESS: Found MongoDB userId "${userIdForBackend}" for Zoom hostId "${this.userId}"`);
                        } else {
                            console.error(`USER LOOKUP FAILED: No userId found for Zoom hostId "${this.userId}"`);
                            return { success: false, error: `Cannot find MongoDB user for Zoom hostId: ${this.userId}` };
                        }
                    } else {
                        console.error(`USER LOOKUP API FAILED: ${userResponse.status} - ${await userResponse.text()}`);
                        return { success: false, error: `User lookup failed for hostId: ${this.userId}` };
                    }
                } catch (lookupError) {
                    console.error(`USER LOOKUP ERROR: ${lookupError.message}`);
                    return { success: false, error: `User lookup error: ${lookupError.message}` };
                }
            }
            
            const payload = {
                meetingId: this.meetingId,
                userId: userIdForBackend,
                fullText: fullText,
                audioDuration: transcriptionResult.duration,
                audioSize: stats.size,
                wordCount: fullText.split(' ').length,
                processingTime: (Date.now() - this.startTime.getTime()) / 1000
            };
            
            console.log(`Payload before sending:`, JSON.stringify(payload, null, 2)); // <-- CHECK THIS LOG

            const secretKey = process.env.VPS_SECRET || process.env.MAIN_SERVER_SECRET || '1234';
            const baseUrl = MAIN_SERVER_URL.replace(/\/api$/, '');
            const saveUrl = `${baseUrl}/api/recordings/transcripts/save`;
            const headers = {
                'Content-Type': 'application/json',
                'x-worker-secret': secretKey
            };
            
            const response = await fetch(saveUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            console.log(`Backend response status: ${response.status}`);
            const responseData = await response.json();
            console.log(`Backend response:`, responseData);

            if (response.status === 200) {
                console.log('Transcript saved successfully to backend');
                return { success: true, transcriptId: responseData.transcriptId };
            } else {
                console.error(`Backend returned status ${response.status}:`, responseData);
                return { success: false, error: `Backend returned status ${response.status}` };
            }
        } catch (error) {
            console.error('Full fetch error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async checkMeetingStatus() {
        try {
            const meetingStatus = await this.page.evaluate(() => {
                // VERY specific end indicators - only the most obvious ones
                const endIndicators = [
                    'this meeting has been ended by the host',
                    'the meeting has ended',
                    'meeting has been ended',
                    'you have been removed from the meeting',
                    'the host has ended this meeting for everyone'
                ];
                
                const bodyText = document.body?.textContent?.toLowerCase() || '';
                const meetingEnded = endIndicators.some(indicator => bodyText.includes(indicator));
                
                // Check for critical meeting UI elements that indicate an active meeting
                const criticalMeetingElements = [
                    'video[srcObject]', // Active video streams
                    'audio[srcObject]', // Active audio streams
                    '.meeting-client-view',
                    '.webclient-meeting-view', 
                    '.zm-video-container',
                    '[class*="meeting-controls"]',
                    '[class*="footer-button-base"]', // Zoom control buttons
                    'button[aria-label*="mute"]',
                    'button[aria-label*="Leave"]',
                    'button[aria-label*="End"]',
                    '[data-testid*="meeting"]'
                ];
                
                let criticalElements = 0;
                criticalMeetingElements.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        criticalElements++;
                    }
                });

                // Check if we're on a "meeting ended" page or back to home/join page
                const currentUrl = window.location.href;
                const onEndedPage = currentUrl.includes('/leave') || 
                                 currentUrl.includes('/end') || 
                                 currentUrl.includes('/postattendee') ||
                                 bodyText.includes('thank you for joining') ||
                                 bodyText.includes('you have left the meeting');

                // TRIPLE verification: explicit end message AND no critical elements AND possibly on end page
                const definitelyEnded = meetingEnded && criticalElements <= 1 && onEndedPage;

                return {
                    meetingEnded,
                    criticalElements,
                    onEndedPage,
                    definitelyEnded,
                    bodyText: bodyText.substring(0, 300),
                    currentUrl: currentUrl,
                    pageTitle: document.title
                };
            });

            console.log(` CONSERVATIVE Meeting check: explicit_end=${meetingStatus.meetingEnded}, critical_elements=${meetingStatus.criticalElements}, ended_page=${meetingStatus.onEndedPage}, DEFINITELY_ENDED=${meetingStatus.definitelyEnded}`);

            // Only end if we have TRIPLE confirmation
            if (meetingStatus.definitelyEnded) {
                console.log(` Meeting ${this.meetingId} has DEFINITELY ended - stopping recording`);
                console.log(`Page title: ${meetingStatus.pageTitle}`);
                console.log(` Current URL: ${meetingStatus.currentUrl}`);
                
                // Signal stop to prevent synthetic audio generation
                this.signalStop('Meeting ended - triple confirmation');
                
                await sendWebhook('meeting.ended', {
                    meetingId: this.meetingId,
                    endReason: 'triple_confirmed_ended',
                    duration: Date.now() - this.startTime.getTime(),
                    recordingPath: this.recordingPath,
                    pageTitle: meetingStatus.pageTitle,
                    finalUrl: meetingStatus.currentUrl
                });

                await this.stopRecording();
                await this.cleanup();
                
                activeBots.delete(this.meetingId);
            } else {
                console.log(` Meeting ${this.meetingId} still active - continuing recording (critical_elements: ${meetingStatus.criticalElements})`);
            }
        } catch (error) {
            console.error(`Meeting status check failed for ${this.meetingId}:`, error.message);
        }
    }

    async ensureBotIsMutedAndVideoOff() {
        try {
            console.log('Ensuring bot is muted and video is completely off...');
            
            // Wait for UI to stabilize first
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const muteResult = await this.page.evaluate(() => {
                const results = {
                    audioMuted: false,
                    videoOff: false,
                    attempts: [],
                    debugInfo: {
                        videoElements: [],
                        audioElements: []
                    }
                };

                // SMART VIDEO CHECK: Look for "Start Video" button which means video is OFF
                const startVideoButton = document.querySelector('button[aria-label*="start video" i], button[aria-label*="start my video" i]');
                const videoAlreadyOff = startVideoButton && startVideoButton.textContent.toLowerCase().includes('start');
                
                if (videoAlreadyOff) {
                    results.videoOff = true;
                    results.attempts.push(' Video already OFF (found "Start Video" button)');
                } else {
                    // Only try video off if not already off
                    const allVideoButtons = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'))
                        .filter(el => {
                            const text = el.textContent?.toLowerCase() || '';
                            const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
                            const title = el.getAttribute('title')?.toLowerCase() || '';
                            
                            return (text.includes('video') || text.includes('camera') || 
                                   aria.includes('video') || aria.includes('camera') ||
                                   title.includes('video') || title.includes('camera')) &&
                                   (text.includes('stop') || text.includes('off') || text.includes('disable') ||
                                    aria.includes('stop') || aria.includes('off') || aria.includes('disable'));
                        });

                    results.debugInfo.videoElements = allVideoButtons.slice(0, 3).map(el => ({
                        tag: el.tagName,
                        text: el.textContent?.trim(),
                        aria: el.getAttribute('aria-label'),
                        title: el.getAttribute('title'),
                        className: el.className
                    }));

                    // Try to click stop video buttons (max 2 attempts)
                    for (let i = 0; i < Math.min(2, allVideoButtons.length); i++) {
                        try {
                            const button = allVideoButtons[i];
                            button.click();
                            results.attempts.push(` Video off via icon click: ${button.className}`);
                            results.videoOff = true;
                            break;
                        } catch (e) {
                            results.attempts.push(` Video click failed: ${e.message}`);
                        }
                    }
                    
                    if (!results.videoOff) {
                        results.attempts.push(' Could not find video off buttons');
                    }
                }

                // FOCUSED AUDIO MUTE: Try multiple audio mute strategies
                const audioMuteStrategies = [
                    // Strategy 1: Direct mute button selectors
                    () => {
                        const muteSelectors = [
                            'button[aria-label*="mute microphone" i]',
                            'button[aria-label*="mute your microphone" i]',
                            'button[aria-label*="turn off microphone" i]',
                            'button[title*="mute microphone" i]',
                            'button[title*="mute your microphone" i]',
                            '#preview-audio-control-button'
                        ];
                        
                        for (const selector of muteSelectors) {
                            try {
                                const button = document.querySelector(selector);
                                if (button) {
                                    button.click();
                                    results.attempts.push(` Audio muted via: ${selector}`);
                                    return true;
                                }
                            } catch (e) {
                                results.attempts.push(` Audio selector failed: ${selector} - ${e.message}`);
                            }
                        }
                        return false;
                    },
                    
                    // Strategy 2: Look for unmute buttons (which means we need to click them to mute)
                    () => {
                        const unmuteButtons = Array.from(document.querySelectorAll('button'))
                            .filter(btn => {
                                const text = btn.textContent?.toLowerCase() || '';
                                const aria = btn.getAttribute('aria-label')?.toLowerCase() || '';
                                
                                return !aria.includes('mute') && !text.includes('mute') &&
                                       (aria.includes('microphone') || aria.includes('audio') ||
                                        text.includes('microphone') || text.includes('audio'));
                            });
                        
                        if (unmuteButtons.length > 0) {
                            try {
                                unmuteButtons[0].click();
                                results.attempts.push(` Audio muted via microphone button: "${unmuteButtons[0].getAttribute('aria-label')}"`);
                                return true;
                            } catch (e) {
                                results.attempts.push(` Microphone button click failed: ${e.message}`);
                            }
                        }
                        return false;
                    },
                    
                    // Strategy 3: Look for any button containing "microphone" in class or data attributes
                    () => {
                        const micButtons = document.querySelectorAll('[class*="microphone"], [class*="audio"], [data-testid*="audio"], [data-testid*="microphone"]');
                        for (const button of micButtons) {
                            if (button.tagName === 'BUTTON' || button.getAttribute('role') === 'button') {
                                try {
                                    button.click();
                                    results.attempts.push(` Audio muted via class/data: ${button.className || button.getAttribute('data-testid')}`);
                                    return true;
                                } catch (e) {
                                    results.attempts.push(` Class-based audio click failed: ${e.message}`);
                                }
                            }
                        }
                        return false;
                    }
                ];

                // Try each audio mute strategy until one works
                for (let i = 0; i < audioMuteStrategies.length; i++) {
                    try {
                        if (audioMuteStrategies[i]()) {
                            results.audioMuted = true;
                            results.attempts.push(` SUCCESS: Audio muted using strategy ${i + 1}`);
                            break;
                        }
                    } catch (e) {
                        results.attempts.push(` Audio strategy ${i + 1} crashed: ${e.message}`);
                    }
                }

                return results;
            });

            console.log(' OPTIMIZED Mute/Video results:', JSON.stringify(muteResult, null, 2));
            
            if (muteResult.audioMuted) {
                console.log(' Bot audio successfully muted');
            } else {
                console.log(' WARNING: Could not mute bot audio');
            }
            
            if (muteResult.videoOff) {
                console.log(' Bot video successfully turned OFF');
            } else {
                console.log(' WARNING: Could not confirm video is off');
            }

            // Give time for changes to take effect
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(' Critical error in mute/video off:', error.message);
        }
    }

    async cleanup() {
        console.log(`Cleaning up bot ${this.meetingId}`);
        
        // Signal stop to prevent synthetic audio generation
        this.signalStop('Bot cleanup initiated');
        
        if (this.saveInterval) {
            clearInterval(this.saveInterval);
            this.saveInterval = null;
        }
        
        if (this.endDetectionInterval) {
            clearInterval(this.endDetectionInterval);
            this.endDetectionInterval = null;
        }
        
        if (this.status === 'recording') {
            await this.stopRecording(false);
        }
        
        try {
            // Close the page but reuse the browser
            if (this.page) {
                await this.page.close();
                this.page = null;
            }
            
            // Return browser to pool instead of closing it
            if (this.browserId) {
                browserPool.releaseBrowser(this.browserId);
                this.browser = null;
                this.browserId = null;
            } else if (this.browser) {
                // Fallback for old browsers not from pool
                await this.browser.close();
                this.browser = null;
            }
        } catch (error) {
            console.log(`Error during browser cleanup: ${error.message}`);
        }
        
        await sendWebhook('bot.cleanup', {
            meetingId: this.meetingId,
            duration: Date.now() - this.startTime.getTime()
        });
        
        this.status = 'cleaned_up';
    }
}

// Browser creation function
async function createBrowser() {
    return await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--autoplay-policy=no-user-gesture-required',
            '--allow-running-insecure-content',
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--enable-experimental-web-platform-features',
            '--enable-features=MediaStreamTrackTransfer',
            '--allow-file-access-from-files',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--enable-features=VaapiVideoDecoder',
            '--enable-logging',
            '--log-level=0',
            '--lang=en',  // Force language to 'en' instead of 'en-US'
            '--accept-lang=en'  // Override Accept-Language header
        ],
        defaultViewport: { width: 1920, height: 1080 }
    });
}

// Main bot joining function
async function joinMeeting(meetingIdOrUrl, password = '', userId = 'bot') {
    const parsedUrl = parseZoomMeetingInfo(meetingIdOrUrl);
    const meetingId = parsedUrl.meetingId;
    
    if (!meetingId) {
        throw new Error('Invalid meeting ID or URL');
    }

    // Use provided password if URL parsing didn't find one
    const finalPassword = parsedUrl.password || password;
    console.log(`Password resolution: ${finalPassword ? 'PROVIDED' : 'NONE'}`);

    if (activeBots.has(meetingId)) {
        throw new Error(`Bot already exists for meeting ${meetingId}`);
    }

    // Check resource limits before creating new bot
    const resourceCheck = resourceMonitor.canCreateNewBot();
    if (!resourceCheck.allowed) {
        const errorMsg = resourceCheck.reason === 'concurrent_limit' 
            ? `Maximum concurrent bots limit reached (${MAX_CONCURRENT_BOTS})`
            : `Memory limit reached (${MEMORY_LIMIT_MB}MB)`;
        console.log(`Bot creation denied: ${errorMsg}`);
        throw new Error(errorMsg);
    }

    console.log(`CREATING BOT: meetingId="${meetingId}", userId="${userId}", userIdType=${typeof userId}`);
    const botManager = new BotManager(meetingId, userId);
    activeBots.set(meetingId, botManager);

    try {
        console.log(`Starting bot for meeting ${meetingId} on domain ${parsedUrl.domain} (${activeBots.size}/${MAX_CONCURRENT_BOTS} active)`);
        
        // Get browser from pool
        const { browser, browserId } = await browserPool.getBrowser();
        botManager.browser = browser;
        botManager.browserId = browserId;
        botManager.page = await browser.newPage();

        // Set a real browser user agent
        await botManager.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Optimize page for performance
        await botManager.page.setRequestInterception(true);
        botManager.page.on('request', (request) => {
            const resourceType = request.resourceType();
            // Block unnecessary resources to save bandwidth and memory
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Disable webdriver detection and optimize
        await botManager.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            // Optimize performance
            window.performance.mark = () => {};
            window.performance.measure = () => {};
        });

        botManager.page.on('console', msg => {
            const text = msg.text();
            console.log(`Browser console [${meetingId}]:`, text);
            
            // Monitor for meeting end indicators in console logs
            if (text.includes('sharing_websocket_on_close') || 
                text.includes('websocket onclose event') ||
                text.includes('code:513') ||
                text.includes('meeting has ended') ||
                text.includes('you have been removed from the meeting')) {
                
                console.log(`Meeting end detected via console for ${meetingId}: ${text}`);
                
                // Trigger webhook with delay to ensure all logs are captured
                setTimeout(async () => {
                    try {
                        const bot = activeBots.get(meetingId);
                        if (bot) {
                            console.log(`🔚 Auto-triggering meeting end for ${meetingId}`);
                            
                            await sendWebhook('meeting.ended', {
                                meetingId,
                                endReason: 'auto-detected',
                                duration: Date.now() - bot.startTime.getTime(),
                                recordingPath: bot.recordingPath,
                                trigger: 'websocket_close'
                            });

                            await bot.stopRecording();
                            await bot.cleanup();
                            activeBots.delete(meetingId);
                            
                            console.log(` Meeting ${meetingId} ended and recording stopped via auto-detection`);
                        }
                    } catch (error) {
                        console.error(` Failed to auto-stop recording for ${meetingId}:`, error.message);
                    }
                }, 3000); // 3 second delay to ensure meeting is fully ended
            }
        });

        botManager.page.on('pageerror', error => {
            console.log(`Page error [${meetingId}]:`, error.message);
            console.log(`Page error stack [${meetingId}]:`, error.stack);
        });

        await botManager.updateStatus('navigating');
        
        console.log(`Navigating to web client: ${parsedUrl.webClientUrl}`);
        
        const response = await botManager.page.goto(parsedUrl.webClientUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        if (response) {
            console.log(`Navigation response: ${response.status()} for ${response.url()}`);
        }

        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
            console.log(`Page loaded successfully`);
        } catch (navError) {
            console.error(`Navigation failed: ${navError.message}`);
        }

                 await botManager.updateStatus('joining');

         // Debug: Check what's on the page
         const pageDebug = await botManager.page.evaluate(() => {
             const inputs = Array.from(document.querySelectorAll('input')).map(input => ({
                 tag: input.tagName,
                 type: input.type,
                 placeholder: input.placeholder,
                 id: input.id,
                 name: input.name,
                 className: input.className
             }));
             
             const buttons = Array.from(document.querySelectorAll('button')).map(button => ({
                 tag: button.tagName,
                 textContent: button.textContent.trim(),
                 id: button.id,
                 className: button.className,
                 ariaLabel: button.getAttribute('aria-label')
             }));
             
             return { inputs, buttons, bodyText: (document.body?.textContent || '').substring(0, 200) };
         });
         
         console.log('Page elements found:', JSON.stringify(pageDebug, null, 2));

         // Fill name field
         const nameSelectors = [
            '#input-for-name',  // CRITICAL: This is the actual selector we need!
             '.webclient-name-input',
             'input[placeholder*="name" i]',
             'input[aria-label*="name" i]',
             '#inputname',
             'input[name="name"]',
             'input[type="text"]',
             'input[id*="name"]',
             'input[class*="name"]',
             '.join-dialog input',
             '[data-testid*="name"] input'
         ];

        let nameEntered = false;
        for (const selector of nameSelectors) {
            try {
                await botManager.page.waitForSelector(selector, { timeout: 2000 });
                await botManager.page.type(selector, `AI Bot ${Math.floor(Math.random() * 1000)}`);
                console.log(`Name entered using selector: ${selector}`);
                nameEntered = true;
                break;
            } catch (error) {
                console.log(`Name selector failed: ${selector}`);
            }
        }

        if (!nameEntered) {
            console.log('No name field found or filled');
        }

        // Fill password field if needed
        console.log(`Using password: ${finalPassword ? 'YES' : 'NO'}`);
        
        if (finalPassword) {
            console.log('Attempting to fill password field');
            const passwordSelectors = [
                '#input-for-pwd',
                '.webclient-password-input',
                'input[type="password"]',
                'input[placeholder*="password" i]',
                '#inputpasscode'
            ];

            let passwordEntered = false;
            for (const selector of passwordSelectors) {
                try {
                    await botManager.page.waitForSelector(selector, { timeout: 2000 });
                    await botManager.page.type(selector, finalPassword);
                    console.log(`Password entered using selector: ${selector}`);
                    passwordEntered = true;
                    break;
                } catch (error) {
                    console.log(`Password selector failed: ${selector}`);
                }
            }
            
            if (!passwordEntered) {
                console.log('No password field found on page despite password being provided');
            }
        } else {
            console.log('No password provided - proceeding without password');
        }

                 // Click join button
         const joinSelectors = [
             '.webclient-join-btn',
             'button[aria-label*="join" i]',
             'button[class*="join"]',
             'a[aria-label*="join" i]',
             '#joinBtn',
             '.join-btn',
             'button[type="submit"]',
             'button[id*="join"]',
             '.join-dialog button',
             '[data-testid*="join"] button',
             'button'
         ];

                 let joinClicked = false;
         
         // First try text-based button finding
         try {
             const textBasedJoin = await botManager.page.evaluate(() => {
                 const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
                 const joinTexts = ['join', 'join meeting', 'join now', 'start', 'enter'];
                 
                 for (const button of buttons) {
                     const text = button.textContent.toLowerCase().trim();
                     if (joinTexts.some(joinText => text.includes(joinText))) {
                         button.click();
                         return { success: true, text, selector: button.tagName };
                     }
                 }
                 return { success: false };
             });
             
             if (textBasedJoin.success) {
                 console.log(`Text-based join clicked: "${textBasedJoin.text}" (${textBasedJoin.selector})`);
                 joinClicked = true;
             }
         } catch (textError) {
             console.log('Text-based join failed:', textError.message);
         }
         
         // If text-based didn't work, try selectors
         if (!joinClicked) {
             for (const selector of joinSelectors) {
                 try {
                     await botManager.page.waitForSelector(selector, { timeout: 3000 });
                     await botManager.page.click(selector);
                     console.log(`Join button clicked: ${selector}`);
                     joinClicked = true;
                     break;
                 } catch (error) {
                     console.log(`Join selector failed: ${selector}`, error.message);
                 }
             }
         }

        if (joinClicked) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log('Checking for post-join prompts...');
            
            // Handle post-join password if needed
            if (finalPassword) {
                const postJoinPasswordSelectors = [
                    '.webclient-password-input',
                    'input[type="password"]',
                    'input[placeholder*="password" i]',
                    'input[aria-label*="password" i]'
                ];

                for (const pwSelector of postJoinPasswordSelectors) {
                    try {
                        await botManager.page.waitForSelector(pwSelector, { timeout: 3000 });
                        await botManager.page.type(pwSelector, finalPassword);
                        console.log(`Post-join password entered using: ${pwSelector}`);
                        
                                                 const submitSelectors = [
                             'button[type="submit"]',
                             'button[class*="join"]',
                             'button[class*="continue"]',
                             'button'
                         ];

                        for (const submitSelector of submitSelectors) {
                            try {
                                await botManager.page.click(submitSelector);
                                console.log(`Password submit button clicked: ${submitSelector}`);
                                break;
                            } catch (submitError) {
                                // Continue to next selector
                            }
                        }
                        break;
                    } catch (pwError) {
                        console.log(`Post-join password selector failed: ${pwSelector}`);
                    }
                }

                console.log('Password entered after join, waiting for meeting to load...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            // Check for waiting room
            const waitingRoomText = await botManager.page.$eval('body', el => el.textContent.toLowerCase()).catch(() => '');
            if (waitingRoomText.includes('waiting room') || waitingRoomText.includes('waiting for the host')) {
                console.log('Waiting room detected, waiting for host admission...');
                await new Promise(resolve => setTimeout(resolve, 30000));
            }

            console.log('Waiting for meeting UI to appear...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Check if we're in the meeting
            const inMeeting = await botManager.page.evaluate(() => {
                const indicators = [
                    '.meeting-client-view',
                    '.webclient-meeting-view',
                    '[data-testid*="meeting"]',
                    '[class*="meeting"]',
                    '[id*="meeting"]',
                    '.zm-video',
                    '.video-container',
                    '[class*="participant"]'
                ];
                
                return indicators.some(selector => {
                    const elements = document.querySelectorAll(selector);
                    return elements.length > 0;
                });
            });

            if (inMeeting) {
                const meetingIndicators = await botManager.page.evaluate(() => {
                    return document.querySelectorAll('[data-testid*="meeting"], [class*="meeting"], [id*="meeting"]');
                });

                console.log('Successfully detected meeting UI');
                
                // CRITICAL: Ensure video is OFF before any recording activity
                console.log(' CRITICAL: Ensuring video is OFF before recording...');
                
                // SMART CHECK: First verify if video is already off
                const videoStatus = await botManager.page.evaluate(() => {
                    // Look for "Start Video" button which means video is currently OFF
                    const startVideoButton = document.querySelector('button[aria-label*="start video" i], button[aria-label*="start my video" i]');
                    const stopVideoButton = document.querySelector('button[aria-label*="stop video" i], button[aria-label*="turn off" i]');
                    
                    const videoIsOff = !!startVideoButton && startVideoButton.textContent.toLowerCase().includes('start');
                    const videoIsOn = !!stopVideoButton;
                    
                    return {
                        videoIsAlreadyOff: videoIsOff,
                        videoIsOn: videoIsOn,
                        startButtonText: startVideoButton ? startVideoButton.textContent.trim() : 'none',
                        stopButtonText: stopVideoButton ? stopVideoButton.textContent.trim() : 'none'
                    };
                });
                
                console.log(' Video status check:', videoStatus);
                
                if (videoStatus.videoIsAlreadyOff) {
                    console.log(' Video is already OFF - skipping video off attempts');
                } else {
                    console.log(' Video appears to be ON - attempting to turn off...');
                    
                    // Only do 2 attempts if video is actually on
                    for (let attempt = 1; attempt <= 2; attempt++) {
                        console.log(` Video off attempt ${attempt}/2...`);
                        const videoResults = await botManager.aggressiveVideoOff();
                        console.log(`Video off results (attempt ${attempt}):`, videoResults);
                        
                        // Check if successful
                        const recheckStatus = await botManager.page.evaluate(() => {
                            const startButton = document.querySelector('button[aria-label*="start video" i], button[aria-label*="start my video" i]');
                            return !!startButton && startButton.textContent.toLowerCase().includes('start');
                        });
                        
                        if (recheckStatus) {
                            console.log(` Video successfully turned OFF after attempt ${attempt}`);
                            break;
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
                
                console.log(' Video control sequence completed');
                
                // AUDIO MUTE: Single targeted attempt
                console.log(' Ensuring bot audio is muted...');
                await botManager.ensureBotIsMutedAndVideoOff();

                // Wait for all changes to take effect
                console.log(' Waiting for controls to stabilize...');
                await new Promise(resolve => setTimeout(resolve, 3000));

                await botManager.updateStatus('joined');
                
                // Wait longer for meeting audio streams to properly initialize
                console.log('⏳ Waiting 15 seconds for meeting audio streams to fully initialize...');
                await new Promise(resolve => setTimeout(resolve, 15000));
                
                // Start recording
                const recordingStarted = await botManager.startRecording();
                if (recordingStarted) {
                    await botManager.updateStatus('recording');
                }

                console.log(`Bot successfully joined meeting ${meetingId}!`);
                
                // WEBHOOK ONLY - No automatic meeting detection
                console.log('Recording will ONLY stop when webhook triggers - ignoring automatic detection');

                await sendWebhook('meeting.joined', {
                    meetingId,
                    recording: recordingStarted,
                    timestamp: new Date().toISOString()
                });
                
                return {
                    success: true,
                    meetingId,
                    recording: recordingStarted,
                    message: 'Bot joined successfully',
                    domain: parsedUrl.domain
                };
            } else {
                console.log(`Join attempt failed - no meeting indicators found`);
                await botManager.cleanup();
                activeBots.delete(meetingId);
                
                return {
                    success: false,
                    meetingId,
                    error: 'Failed to detect meeting UI after join attempt',
                    message: 'Bot failed to join meeting'
                };
            }
        }
    } catch (error) {
        console.error(`Bot joining failed for meeting ${meetingId}:`, error.message);
        
        if (botManager) {
            await botManager.cleanup();
        }
        activeBots.delete(meetingId);
        
        return {
            success: false,
            meetingId,
            error: error.message,
            message: 'Bot failed to join meeting',
            logs: botManager?.logs || []
        };
    }
}

// API endpoints
const protectEndpoint = (req, res, next) => {
    const providedSecret = req.headers['x-api-secret'];
    if (!providedSecret || providedSecret !== API_SECRET_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
};

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        redis: redis.status,
        activeBots: activeBots.size
    });
});

app.get('/health/detailed', async (req, res) => {
    try {
        const memUsage = process.memoryUsage();
        const memMB = Math.round(memUsage.rss / 1024 / 1024);
        const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            redis: redis.status,
            performance: {
                activeBots: activeBots.size,
                maxConcurrentBots: MAX_CONCURRENT_BOTS,
                concurrencyUsage: `${Math.round(activeBots.size / MAX_CONCURRENT_BOTS * 100)}%`,
                browserPool: {
                    available: browserPool.available.length,
                    inUse: browserPool.inUse.size,
                    total: browserPool.browsers.size,
                    maxBrowsers: MAX_BROWSER_INSTANCES,
                    efficiency: `${Math.round((browserPool.inUse.size + browserPool.available.length) / activeBots.size * 100) || 0}%`
                }
            },
            memory: {
                rss: memMB,
                heapUsed: heapMB,
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                limit: MEMORY_LIMIT_MB,
                usage: `${Math.round(memMB / MEMORY_LIMIT_MB * 100)}%`,
                pressure: memMB > MEMORY_LIMIT_MB * 0.8
            },
            resources: {
                canCreateBot: resourceMonitor.canCreateNewBot().allowed,
                memoryPressure: memMB > MEMORY_LIMIT_MB * 0.8,
                cpuUsage: process.cpuUsage()
            },
            uptime: process.uptime()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            error: error.message 
        });
    }
});

// PRIMARY METHOD: Automatic bot joining when meeting starts (via webhook)
app.post('/auto-join-meeting', protectEndpoint, async (req, res) => {
    try {
        const { meetingId, hostId, userId, password, topic } = req.body;
        
        if (!meetingId) {
            return res.status(400).json({ error: 'meetingId is required' });
        }

        if (!hostId) {
            return res.status(400).json({ error: 'hostId is required for auto-join' });
        }

        console.log(`AUTO-JOIN: Meeting ${meetingId} started by host ${hostId}`);
        console.log(`FULL REQUEST BODY:`, JSON.stringify(req.body, null, 2));
        console.log(`Meeting details:`, { meetingId, hostId, userId: userId || 'MISSING', topic: topic || 'Unknown', password: password ? 'PROVIDED' : 'NONE' });
        console.log(`USER ID DEBUG: received="${userId}", type=${typeof userId}, isObjectId=${typeof userId === 'string' && userId.length === 24}`);
        
        // Check if bot is already active for this meeting
        if (activeBots.has(meetingId)) {
            console.log(` Bot already active for meeting ${meetingId}`);
            return res.json({
                success: true,
                message: 'Bot already active for this meeting',
                meetingId,
                status: 'already_active'
            });
        }

        // Auto-join the meeting using proper userId for database operations
        const finalUserId = userId || hostId;
        console.log(`USERID SELECTION: userId="${userId}", hostId="${hostId}", selected="${finalUserId}"`);
        const result = await joinMeeting(meetingId, password || '', finalUserId);
        
        if (result.success) {
            console.log('AUTO-JOIN successful:', result);
            res.status(202).json({
                success: true,
                message: 'Bot auto-joined meeting successfully',
                method: 'automatic_webhook',
                performance: {
                    activeBots: activeBots.size,
                    maxConcurrentBots: MAX_CONCURRENT_BOTS
                },
                ...result
            });
        } else {
            console.error('AUTO-JOIN failed:', result.error);
            
            // Determine appropriate status code based on error type
            let statusCode = 500;
            if (result.error.includes('limit reached') || result.error.includes('Memory limit')) {
                statusCode = 503; // Service Unavailable
            } else if (result.error.includes('already exists')) {
                statusCode = 409; // Conflict
            }
            
            res.status(statusCode).json({
                success: false,
                error: result.error,
                message: 'Failed to auto-join meeting',
                method: 'automatic_webhook',
                performance: {
                    activeBots: activeBots.size,
                    maxConcurrentBots: MAX_CONCURRENT_BOTS,
                    resourceLimited: statusCode === 503
                }
            });
        }
    } catch (error) {
        console.error('Auto-join error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            method: 'automatic_webhook'
        });
    }
});


// SECONDARY METHOD: Manual bot launching (backup/optional)
app.post('/launch-bot', protectEndpoint, async (req, res) => {
    try {
        const { meetingId, password, userId } = req.body;
        
        if (!meetingId) {
            return res.status(400).json({ error: 'meetingId is required' });
        }

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        console.log(` MANUAL-JOIN: User ${userId} manually launching bot for meeting ${meetingId}`);
        console.log(` Request details:`, JSON.stringify(req.body, null, 2));
        
        // Check if bot is already active
        if (activeBots.has(meetingId)) {
            console.log(` Bot already active for meeting ${meetingId}`);
            return res.json({
                success: true,
                message: 'Bot already active for this meeting',
                meetingId,
                status: 'already_active'
            });
        }

        const result = await joinMeeting(meetingId, password, userId);
        
                 if (result.success) {
            console.log('MANUAL-JOIN successful:', result);
             res.status(202).json({
                 success: true,
                 message: 'Bot launched successfully',
                method: 'manual_invitation',
                 ...result
             });
         } else {
            console.error('MANUAL-JOIN failed:', result.error);
             res.status(500).json({
                 success: false,
                 error: result.error,
                message: 'Failed to launch bot',
                method: 'manual_invitation'
             });
         }
    } catch (error) {
        console.error('Manual bot launch error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            method: 'manual_invitation'
        });
    }
});

app.get('/status/:meetingId', async (req, res) => {
    try {
        const { meetingId } = req.params;
        const bot = activeBots.get(meetingId);
        
        if (!bot) {
            return res.status(404).json({ 
                error: 'Bot not found',
                meetingId 
            });
        }

        res.json({
            success: true,
            meetingId,
            status: bot.status,
            startTime: bot.startTime,
            lastUpdate: bot.lastUpdate,
            error: bot.error,
            logs: bot.logs.slice(-10)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/bots', async (req, res) => {
    try {
        const botList = Array.from(activeBots.entries()).map(([meetingId, bot]) => ({
            meetingId,
            status: bot.status,
            startTime: bot.startTime,
            lastUpdate: bot.lastUpdate,
            recordingPath: bot.recordingPath,
            uptime: Date.now() - bot.startTime.getTime()
        }));

        res.json({
            success: true,
            activeBots: botList.length,
            bots: botList
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Webhook endpoints for external meeting control
app.post('/webhook/meeting-ended', async (req, res) => {
    try {
        const { meetingId, reason = 'webhook' } = req.body;
        
        if (!meetingId) {
            return res.status(400).json({ error: 'meetingId is required' });
        }

        console.log(`Webhook: Meeting ${meetingId} ended (${reason})`);
        
        const bot = activeBots.get(meetingId);
        if (bot) {
            console.log(`Found active bot for meeting ${meetingId}, stopping recording...`);
            
            await sendWebhook('meeting.ended', {
                meetingId,
                endReason: reason,
                duration: Date.now() - bot.startTime.getTime(),
                recordingPath: bot.recordingPath
            });

            await bot.stopRecording();
            await bot.cleanup();
            activeBots.delete(meetingId);
            
            res.json({ 
                success: true, 
                message: `Bot stopped for meeting ${meetingId}`,
                recordingStopped: true
            });
        } else {
            res.json({ 
                success: false, 
                message: `No active bot found for meeting ${meetingId}`,
                recordingStopped: false
            });
        }
        
        // Also publish to Redis for other workers
        if (redis.publisher) {
            await redis.publisher.publish('meeting_ended', JSON.stringify({ meetingId, reason }));
        }
    } catch (error) {
        console.error('Webhook meeting-ended error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/webhook/bot-command', async (req, res) => {
    try {
        const { meetingId, command } = req.body;
        
        if (!meetingId || !command) {
            return res.status(400).json({ error: 'meetingId and command are required' });
        }

        console.log(`Webhook: Bot command ${command} for meeting ${meetingId}`);
        
        // Handle stop command immediately to prevent synthetic audio
        if (command.toLowerCase() === 'stop') {
            const bot = activeBots.get(meetingId);
            if (bot) {
                bot.signalStop('Webhook stop command');
            }
        }
        
        // Publish to Redis for processing
        if (redis.publisher) {
            await redis.publisher.publish('bot_commands', JSON.stringify({ meetingId, command }));
        }
        
        res.json({ success: true, message: `Command ${command} sent to meeting ${meetingId}` });
    } catch (error) {
        console.error('Webhook bot-command error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Manual stop bot endpoint for immediate termination
app.post('/stop-bot/:meetingId', protectEndpoint, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { reason = 'Manual stop request' } = req.body;
        
        console.log(`Manual stop bot requested for meeting ${meetingId}, reason: ${reason}`);
        
        const bot = activeBots.get(meetingId);
        if (!bot) {
            return res.status(404).json({ 
                success: false,
                error: 'Bot not found or not active',
                meetingId 
            });
        }

        // Signal immediate stop to prevent synthetic audio generation
        bot.signalStop(reason);
        
        // Give a moment for stop signal to propagate
        setTimeout(async () => {
            try {
                if (bot.status === 'recording') {
                    await bot.stopRecording();
                }
                await bot.cleanup();
                activeBots.delete(meetingId);
                console.log(`Bot ${meetingId} successfully stopped and cleaned up`);
            } catch (stopError) {
                console.log(`Error during delayed bot cleanup: ${stopError.message}`);
            }
        }, 1000);

        res.json({
            success: true,
            message: `Bot stop signal sent for meeting ${meetingId}`,
            meetingId,
            reason,
            stoppedAt: new Date().toISOString(),
            note: 'Bot will stop synthetic audio immediately and cleanup in 1 second'
        });
    } catch (error) {
        console.error('Manual stop bot error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await gracefulShutdown();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await gracefulShutdown();
    process.exit(0);
});

async function gracefulShutdown() {
    try {
        console.log('Starting graceful shutdown...');
        
        // Stop accepting new requests
        console.log('Cleaning up active bots...');
        for (const [meetingId, bot] of activeBots.entries()) {
            try {
                await bot.cleanup();
                activeBots.delete(meetingId);
            } catch (error) {
                console.log(`Error cleaning up bot ${meetingId}:`, error.message);
            }
        }
        
        // Clean up browser pool
        console.log('Cleaning up browser pool...');
        await browserPool.cleanup();
        
        // Close Redis connections
        console.log('Closing Redis connections...');
        await redis.close();
        
        console.log('Graceful shutdown completed');
    } catch (error) {
        console.error('Error during graceful shutdown:', error.message);
    }
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(` High-Performance Zoom Bot Worker listening on port ${PORT}`);
    console.log(` Performance Limits: ${MAX_CONCURRENT_BOTS} bots, ${MAX_BROWSER_INSTANCES} browsers, ${MEMORY_LIMIT_MB}MB memory`);
    console.log(` Redis cluster status: ${redis.status}`);
    console.log(` Recordings directory: ${RECORDINGS_DIR}`);
    console.log(` Performance monitoring: Active`);
    console.log(` Bot Joining Methods:`);
    console.log(`    PRIMARY: /auto-join-meeting (webhook-triggered)`);
    console.log(`    SECONDARY: /launch-bot (manual invitation)`);
    console.log(`    MANUAL STOP: /stop-bot/:meetingId (immediate termination)`);
    console.log(`Webhook endpoints: /webhook/meeting-ended, /webhook/bot-command`);
    
    if (redis.status === 'connected') {
        console.log(` Redis features: Caching, Pub/Sub, Metrics`);
    } else {
        console.log(`Redis status: Using memory fallback`);
    }
    
    console.log(`System ready for high-efficiency multi-user meeting processing`);
}); 