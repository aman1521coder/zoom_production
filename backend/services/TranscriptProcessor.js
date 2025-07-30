import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import Transcript from '../models/Transcript.js';
import Meeting from '../models/Meeting.js';

class TranscriptProcessor {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiUrl = 'https://api.openai.com/v1/audio/transcriptions';
  }

  async processRecording(meetingId, audioPath, userId) {
    try {
      if (!fs.existsSync(audioPath)) {
        throw new Error('Audio file not found');
      }

      const stats = fs.statSync(audioPath);
      const startTime = Date.now();

      const transcriptionResult = await this.transcribeAudio(audioPath);
      if (!transcriptionResult.success) {
        throw new Error(transcriptionResult.error);
      }

      const processingTime = (Date.now() - startTime) / 1000;
      const transcript = new Transcript({
        meetingId,
        userId,
        fullText: transcriptionResult.text,
        audioPath,
        audioSize: stats.size,
        audioDuration: transcriptionResult.duration || 0,
        wordCount: transcriptionResult.text.split(' ').length,
        processingTime,
        status: 'completed',
        segments: this.createSegments(transcriptionResult.text)
      });

      const saved = await transcript.save();
      
      await Meeting.updateOne(
        { meetingId },
        {
          status: 'completed',
          transcriptId: saved._id,
          transcriptPath: `transcript_${saved._id}.txt`
        }
      );

      this.saveTranscriptFile(saved._id, transcriptionResult.text);

      return {
        success: true,
        transcriptId: saved._id,
        text: transcriptionResult.text,
        wordCount: transcript.wordCount,
        processingTime
      };
    } catch (error) {
      await this.markFailed(meetingId, error.message);
      return { success: false, error: error.message };
    }
  }

  async transcribeAudio(audioPath) {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioPath));
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      const response = await fetch(this.openaiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
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
        duration: result.duration
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  createSegments(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    let currentTime = 0;
    const wordsPerSecond = 2.5;

    return sentences.map(sentence => {
      const wordCount = sentence.trim().split(' ').length;
      const duration = wordCount / wordsPerSecond;
      
      const segment = {
        timestamp: currentTime,
        text: sentence.trim(),
        confidence: 0.85
      };
      
      currentTime += duration + 0.5;
      return segment;
    });
  }

  async saveTranscriptFile(transcriptId, text) {
    try {
      const fs = await import('fs');
      const transcriptsDir = 'transcripts';
      if (!fs.existsSync(transcriptsDir)) {
        fs.mkdirSync(transcriptsDir, { recursive: true });
      }
      
      const filePath = `transcripts/transcript_${transcriptId}.txt`;
      fs.writeFileSync(filePath, text);
    } catch (error) {
      console.error('Failed to save transcript file:', error.message);
    }
  }

  async markFailed(meetingId, errorMessage) {
    try {
      await Meeting.updateOne(
        { meetingId },
        { status: 'failed', error: errorMessage }
      );
    } catch (error) {
      console.error('Failed to mark meeting as failed:', error.message);
    }
  }

  async getTranscript(meetingId, userId) {
    try {
      const transcript = await Transcript.findOne({
        meetingId,
        userId
      }).populate('userId', 'email firstName lastName');

      if (!transcript) {
        return { success: false, error: 'Transcript not found' };
      }

      return { success: true, transcript };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async searchTranscripts(userId, query, limit = 10) {
    try {
      const searchResults = await Transcript.find({
        userId,
        $text: { $search: query }
      }, {
        score: { $meta: 'textScore' }
      })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .select('meetingId fullText summary createdAt');

      return { success: true, results: searchResults };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new TranscriptProcessor(); 