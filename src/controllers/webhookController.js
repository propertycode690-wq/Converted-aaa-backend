const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const prisma = require('../config/db');
const s3Service = require('../services/s3Service');
const { sendGoogleReviewRequestWhatsApp } = require('../services/whatsappService');
const { communicationsQueue, remindersQueue } = require('../queues/queueSetup');
const { processPaymentEvent } = require('../services/paymentService');

const processedMessages = new Set();

const isDuplicateMessage = async (messageId) => {
  if (!messageId) return false;

  // 1. Check in-memory Set for local deduplication
  if (processedMessages.has(messageId)) {
    return true;
  }
  processedMessages.add(messageId);
  setTimeout(() => {
    processedMessages.delete(messageId);
  }, 60000); // 1 minute window

  // 2. If Redis is enabled, check Redis for distributed locking/deduplication
  if (process.env.DISABLE_REDIS !== 'true') {
    try {
      const { connection: redis } = require('../queues/connection');
      if (redis && typeof redis.set === 'function') {
        const lockKey = `webhook:msg:${messageId}`;
        const result = await redis.set(lockKey, 'processed', 'EX', 120, 'NX'); // 2 minutes TTL
        if (result !== 'OK') {
          return true; // Key already existed, so it is a duplicate
        }
      }
    } catch (err) {
      console.warn('Deduplication Redis check failed:', err.message);
    }
  }

  // 3. Check Database
  try {
    const existing = await prisma.communicationLog.findFirst({
      where: { messageId }
    });
    if (existing) {
      return true;
    }
  } catch (err) {
    console.warn('Deduplication DB check failed:', err.message);
  }

  return false;
};

