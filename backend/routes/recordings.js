import express from 'express';
import multer from 'multer';
import path from 'path';
import RecordingManager from '../services/RecordingManager.js';
import TranscriptProcessor from '../services/TranscriptProcessor.js';

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
        file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Audio files only'));
    }
  }
});

router.post('/upload/:meetingId', upload.single('recording'), async (req, res) => {
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

router.post('/start/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { userId, method = 'vps_bot' } = req.body;

    const result = await RecordingManager.startRecording(meetingId, userId, method);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/stop/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await RecordingManager.stopRecording(meetingId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router; 