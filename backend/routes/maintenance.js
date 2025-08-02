import express from 'express';
import Meeting from '../models/Meeting.js';
import Transcript from '../models/Transcript.js';
import User from '../models/User.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Admin middleware - simple secret check
const adminAuth = (req, res, next) => {
    const adminSecret = req.headers['x-admin-secret'] || req.query.admin_secret;
    const expectedSecret = process.env.ADMIN_SECRET || 'admin123';
    
    if (!adminSecret || adminSecret !== expectedSecret) {
        return res.status(403).json({ 
            error: 'Admin access required',
            hint: 'Provide x-admin-secret header or admin_secret query parameter'
        });
    }
    next();
};

// Get stuck recordings report
router.get('/stuck-recordings', adminAuth, async (req, res) => {
    try {
        const now = new Date();
        const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Find meetings stuck in recording status (>30 minutes)
        const stuckRecording = await Meeting.find({
            status: 'recording',
            updatedAt: { $lt: thirtyMinutesAgo }
        }).populate('userId', 'email').sort({ updatedAt: -1 });

        // Find meetings stuck in processing status (>2 hours)
        const stuckProcessing = await Meeting.find({
            status: 'processing',
            updatedAt: { $lt: twoHoursAgo }
        }).populate('userId', 'email').sort({ updatedAt: -1 });

        // Find very old active meetings (>1 day)
        const stuckActive = await Meeting.find({
            status: 'active',
            updatedAt: { $lt: oneDayAgo }
        }).populate('userId', 'email').sort({ updatedAt: -1 });

        // Find stuck transcripts
        const stuckTranscripts = await Transcript.find({
            status: 'processing',
            updatedAt: { $lt: twoHoursAgo }
        }).populate('userId', 'email').sort({ updatedAt: -1 });

        const report = {
            summary: {
                stuckRecording: stuckRecording.length,
                stuckProcessing: stuckProcessing.length,
                stuckActive: stuckActive.length,
                stuckTranscripts: stuckTranscripts.length,
                total: stuckRecording.length + stuckProcessing.length + stuckActive.length
            },
            details: {
                stuckRecording: stuckRecording.map(meeting => ({
                    meetingId: meeting.meetingId,
                    userEmail: meeting.userId?.email,
                    topic: meeting.topic,
                    status: meeting.status,
                    stuckSince: meeting.updatedAt,
                    duration: `${Math.round((now - meeting.updatedAt) / (1000 * 60))} minutes`,
                    recordingMethod: meeting.recordingMethod
                })),
                stuckProcessing: stuckProcessing.map(meeting => ({
                    meetingId: meeting.meetingId,
                    userEmail: meeting.userId?.email,
                    topic: meeting.topic,
                    status: meeting.status,
                    stuckSince: meeting.updatedAt,
                    duration: `${Math.round((now - meeting.updatedAt) / (1000 * 60))} minutes`,
                    recordingPath: meeting.recordingPath
                })),
                stuckActive: stuckActive.map(meeting => ({
                    meetingId: meeting.meetingId,
                    userEmail: meeting.userId?.email,
                    topic: meeting.topic,
                    status: meeting.status,
                    stuckSince: meeting.updatedAt,
                    duration: `${Math.round((now - meeting.updatedAt) / (1000 * 60 * 60))} hours`
                })),
                stuckTranscripts: stuckTranscripts.map(transcript => ({
                    meetingId: transcript.meetingId,
                    userEmail: transcript.userId?.email,
                    status: transcript.status,
                    stuckSince: transcript.updatedAt,
                    duration: `${Math.round((now - transcript.updatedAt) / (1000 * 60))} minutes`
                }))
            }
        };

        res.json(report);
    } catch (error) {
        console.error('Error getting stuck recordings report:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clean up stuck recordings
router.post('/cleanup-stuck-recordings', adminAuth, async (req, res) => {
    try {
        const { 
            cleanRecording = true, 
            cleanProcessing = true, 
            cleanActive = true,
            cleanTranscripts = true,
            dryRun = false 
        } = req.body;

        const now = new Date();
        const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        let cleanedMeetings = 0;
        let cleanedTranscripts = 0;
        const cleanupResults = [];

        // Clean stuck recording meetings
        if (cleanRecording) {
            const stuckRecording = await Meeting.find({
                status: 'recording',
                updatedAt: { $lt: thirtyMinutesAgo }
            });

            for (const meeting of stuckRecording) {
                if (!dryRun) {
                    await Meeting.updateOne(
                        { _id: meeting._id },
                        { 
                            status: 'failed',
                            metadata: {
                                ...meeting.metadata,
                                cleanedUp: true,
                                cleanupReason: 'Stuck in recording status',
                                cleanupTime: now
                            }
                        }
                    );
                }
                cleanedMeetings++;
                cleanupResults.push({
                    meetingId: meeting.meetingId,
                    action: 'recording → failed',
                    reason: 'Stuck in recording status for >30 minutes'
                });
            }
        }

        // Clean stuck processing meetings
        if (cleanProcessing) {
            const stuckProcessing = await Meeting.find({
                status: 'processing',
                updatedAt: { $lt: twoHoursAgo }
            });

            for (const meeting of stuckProcessing) {
                if (!dryRun) {
                    await Meeting.updateOne(
                        { _id: meeting._id },
                        { 
                            status: 'failed',
                            metadata: {
                                ...meeting.metadata,
                                cleanedUp: true,
                                cleanupReason: 'Stuck in processing status',
                                cleanupTime: now
                            }
                        }
                    );
                }
                cleanedMeetings++;
                cleanupResults.push({
                    meetingId: meeting.meetingId,
                    action: 'processing → failed',
                    reason: 'Stuck in processing status for >2 hours'
                });
            }
        }

        // Clean very old active meetings
        if (cleanActive) {
            const stuckActive = await Meeting.find({
                status: 'active',
                updatedAt: { $lt: oneDayAgo }
            });

            for (const meeting of stuckActive) {
                if (!dryRun) {
                    await Meeting.updateOne(
                        { _id: meeting._id },
                        { 
                            status: 'failed',
                            endTime: now,
                            metadata: {
                                ...meeting.metadata,
                                cleanedUp: true,
                                cleanupReason: 'Stuck in active status',
                                cleanupTime: now
                            }
                        }
                    );
                }
                cleanedMeetings++;
                cleanupResults.push({
                    meetingId: meeting.meetingId,
                    action: 'active → failed',
                    reason: 'Stuck in active status for >24 hours'
                });
            }
        }

        // Clean stuck transcripts
        if (cleanTranscripts) {
            const stuckTranscripts = await Transcript.find({
                status: 'processing',
                updatedAt: { $lt: twoHoursAgo }
            });

            for (const transcript of stuckTranscripts) {
                if (!dryRun) {
                    await Transcript.updateOne(
                        { _id: transcript._id },
                        { status: 'failed' }
                    );
                }
                cleanedTranscripts++;
                cleanupResults.push({
                    meetingId: transcript.meetingId,
                    action: 'transcript processing → failed',
                    reason: 'Stuck in processing status for >2 hours'
                });
            }
        }

        res.json({
            success: true,
            dryRun,
            summary: {
                cleanedMeetings,
                cleanedTranscripts,
                totalCleaned: cleanedMeetings + cleanedTranscripts
            },
            cleanupResults,
            message: dryRun 
                ? `Dry run: Would clean ${cleanedMeetings + cleanedTranscripts} items`
                : `Cleaned ${cleanedMeetings + cleanedTranscripts} items`
        });

    } catch (error) {
        console.error('Error cleaning stuck recordings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get database statistics
router.get('/database-stats', adminAuth, async (req, res) => {
    try {
        const meetingStats = await Meeting.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    oldestRecord: { $min: '$updatedAt' },
                    newestRecord: { $max: '$updatedAt' }
                }
            }
        ]);

        const transcriptStats = await Transcript.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalWords: { $sum: '$wordCount' },
                    avgProcessingTime: { $avg: '$processingTime' }
                }
            }
        ]);

        // Get total counts
        const totalMeetings = await Meeting.countDocuments();
        const totalTranscripts = await Transcript.countDocuments();

        // Get recent activity (last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentMeetings = await Meeting.countDocuments({ 
            createdAt: { $gte: oneDayAgo } 
        });
        const recentTranscripts = await Transcript.countDocuments({ 
            createdAt: { $gte: oneDayAgo } 
        });

        res.json({
            summary: {
                totalMeetings,
                totalTranscripts,
                recentMeetings,
                recentTranscripts
            },
            meetingStatusBreakdown: meetingStats,
            transcriptStatusBreakdown: transcriptStats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error getting database stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// Force complete old meetings
router.post('/force-complete-meetings', adminAuth, async (req, res) => {
    try {
        const { meetingIds, dryRun = false } = req.body;
        
        if (!meetingIds || !Array.isArray(meetingIds)) {
            return res.status(400).json({ 
                error: 'meetingIds array is required' 
            });
        }

        const results = [];
        
        for (const meetingId of meetingIds) {
            const meeting = await Meeting.findOne({ meetingId });
            
            if (!meeting) {
                results.push({
                    meetingId,
                    success: false,
                    error: 'Meeting not found'
                });
                continue;
            }

            if (!dryRun) {
                await Meeting.updateOne(
                    { meetingId },
                    { 
                        status: 'completed',
                        endTime: new Date(),
                        metadata: {
                            ...meeting.metadata,
                            forceCompleted: true,
                            forceCompletedTime: new Date()
                        }
                    }
                );
            }

            results.push({
                meetingId,
                success: true,
                previousStatus: meeting.status,
                action: dryRun ? 'would complete' : 'completed'
            });
        }

        res.json({
            success: true,
            dryRun,
            processed: results.length,
            results
        });

    } catch (error) {
        console.error('Error force completing meetings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get MongoDB userId by Zoom hostId (for worker transcript saving)
router.get('/get-user-by-zoom-id/:zoomId', adminAuth, async (req, res) => {
    try {
        const { zoomId } = req.params;
        
        if (!zoomId) {
            return res.status(400).json({ 
                error: 'zoomId parameter is required' 
            });
        }

        const user = await User.findOne({ zoomId });
        
        if (!user) {
            return res.status(404).json({ 
                error: 'User not found',
                zoomId 
            });
        }

        res.json({
            success: true,
            zoomId,
            userId: user._id.toString(),
            userEmail: user.email
        });

    } catch (error) {
        console.error('Error looking up user by Zoom ID:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router; 