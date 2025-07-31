import mongoose from 'mongoose';

const segmentSchema = new mongoose.Schema({
  timestamp: Number,
  text: String,
  speaker: {
    type: String,
    default: 'Speaker'
  },
  confidence: {
    type: Number,
    default: 0.8
  }
});

const transcriptSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fullText: String,
  segments: [segmentSchema],
  language: {
    type: String,
    default: 'en'  // Use 'en' instead of 'en-US' for MongoDB text index compatibility
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  audioPath: String,
  audioSize: Number,
  audioDuration: Number,
  wordCount: Number,
  processingTime: Number,
  qualityScore: {
    type: Number,
    default: 0.8
  },
  summary: String,
  keyTopics: [String],
  actionItems: [String]
}, {
  timestamps: true
});

transcriptSchema.index({ meetingId: 1, userId: 1 });
transcriptSchema.index({ fullText: 'text', summary: 'text' });

export default mongoose.model('Transcript', transcriptSchema); 