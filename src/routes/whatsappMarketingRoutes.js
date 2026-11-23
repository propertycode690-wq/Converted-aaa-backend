const express = require('express');
const router = express.Router();
const controller = require('../controllers/whatsappMarketingController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Check connection status & overview (Authenticated)
router.get('/status', authMiddleware, controller.getConnectionStatus);
router.get('/stats', authMiddleware, controller.getOverviewStats);
router.get('/audience-preview', authMiddleware, controller.getAudiencePreview);

// Campaigns
router.get('/campaigns', authMiddleware, controller.getCampaigns);
router.post('/campaigns', authMiddleware, controller.createCampaign);

// Templates & Meta Sync
router.get('/templates', authMiddleware, controller.getTemplates);

// Drip Automation & Sequences
router.get('/drips', authMiddleware, controller.getDrips);
router.post('/drips', authMiddleware, controller.saveDrip);
router.patch('/drips/:id/status', authMiddleware, controller.toggleDripStatus);

// Unified Inbox & AI Live Chat
router.get('/conversations', authMiddleware, controller.getConversations);
router.post('/conversations/send', authMiddleware, controller.sendMessage);
router.post('/conversations/ai-suggest', authMiddleware, controller.getAiSuggestedReply);

module.exports = router;

