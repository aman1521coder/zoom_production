import express from 'express';
import multer from 'multer';
import path from 'path';
import RecordingManager from '../services/RecordingManager.js';
import TranscriptProcessor from '../services/TranscriptProcessor.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'recordings/');
  },
  filename: (req, file, cb) => {
    const meetingId = req.params.meetingId;
    const timestamp = Date.now();
    cb(null, `recording_${timestamp}_${meetingId}.webm`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || 
        file.mimetype.startsWith('video/') ||
        file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Audio or video files only'));
    }
  }
});

// Worker authentication middleware for VPS uploads
const authenticateWorker = (req, res, next) => {
  console.log('Auth middleware - Headers:', {
    'x-worker-secret': req.headers['x-worker-secret'] ? 'PRESENT' : 'MISSING',
    'authorization': req.headers['authorization'] ? 'PRESENT' : 'MISSING',
    'content-type': req.headers['content-type']
  });
  
  const workerSecret = req.headers['x-worker-secret'];
  const expectedSecret = process.env.VPS_SECRET;
  
  console.log('Auth check:', {
    workerSecretProvided: !!workerSecret,
    expectedSecretConfigured: !!expectedSecret,
    secretsMatch: workerSecret === expectedSecret,
    workerSecretValue: workerSecret,
    expectedSecretValue: expectedSecret
  });
  
  if (workerSecret && workerSecret === expectedSecret) {
    console.log('Worker authentication successful via x-worker-secret');
    return next();
  }
  
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    console.log('Worker authentication failed - no valid secret or token');
    return res.status(401).json({ 
      error: 'Authentication required',
      details: 'Missing x-worker-secret or Authorization header'
    });
  }
  
  console.log('Worker authentication passed via Authorization token');
  next();
};

router.post('/upload/:meetingId', authenticateWorker, upload.single('recording'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { meetingId } = req.params;
    const { botId, duration } = req.body;

    const uploadResult = await RecordingManager.handleUpload(meetingId, req.file);
    
    if (uploadResult.success) {
      const transcriptResult = await TranscriptProcessor.processRecording(
        meetingId,
        uploadResult.recordingPath,
        uploadResult.meeting.userId
      );

      if (transcriptResult.success) {
        res.json({
          success: true,
          meetingId,
          recording: uploadResult.recordingPath,
          transcript: transcriptResult.transcriptId,
          message: 'Recording uploaded and transcribed'
        });
      } else {
        res.json({
          success: true,
          meetingId,
          recording: uploadResult.recordingPath,
          message: 'Recording uploaded, transcription pending'
        });
      }
    } else {
      res.status(500).json({ error: uploadResult.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/start/:meetingId', authenticate, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { userId, method = 'vps_bot' } = req.body;

    const result = await RecordingManager.startRecording(meetingId, userId, method);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/stop/:meetingId', authenticate, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await RecordingManager.stopRecording(meetingId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save transcript from VPS worker
router.post('/transcripts/save', authenticateWorker, async (req, res) => {
  try {
    console.log('Transcript save endpoint hit');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Environment VPS_SECRET:', process.env.VPS_SECRET ? 'SET' : 'NOT SET');
    
    const { meetingId, userId, fullText, audioDuration, audioSize, wordCount, processingTime } = req.body;
    
    console.log('Extracted fields:', { 
      meetingId: !!meetingId, 
      userId: !!userId, 
      fullText: !!fullText,
      userIdValue: userId,
      userIdType: typeof userId
    });
    
    if (!meetingId || !fullText || !userId) {
      console.log('Missing required fields:', { 
        meetingId: !!meetingId, 
        userId: !!userId, 
        fullText: !!fullText 
      });
      return res.status(400).json({ 
        error: 'meetingId, userId, and fullText are required' 
      });
    }

    // Import models dynamically
    const Transcript = (await import('../models/Transcript.js')).default;
    const Meeting = (await import('../models/Meeting.js')).default;
    const mongoose = (await import('mongoose')).default;

    // Convert userId to ObjectId if it's a string
    let userObjectId;
    try {
      userObjectId = mongoose.Types.ObjectId.isValid(userId) 
        ? new mongoose.Types.ObjectId(userId) 
        : userId;
      console.log('userId conversion:', { 
        original: userId, 
        converted: userObjectId, 
        isValid: mongoose.Types.ObjectId.isValid(userObjectId) 
      });
    } catch (error) {
      console.error('Invalid userId format:', userId);
      return res.status(400).json({ 
        error: 'Invalid userId format. Must be a valid ObjectId.' 
      });
    }

    // Create transcript record (userId is now required)
    const transcriptData = {
      meetingId,
      userId: userObjectId,
      fullText,
      audioDuration: audioDuration || 0,
      audioSize: audioSize || 0,
      wordCount: wordCount || fullText.split(' ').length,
      processingTime: processingTime || 0,
      status: 'completed',
      segments: fullText.split('\n').filter(s => s.trim()).map((text, index) => ({
        start: index * 30, // Rough estimation
        end: (index + 1) * 30,
        text: text.trim()
      }))
    };
    
    console.log('Creating transcript with data:', JSON.stringify(transcriptData, null, 2));
    const transcript = new Transcript(transcriptData);

    const saved = await transcript.save();
    console.log('Transcript saved to database with ID:', saved._id);
    
    // Update meeting status
    await Meeting.updateOne(
      { meetingId },
      {
        status: 'completed',
        transcriptId: saved._id,
        transcriptPath: `transcript_${saved._id}.txt`
      }
    );

    console.log('Transcript saved successfully for meetingId:', meetingId);
    console.log('Response being sent:', {
      success: true,
      transcriptId: saved._id,
      message: 'Transcript saved successfully'
    });

    res.json({
      success: true,
      transcriptId: saved._id,
      message: 'Transcript saved successfully'
    });
  } catch (error) {
    console.error('Error saving transcript:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/transcript/:meetingId', authenticateWorker, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await TranscriptProcessor.getTranscript(meetingId);
    
    if (result.success) {
      res.json({
        success: true,
        transcript: result.transcript,
        meetingId
      });
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all recordings for authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    const Meeting = (await import('../models/Meeting.js')).default;
    
    const recordings = await Meeting.find({ 
      userId: req.user._id,
      status: { $in: ['completed', 'recording', 'transcribed'] }
    })
    .select('meetingId status recordingMethod startTime endTime recordingPath')
    .sort({ startTime: -1 })
    .limit(50);

    res.json({
      success: true,
      recordings,
      count: recordings.length
    });
  } catch (error) {
    console.error('Get recordings error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch recordings' 
    });
  }
});

export default router; 