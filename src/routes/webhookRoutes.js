const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Meta / WhatsApp / Instagram
router.get('/meta', webhookController.verifyMetaWebhook);
router.post('/meta', webhookController.verifyMetaSignature, webhookController.handleMetaWebhook);

// Twilio WhatsApp Webhook
router.post('/twilio', webhookController.handleTwilioWebhook);

// Stripe (Needs raw body for signature validation)
router.post('/stripe', express.raw({ type: 'application/json' }), webhookController.handleStripeWebhook);

// TikTok etc.
router.post('/tiktok', webhookController.handleTikTokWebhook);

// Telegram Bot Webhook
router.post('/telegram', webhookController.handleTelegramWebhook);


// LinkedIn Webhook (Validation & Inbound Events)
router.get('/linkedin', webhookController.verifyLinkedInWebhook);
router.post('/linkedin', webhookController.handleLinkedInWebhook);

// Twitter / X Webhook (CRC Challenge Response & Inbound Events)
router.get('/twitter', webhookController.verifyTwitterWebhook);
router.post('/twitter', webhookController.handleTwitterWebhook);

module.exports = router;
