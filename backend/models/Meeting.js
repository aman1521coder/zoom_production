import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  meetingId: {
    type: String,
    required: true,
    index: true
  },
  topic: String,
  password: String,
  status: {
    type: String,
    enum: ['active', 'recording', 'processing', 'completed', 'failed'],
    default: 'active'
  },
  recordingMethod: {
    type: String,
    enum: ['vps_bot', 'cloud', 'local', 'none'],
    default: 'vps_bot'
  },
  recordingPath: String,
  transcriptPath: String,
  transcriptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transcript'
  },
  duration: Number,
  participantCount: Number,
  startTime: Date,
  endTime: Date,
  recordingStartTime: Date,
  recordingEndTime: Date,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

meetingSchema.index({ meetingId: 1, userId: 1 });
meetingSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model('Meeting', meetingSchema); 