exports.verifyMetaSignature = (req, res, next) => {
  const signature = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];
  const appSecret = process.env.META_APP_SECRET;
  
  if (!appSecret || !signature) {
    return next();
  }

  try {
    const rawPayload = req.rawBody || JSON.stringify(req.body);
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', appSecret)
      .update(rawPayload)
      .digest('hex')}`;

    if (signature === expectedSignature || (signature.length === expectedSignature.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature)))) {
      return next();
    }
  } catch (err) {
    console.warn('[Meta Webhook] Signature calculation warning:', err.message);
  }

  console.warn('[Meta Webhook] Signature header mismatch. Proceeding with payload processing.');
  return next();
};

exports.handleMetaWebhook = async (req, res) => {
  const payload = req.body;
  console.log('Received Meta Webhook:', JSON.stringify(payload, null, 2));

  // Meta requires a 200 OK immediately
  res.status(200).send('EVENT_RECEIVED');

  try {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // 1. Check if WhatsApp Webhook Message
    if (value?.messages && value.messages.length > 0) {
      for (const msg of value.messages) {
        if (msg.from) {
          const phone = msg.from;
          const contact = value.contacts?.find(c => c.wa_id === phone);
          const name = contact?.profile?.name || 'Applicant';
          let message = msg.text?.body || '';
          let mediaUrl = null;

          if (msg.type === 'image') {
            message = msg.image?.caption ? `${msg.image.caption} (📷 Photo)` : '📷 Photo';
            mediaUrl = msg.image?.id ? `whatsapp_media:${msg.image.id}` : null;
          } else if (msg.type === 'video') {
            message = msg.video?.caption ? `${msg.video.caption} (🎥 Video)` : '🎥 Video';
            mediaUrl = msg.video?.id ? `whatsapp_media:${msg.video.id}` : null;
          } else if (msg.type === 'audio' || msg.type === 'voice') {
            message = '🎵 Voice Note';
            mediaUrl = (msg.audio?.id || msg.voice?.id) ? `whatsapp_media:${msg.audio?.id || msg.voice?.id}` : null;
          } else if (msg.type === 'document') {
            message = msg.document?.filename ? `📄 ${msg.document.filename}` : '📄 Document';
            mediaUrl = msg.document?.id ? `whatsapp_media:${msg.document.id}` : null;
          } else if (msg.type === 'reaction') {
            message = `Reacted ${msg.reaction?.emoji || '👍'} to a message`;
          } else if (msg.type === 'interactive') {
            message = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || 'Interactive response';
          }

          if (!message.trim() && !mediaUrl) {
            message = '✨ [WhatsApp Interaction]';
          }

          const messageId = msg.id;

          if (messageId && await isDuplicateMessage(messageId)) {
            console.log(`[Meta Webhook] WhatsApp message ${messageId} is duplicate. Ignoring.`);
            continue;
          }

          console.log(`Enqueuing WhatsApp message from ${phone} (${name}): ${message}`);
          await communicationsQueue.add('process-meta-message', {
            phone,
            name,
            message,
            mediaUrl,
            messageId,
            platform: 'whatsapp'
          }, {
            jobId: messageId || Date.now().toString()
          });
        }
      }
    } 
    // 2. Messenger / Instagram DM Webhooks
    else if (entry?.messaging && entry.messaging.length > 0) {
      const pageOrAccountId = entry.id;
      for (const msg of entry.messaging) {
        const senderId = msg.sender?.id;
        let messageText = msg.message?.text || '';
        let mediaUrl = null;
        const platform = payload.object === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK';
        const messageId = msg.message?.mid;

        // 1. Skip non-message events (Read receipts, delivery receipts, control events)
        if (msg.read) {
          console.log(`[Meta Webhook] Ignoring read/seen receipt from ${senderId}`);
          continue;
        }
        if (msg.delivery) {
          console.log(`[Meta Webhook] Ignoring delivery receipt for ${senderId}`);
          continue;
        }
        if (msg.account_linking || msg.optin || msg.pass_thread_control || msg.take_thread_control) {
          console.log(`[Meta Webhook] Ignoring system/control event from ${senderId}`);
          continue;
        }
        if (!msg.message && !msg.reaction && !msg.postback) {
          console.log(`[Meta Webhook] Ignoring non-message event from ${senderId}`);
          continue;
        }

        // 2. Skip echo messages or outbound messages sent by our own business account/page
        if (msg.message?.is_echo || (pageOrAccountId && senderId === pageOrAccountId)) {
          console.log(`[Meta Webhook] Ignoring echo/outbound message from self (${senderId})`);
          continue;
        }

        if (messageId && await isDuplicateMessage(messageId)) {
          console.log(`[Meta Webhook] DM message ${messageId} is duplicate. Ignoring.`);
          continue;
        }

        // Extract attachments (Photos, Videos, Audio, Files, Story Mentions, Shares)
        if (msg.message?.attachments && msg.message.attachments.length > 0) {
          const att = msg.message.attachments[0];
          const attType = att.type || 'attachment';
          mediaUrl = att.payload?.url || null;

          if (attType === 'image') {
            messageText = messageText ? `${messageText} (📷 Photo)` : '📷 Photo';
          } else if (attType === 'video') {
            messageText = messageText ? `${messageText} (🎥 Video)` : '🎥 Video';
          } else if (attType === 'audio') {
            messageText = messageText ? `${messageText} (🎵 Voice Note)` : '🎵 Voice Note';
          } else if (attType === 'story_mention') {
            messageText = messageText || '✨ Mentioned you in an Instagram Story';
          } else if (attType === 'share') {
            const shareTitle = att.payload?.title ? `: "${att.payload.title}"` : '';
            messageText = messageText || `📎 Shared a Post/Reel${shareTitle}`;
          } else if (attType === 'file') {
            messageText = messageText || '📄 File Attachment';
          } else {
            messageText = messageText || `📎 Attachment (${attType})`;
          }
        } else if (msg.reaction) {
          const emoji = msg.reaction.emoji || '❤️';
          messageText = `Reacted ${emoji} to message`;
        } else if (msg.postback) {
          messageText = msg.postback.title || msg.postback.payload || 'Selected an option';
        } else if (msg.message?.quick_reply) {
          messageText = msg.message.quick_reply.payload || msg.message.quick_reply.text || 'Selected option';
        } else if (msg.message?.sticker_id) {
          messageText = '🎭 Sticker';
        }

        // Skip if completely empty event
        if (!messageText.trim() && !mediaUrl) {
          console.log(`[Meta Webhook] No message content found from ${senderId}. Ignoring.`);
          continue;
        }

        let senderDisplayName = platform === 'INSTAGRAM' ? 'Instagram Client' : 'Facebook Client';
        try {
          if (platform === 'INSTAGRAM') {
            const instagramService = require('../services/instagramService');
            const igProfile = await instagramService.getInstagramUserProfile(senderId);
            if (igProfile && (igProfile.name || igProfile.username)) {
              senderDisplayName = igProfile.name || igProfile.username;
            }
          } else if (platform === 'FACEBOOK') {
            const facebookService = require('../services/facebookService');
            const fbProfile = await facebookService.getFacebookUserProfile(senderId);
            if (fbProfile && fbProfile.name) {
              senderDisplayName = fbProfile.name;
            }
          }
        } catch (profileErr) {
          console.warn('[Meta Webhook Profile Fetch Warning]:', profileErr.message);
        }

        console.log(`[Meta Webhook] Received Direct Message from ${senderDisplayName} (${senderId}) on ${platform}: ${messageText}`);

        const dbContent = `${messageText}${mediaUrl ? `\n[FILE: ${mediaUrl}]` : ''}`.trim();

        // Direct DB save for instant UI responsiveness
        try {
          await prisma.communicationLog.create({
            data: {
              phone: senderId,
              name: senderDisplayName,
              channel: platform,
              direction: 'INBOUND',
              content: dbContent,
              messageId: messageId || `meta-${Date.now()}`,
              deliveryStatus: 'DELIVERED'
            }
          });
        } catch (dbErr) {
          console.warn('[Meta Webhook Direct DB Save Warning]:', dbErr.message);
        }

        // Trigger Automated Greeting + Lead Form link for DMs
        if (platform === 'INSTAGRAM') {
          try {
            const instagramService = require('../services/instagramService');
            instagramService.sendAutomatedInstagramGreeting(senderId, senderDisplayName).catch(e => console.warn('IG Auto-Greeting Error:', e.message));
          } catch (autoErr) {
            console.warn('[Meta Webhook IG Auto Greeting Warning]:', autoErr.message);
          }
        } else if (platform === 'FACEBOOK') {
          try {
            const facebookService = require('../services/facebookService');
            facebookService.sendAutomatedFacebookGreeting(senderId, senderDisplayName).catch(e => console.warn('FB Auto-Greeting Error:', e.message));
          } catch (autoErr) {
            console.warn('[Meta Webhook FB Auto Greeting Warning]:', autoErr.message);
          }
        }

        try {
          await communicationsQueue.add('process-meta-message', {
            phone: senderId,
            name: senderDisplayName,
            message: messageText,
            mediaUrl,
            messageId,
            platform: platform.toLowerCase()
          }, {
            jobId: messageId || Date.now().toString()
          });
        } catch (qErr) {
          console.warn('[Meta Webhook Queue Warning]:', qErr.message);
        }
      }
    }
    // 3. Comments (Facebook Feed / Instagram Comments) Webhooks
    else if (entry?.changes && entry.changes.length > 0) {
      for (const chg of entry.changes) {
        const val = chg.value;
        const field = chg.field;
        
        if (field === 'leadgen') {
          const leadgenId = val.leadgen_id;
          const formId = val.form_id;
          const adId = val.ad_id;
          const platform = payload.object === 'instagram' ? 'Instagram Lead Ads' : 'Facebook Lead Ads';

          if (leadgenId && await isDuplicateMessage(leadgenId)) {
            console.log(`[Meta Webhook] Leadgen event ${leadgenId} is duplicate. Ignoring.`);
            continue;
          }

          console.log(`[Meta Webhook] Ingesting Lead Ad submission ${leadgenId} from ${platform} (Form: ${formId})`);

          let leadName = 'Lead Ad Prospect';
          let leadEmail = '';
          let leadPhone = '';
          let leadService = 'IT Consulting & Software Development';
          let leadNotes = `Captured via ${platform} (Form ID: ${formId || 'N/A'}, Ad ID: ${adId || 'N/A'})`;

          try {
            const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
            if (pageToken && leadgenId) {
              const graphRes = await axios.get(`https://graph.facebook.com/v19.0/${leadgenId}`, {
                params: { access_token: pageToken }
              });

              if (graphRes.data?.field_data) {
                for (const item of graphRes.data.field_data) {
                  const fName = (item.name || '').toLowerCase();
                  const fVal = item.values?.[0] || '';
                  if (fName.includes('name')) leadName = fVal;
                  else if (fName.includes('email')) leadEmail = fVal;
                  else if (fName.includes('phone')) leadPhone = fVal;
                  else if (fName.includes('service') || fName.includes('requirement')) leadService = fVal;
                  else leadNotes += `\n${item.name}: ${fVal}`;
                }
              }
            }
          } catch (graphErr) {
            console.warn('[Meta Leadgen Graph API Warning]:', graphErr.response?.data || graphErr.message);
          }

          const nameParts = (leadName || '').trim().split(' ');
          const firstName = nameParts[0] || 'Valued';
          const lastName = nameParts.slice(1).join(' ') || 'Prospect';

          try {
            const newLead = await prisma.lead.create({
              data: {
                firstName,
                lastName,
                email: leadEmail || `meta_lead_${leadgenId || Date.now()}@prospect.crm`,
                phone: leadPhone || `+00${Date.now().toString().slice(-9)}`,
                source: platform,
                serviceType: leadService,
                nationality: 'Not Specified',
                countryOfResidence: 'International',
                campaignId: adId || formId || null,
                notes: leadNotes,
                status: 'New Lead'
              }
            });

            await prisma.communicationLog.create({
              data: {
                phone: newLead.phone,
                name: `${firstName} ${lastName}`,
                channel: payload.object === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK',
                direction: 'INBOUND',
                content: `🎯 [${platform} Form Submission]: Service requested: "${leadService}". ${leadNotes}`,
                messageId: leadgenId || `meta_lead_${Date.now()}`,
                externalProviderId: formId || null,
                deliveryStatus: 'DELIVERED'
              }
            });

            const io = req.app.get('io');
            if (io) {
              io.to('role:admin').to('role:consultant').to('role:marketing').emit('new-lead', newLead);
            }
          } catch (dbErr) {
            console.error('[Meta Leadgen DB Error]:', dbErr.message);
          }
        } else if (field === 'feed' || field === 'comments' || field === 'comment') {
          const commentText = val.message || val.text || '';
          const commentId = val.comment_id || val.id;
          const senderName = val.from?.name || 'Social User';
          const platform = payload.object === 'instagram' ? 'instagram' : 'facebook';
          
          if (commentId && await isDuplicateMessage(commentId)) {
            console.log(`[Meta Webhook] Comment ${commentId} is duplicate. Ignoring.`);
            continue;
          }

          console.log(`Enqueuing Comment update from ${senderName} on ${platform} (${field}): ${commentText}`);
          await communicationsQueue.add('process-meta-comment', {
            commentId,
            senderName,
            message: commentText,
            platform
          }, {
            jobId: commentId || Date.now().toString()
          });
        }
      }
    }
  } catch (error) {
    console.error('Error parsing Meta webhook payload:', error);
  }
};

