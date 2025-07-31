import express from 'express';
import Transcript from '../models/Transcript.js';

const router = express.Router();

// Get all transcripts for authenticated user
router.get('/', async (req, res) => {
  try {
    const transcripts = await Transcript.find({ 
      userId: req.user._id 
    })
    .select('meetingId fullText status audioDuration wordCount createdAt')
    .sort({ createdAt: -1 })
    .limit(50);

    res.json({
      success: true,
      transcripts,
      count: transcripts.length
    });
  } catch (error) {
    console.error('Get transcripts error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch transcripts' 
    });
  }
});

// Search transcripts (must be before /:meetingId route)
router.get('/search', async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const transcripts = await Transcript.find({
      userId: req.user._id,
      $or: [
        { fullText: { $regex: query, $options: 'i' } },
        { summary: { $regex: query, $options: 'i' } }
      ]
    })
    .select('meetingId fullText status audioDuration wordCount createdAt')
    .sort({ createdAt: -1 })
    .limit(20);

    res.json({
      success: true,
      transcripts,
      query,
      count: transcripts.length
    });
  } catch (error) {
    console.error('Search transcripts error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search transcripts' 
    });
  }
});

// Get specific transcript by meeting ID
router.get('/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    const transcript = await Transcript.findOne({ 
      meetingId,
      userId: req.user._id 
    });

    if (!transcript) {
      return res.status(404).json({
        success: false,
        error: 'Transcript not found'
      });
    }

    res.json({
      success: true,
      transcript
    });
  } catch (error) {
    console.error('Get transcript error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch transcript' 
    });
  }
});
// Delete transcript by ID (with security check)
router.delete('/:transcriptId', async (req, res) => {
  try {
    const { transcriptId } = req.params;
    
    // Find transcript and verify ownership
    const transcript = await Transcript.findOne({
      _id: transcriptId,
      userId: req.user._id  // Security: ensure user owns this transcript
    });

    if (!transcript) {
      return res.status(404).json({
        success: false,
        error: 'Transcript not found or access denied'
      });
    }

    // Delete the transcript
    await Transcript.findByIdAndDelete(transcriptId);
    
    console.log(`Transcript ${transcriptId} deleted by user ${req.user._id}`);
    
    res.json({
      success: true,
      message: 'Transcript deleted successfully'
    });
  } catch (error) {
    console.error('Delete transcript error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete transcript'
    });
  }
});
export default router; 