exports.handleStripeWebhook = async (req, res) => {
  // Stripe requires raw body for signature validation
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (endpointSecret && sig) {
      const stripeSecret = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
      const stripe = require('stripe')(stripeSecret);
      const payloadBuffer = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body));
      event = stripe.webhooks.constructEvent(payloadBuffer, sig, endpointSecret);
    } else {
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
  } catch (err) {
    console.error('[Stripe Webhook Signature Error]:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.send();

  const session = event.data.object;
  if (event.type === 'checkout.session.completed' && (session?.metadata?.type === 'no_show_case_assessment' || session?.metadata?.paymentPurpose === 'NO_SHOW_ASSESSMENT')) {
    const clientId = session.metadata.clientId;
    const paymentId = session.metadata.paymentId;
    
    try {
      // Get agent's commission rate
      let snapshotRate = 0;
      const clientWithAgent = await prisma.client.findUnique({
        where: { id: clientId },
        include: { assignedTo: true }
      });
      if (clientWithAgent && clientWithAgent.assignedTo) {
        snapshotRate = clientWithAgent.assignedTo.commissionRate || 0;
      }

      // 1. Update Payment status to Paid
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'Paid',
          transactionId: session.id,
          paymentMethod: 'Stripe',
          totalPaid: session.amount_total ? session.amount_total / 100 : 262.50,
          commissionRate: snapshotRate
        }
      });

      // 2. Fetch Client and Lead
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: { lead: true }
      });

      if (client) {
        // 3. Remove client from blacklistedClient table
        try {
          await prisma.blacklistedClient.deleteMany({
            where: {
              OR: [
                { email: client.email.toLowerCase() },
                { phone: client.phone }
              ]
            }
          });
          console.log(`[Stripe Webhook] Removed client ${client.email} from blacklist`);
        } catch (delErr) {
          console.warn('[Stripe Webhook] Blacklist deletion failed:', delErr.message);
        }

        // 4. Update Client status
        await prisma.client.update({
          where: { id: client.id },
          data: {
            status: 'Payment Received',
            isBlocked: false
          }
        });

        if (client.lead) {
          await prisma.lead.update({
            where: { id: client.lead.id },
            data: {
              status: 'Payment Received'
            }
          });
        }
      }


    } catch (err) {
      console.error('Error handling no_show_case_assessment webhook event:', err);
    }
  } else if (event.type === 'checkout.session.completed' && (session?.metadata?.serviceType === 'Spanish Sworn Translation' || session?.metadata?.leadId || session?.client_reference_id)) {
    const leadId = session.metadata?.leadId || session.client_reference_id;
    const isExplicitTranslation = session?.metadata?.serviceType === 'Spanish Sworn Translation';
    
    // Check if the lead is indeed a Sworn Translation lead
    let isTranslationLead = isExplicitTranslation;
    if (!isTranslationLead && leadId) {
      const checkLead = await prisma.lead.findUnique({ where: { id: leadId }, select: { serviceType: true } }).catch(() => null);
      if (checkLead && (checkLead.serviceType === 'Spanish Sworn Translation' || checkLead.serviceType?.includes('Translation'))) {
        isTranslationLead = true;
      }
    }

    if (isTranslationLead) {
      try {
        const { handleSwornTranslationPaymentSuccess } = require('../services/translationPaymentService');
        await handleSwornTranslationPaymentSuccess({
          leadId,
          session,
          reqApp: req.app
        });
        console.log(`[Stripe Webhook] Sworn translation payment confirmed & processed for lead ${leadId}`);
      } catch (leadErr) {
        console.error('[Stripe Webhook] Sworn translation workflow error:', leadErr.message);
      }
    } else {
      // If it's a generic lead payment, process via standard payment event
      await processPaymentEvent(event).catch(console.error);
    }
  } else {
    // Enqueue payment event (We can handle this later in Payment State Machine)
    await processPaymentEvent(event).catch(console.error);
  }
};

exports.handleTikTokWebhook = async (req, res) => {
  const payload = req.body;
  res.status(200).send('EVENT_RECEIVED');
  
  await communicationsQueue.add('process-tiktok-lead', payload, {
    jobId: payload.lead_id || Date.now().toString(),
  });
};

exports.handleTelegramWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log('Received Telegram Webhook Payload:', JSON.stringify(payload, null, 2));

    // Acknowledge event immediately to Telegram
    res.status(200).json({ success: true });

    const message = payload.message;
    if (message && message.text) {
      const chatId = String(message.chat.id);
      const text = message.text;
      const firstName = message.from?.first_name || '';
      const lastName = message.from?.last_name || '';
      const name = `${firstName} ${lastName}`.trim() || 'Telegram User';

      console.log(`Enqueuing Telegram message from chat ${chatId}: ${text}`);
      await communicationsQueue.add('process-telegram-message', {
        chatId,
        name,
        message: text
      }, {
        jobId: `tg-${message.message_id || Date.now()}`
      });
    }
  } catch (err) {
    console.error('Error handling Telegram webhook:', err);
  }
};

exports.verifyMetaWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.META_VERIFY_TOKEN || 'aaa_consultancy_secret_token';

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Meta Webhook Verified Successfully!');
      return res.status(200).send(challenge);
    } else {
      console.warn('Meta Webhook Verification Failed: Token Mismatch');
      return res.status(403).send('Forbidden');
    }
  }
  return res.status(400).send('Bad Request');
};

/**
 * Twilio Webhook Handler (Inbound WhatsApp messages)
 * Twilio sends URL-encoded POST payloads when a user replies to your WhatsApp number.
 */
exports.handleTwilioWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log('Received Twilio Webhook Payload:', payload);

    // Twilio webhooks must return TwiML (XML) response, even an empty one is fine
    res.type('text/xml');
    res.send('<Response></Response>');

    // Extract message fields
    const rawFrom = payload.From || ''; // Format: "whatsapp:+1234567890" or "+1234567890"
    const phone = rawFrom.replace('whatsapp:', '');
    const message = payload.Body || '';
    const name = payload.ProfileName || ''; // Twilio ProfileName if available
    const messageId = payload.MessageSid;
    
    // Extract media if present
    const numMedia = parseInt(payload.NumMedia || '0', 10);
    const mediaUrl = numMedia > 0 ? payload.MediaUrl0 : null;

    // Deduplicate incoming Twilio messages
    if (messageId && await isDuplicateMessage(messageId)) {
      console.log(`[Twilio Webhook] Message ${messageId} is duplicate. Ignoring.`);
      return;
    }

    if (phone) {
      // Broadcast live via Socket.io
      const io = req.app.get('io');
      if (io) {
        io.emit('new_whatsapp_message', {
          phone: phone,
          name: (name && name !== 'Applicant') ? name : phone,
          text: message,
          mediaUrl: mediaUrl,
          rawTimestamp: new Date().toISOString(),
          timestamp: `${new Date().toLocaleDateString('en-GB')} • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        });
      }

      if (process.env.DISABLE_REDIS === 'true') {
        console.log(`[LOCAL DEV] Redis disabled. Processing chatbot message synchronously.`);
        const chatbotService = require('../services/chatbotService');
        chatbotService.handleChatbotMessage(phone, name || 'Applicant', message || '', messageId, mediaUrl).catch(err => {
          console.error('[LOCAL DEV] Chatbot processing error:', err.message);
        });
      } else {
        // Add incoming message to communications queue
        await communicationsQueue.add('process-twilio-message', {
          phone,
          name,
          message,
          messageId,
          mediaUrl,
          rawPayload: payload
        }, {
          jobId: messageId || `twilio-msg-${Date.now()}`
        });
        console.log(`Enqueued incoming Twilio WhatsApp message job from ${phone}`);
      }
    }
  } catch (error) {
    console.error('Error handling Twilio webhook:', error.message);
    // Don't crash, respond with empty TwiML
    if (!res.headersSent) {
      res.type('text/xml');
      res.send('<Response></Response>');
    }
  }
};

/**
 * LinkedIn Webhook Handshake Verification (Challenge Response)
 */
exports.verifyLinkedInWebhook = (req, res) => {
  const challenge = req.query.challenge || req.query['hub.challenge'];
  console.log('[LinkedIn Webhook Verification] Challenge received:', challenge);
  if (challenge) {
    return res.status(200).send(challenge);
  }
  return res.status(200).json({ status: 'active', service: 'LinkedIn Webhook Listener' });
};

/**
 * Handles incoming LinkedIn Direct Messages & Lead Gen Forms
 */
exports.handleLinkedInWebhook = async (req, res) => {
  const payload = req.body;
  console.log('[LinkedIn Webhook Payload Received]:', JSON.stringify(payload, null, 2));

  // LinkedIn requires immediate 200/204 response
  res.status(200).send('EVENT_RECEIVED');

  try {
    const linkedinService = require('../services/linkedinService');

    // 1. Check if Lead Gen Form submission
    if (payload.leadGenResponses || payload.leadFormResponses || payload.eventType === 'LEAD_GEN') {
      console.log('[LinkedIn Webhook] Processing Lead Gen Form submission');
      await linkedinService.syncLinkedInLead(payload);
      return;
    }

    // 2. Check if Post Comment / Social Action Event
    const isCommentEvent = payload.eventType === 'COMMENT' || payload.socialAction === 'COMMENT' || payload.commentUrn || payload.object?.includes('comment');

    if (isCommentEvent || payload.comments) {
      console.log('[LinkedIn Webhook] Processing LinkedIn Post Comment event');
      const commentObj = payload.comment || payload;
      const commenterUrn = commentObj.actor || commentObj.sender || commentObj.author || payload.actor;
      const commentText = commentObj.message?.text || commentObj.text || commentObj.body || '';
      const commentUrn = commentObj.id || commentObj.urn || payload.commentUrn || `li_cmt_${Date.now()}`;
      const postUrn = commentObj.object || payload.object || '';

      if (commenterUrn && commentText) {
        const cleanCommenter = String(commenterUrn).trim();

        if (await isDuplicateMessage(commentUrn)) {
          console.log(`[LinkedIn Webhook] Comment ${commentUrn} already processed.`);
          return;
        }

        let senderDisplayName = 'LinkedIn Commenter';
        try {
          const profile = await linkedinService.getLinkedInUserProfile(cleanCommenter);
          if (profile && profile.name) senderDisplayName = profile.name;
        } catch (profErr) {
          console.warn('[LinkedIn Profile Warning]:', profErr.message);
        }

        // Save Comment to Database (isComment context stored in content/messageId)
        await prisma.communicationLog.create({
          data: {
            phone: cleanCommenter,
            name: senderDisplayName,
            channel: 'LINKEDIN',
            direction: 'INBOUND',
            content: `💬 [Post Comment]: ${commentText}`,
            messageId: commentUrn,
            externalProviderId: postUrn,
            deliveryStatus: 'DELIVERED'
          }
        });

        // Realtime live broadcast to Social Inbox Comments tab
        const io = req.app.get('io');
        if (io) {
          io.emit('new_whatsapp_message', {
            phone: cleanCommenter,
            name: senderDisplayName,
            text: `💬 [Post Comment]: ${commentText}`,
            channel: 'LINKEDIN',
            platform: 'linkedin',
            isComment: true,
            commentUrn: commentUrn,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }

        console.log(`[LinkedIn Comment Received] From ${senderDisplayName}: ${commentText}`);
        return;
      }
    }

    // 3. Check if Direct Message or General Inbound Event
    const events = Array.isArray(payload.events) ? payload.events : [payload];

    for (const ev of events) {
      const messageObj = ev.message || ev.value || ev;
      const senderUrn = messageObj.sender || ev.sender || messageObj.from;
      const messageText = messageObj.text || messageObj.body || messageObj.content || '';
      const messageId = messageObj.id || messageObj.messageId || ev.id || `li-${Date.now()}`;

      if (!senderUrn) {
        console.log('[LinkedIn Webhook] No sender URN found in event, skipping.');
        continue;
      }

      const cleanSender = String(senderUrn).trim();

      // Skip echo/outbound messages sent by the organization page itself
      const orgId = process.env.LINKEDIN_ORGANIZATION_ID || '';
      if (orgId && cleanSender.includes(orgId)) {
        console.log(`[LinkedIn Webhook] Skipping outbound message from self (${cleanSender})`);
        continue;
      }

      if (await isDuplicateMessage(messageId)) {
        console.log(`[LinkedIn Webhook] Message ${messageId} is duplicate. Ignoring.`);
        continue;
      }

      // Resolve user profile name
      let senderDisplayName = 'LinkedIn Client';
      try {
        const profile = await linkedinService.getLinkedInUserProfile(cleanSender);
        if (profile && profile.name) {
          senderDisplayName = profile.name;
        }
      } catch (profErr) {
        console.warn('[LinkedIn Profile Resolve Warning]:', profErr.message);
      }

      console.log(`[LinkedIn Inbound Message] From: ${senderDisplayName} (${cleanSender}): ${messageText}`);

      // Save to database for instant UI responsiveness
      await prisma.communicationLog.create({
        data: {
          phone: cleanSender,
          name: senderDisplayName,
          channel: 'LINKEDIN',
          direction: 'INBOUND',
          content: messageText || '✨ [LinkedIn Interaction]',
          messageId: messageId,
          deliveryStatus: 'DELIVERED'
        }
      });

      // Realtime live broadcast to social inbox
      const io = req.app.get('io');
      if (io) {
        io.emit('new_whatsapp_message', {
          phone: cleanSender,
          name: senderDisplayName,
          text: messageText,
          channel: 'LINKEDIN',
          platform: 'linkedin',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }

      // Trigger Automated Greeting + Lead Form link
      linkedinService.sendAutomatedLinkedInGreeting(cleanSender, senderDisplayName).catch(e => {
        console.warn('[LinkedIn Auto-Greeting Warning]:', e.message);
      });
    }
  } catch (error) {
    console.error('Error handling LinkedIn webhook event:', error.message);
  }
};

/**
 * Twitter / X CRC (Challenge-Response Check) Verification
 */
exports.verifyTwitterWebhook = async (req, res) => {
  const crcToken = req.query.crc_token;
  console.log('[Twitter CRC Challenge Received]:', crcToken);

  if (!crcToken) {
    return res.status(400).json({ error: 'crc_token query parameter is required' });
  }

  try {
    const twitterService = require('../services/twitterService');
    let apiSecret = req.query.api_secret || req.query.secret || req.headers['x-api-secret'];

    if (!apiSecret) {
      apiSecret = process.env.TWITTER_API_SECRET || process.env.TWITTER_CONSUMER_SECRET || process.env.TWITTER_API_KEY_SECRET;
    }

    if (!apiSecret) {
      const setting = await prisma.companySetting.findFirst();
      const tw = setting?.customizationSettings?.integrations?.socialPlatforms?.twitter;
      apiSecret = tw?.apiSecret || tw?.apiKeySecret || tw?.consumerSecret || tw?.appSecret;
    }

    if (!apiSecret) {
      console.error('[Twitter CRC Error]: No Twitter API Secret / Consumer Secret found in DB or Environment!');
      return res.status(400).json({
        error: 'Twitter Consumer Secret / API Secret Key is not configured. Please configure your API Secret in the CRM Integrations page or Railway environment variables.'
      });
    }

    const responseToken = twitterService.generateCRCToken(crcToken, String(apiSecret).trim());
    console.log('[Twitter CRC Response Generated Successfully]:', responseToken);
    return res.status(200).json({ response_token: responseToken });
  } catch (err) {
    console.error('[Twitter CRC Error]:', err.message);
    res.status(500).json({ error: 'Internal server error during CRC validation' });
  }
};

/**
 * Handles incoming Twitter / X Direct Messages and Mentions
 */
exports.handleTwitterWebhook = async (req, res) => {
  const payload = req.body || {};
  console.log('[Twitter Webhook Payload Received]:', JSON.stringify(payload, null, 2));

  // Acknowledge immediately to prevent timeout
  res.status(200).send('EVENT_RECEIVED');

  try {
    const twitterService = require('../services/twitterService');

    // 1. Gather all Direct Message Events across different Twitter API versions
    let dmEvents = [];

    if (Array.isArray(payload.direct_message_events)) {
      dmEvents.push(...payload.direct_message_events);
    }
    if (Array.isArray(payload.dm_events)) {
      dmEvents.push(...payload.dm_events);
    }
    if (Array.isArray(payload.events)) {
      dmEvents.push(...payload.events);
    }
    if (payload.data) {
      if (Array.isArray(payload.data)) {
        dmEvents.push(...payload.data);
      } else if (typeof payload.data === 'object') {
        dmEvents.push(payload.data);
      }
    }
    // Also check if payload itself is a single event
    if (payload.event_type === 'dm.received' || payload.event === 'dm.received' || payload.type === 'message_create') {
      dmEvents.push(payload);
    }

    // Process DM Events
    for (const event of dmEvents) {
      const messageData = event.message_create || event.message || event.data || event;
      const senderId = messageData.sender_id || messageData.senderId || messageData.author_id || messageData.sender?.id || event.sender_id || event.author_id;
      const text = messageData.message_data?.text || messageData.text || messageData.content || event.text || '';
      const messageId = event.id || messageData.id || `tw-${Date.now()}`;

      if (!senderId || !text) {
        continue;
      }

      const cleanSender = String(senderId).trim();

      if (await isDuplicateMessage(messageId)) {
        console.log(`[Twitter Webhook] Duplicate message ${messageId}, skipping.`);
        continue;
      }

      // Resolve profile name and avatar
      let senderDisplayName = event.sender?.username ? `@${event.sender.username}` : `@user_${cleanSender.substring(0, 6)}`;
      try {
        const profile = await twitterService.getTwitterUserProfile(cleanSender);
        if (profile && profile.name) {
          senderDisplayName = profile.name;
        }
      } catch (profErr) {
        console.warn('[Twitter Profile Warning]:', profErr.message);
      }

      console.log(`[Twitter Inbound Message] From: ${senderDisplayName} (${cleanSender}): ${text}`);

      // Save to database
      await prisma.communicationLog.create({
        data: {
          phone: cleanSender,
          name: senderDisplayName,
          channel: 'TWITTER',
          direction: 'INBOUND',
          content: text || '✨ [Twitter Interaction]',
          messageId: messageId,
          deliveryStatus: 'DELIVERED'
        }
      });

      // Realtime live broadcast to social inbox
      const io = req.app.get('io');
      if (io) {
        io.emit('new_whatsapp_message', {
          phone: cleanSender,
          name: senderDisplayName,
          text: text,
          channel: 'TWITTER',
          platform: 'twitter',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }

      // Trigger Automated Greeting
      twitterService.sendAutomatedTwitterGreeting(cleanSender, senderDisplayName).catch(e => {
        console.warn('[Twitter Auto-Greeting Warning]:', e.message);
      });
    }

    // 2. Tweet Mentions
    const tweetEvents = payload.tweet_create_events || (payload.event_type === 'tweet.create' ? [payload.data || payload] : []);
    for (const tweet of tweetEvents) {
      const sender = tweet.user?.screen_name ? `@${tweet.user.screen_name}` : (tweet.author_id ? `user_${tweet.author_id}` : `user_${tweet.user?.id_str}`);
      const text = tweet.text || '';
      const tweetId = tweet.id_str || tweet.id || `tw_tweet_${Date.now()}`;

      if (!sender || !text || await isDuplicateMessage(tweetId)) continue;

      await prisma.communicationLog.create({
        data: {
          phone: sender,
          name: tweet.user?.name || sender,
          channel: 'TWITTER',
          direction: 'INBOUND',
          content: `📢 [Tweet Mention]: ${text}`,
          messageId: tweetId,
          deliveryStatus: 'DELIVERED'
        }
      });
    }
  } catch (error) {
    console.error('Error handling Twitter webhook event:', error.message);
  }
};



