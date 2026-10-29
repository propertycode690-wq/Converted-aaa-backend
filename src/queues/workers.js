const { Worker } = require('bullmq');
const { connection } = require('./connection');
const { failedJobsQueue } = require('./queueSetup');

// Helper to handle DLQ (Dead Letter Queue) mechanism
const handleJobFailure = async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    console.error(`Job ${job.id} of type ${job.name} in queue ${job.queueName} failed permanently. Moving to DLQ.`);
    await failedJobsQueue.add(`dlq-${job.queueName}-${job.name}`, {
      originalJob: job.asJSON(),
      error: err.message,
      stack: err.stack
    }, {
      jobId: `failed-${job.id}` // Prevent duplicate DLQ entries
    });
  }
};

const setupWorkers = () => {
  if (process.env.DISABLE_REDIS === 'true' || !process.env.REDIS_URL) {
    console.log('BullMQ Workers are disabled (no REDIS_URL or DISABLE_REDIS=true). Skipping worker initialization.');
    return;
  }

  // Communications Worker
  const communicationsWorker = new Worker('communications', async (job) => {
    console.log(`Processing communication job ${job.id} of type: ${job.name}`);
    const { phone, email, name, message, messageId } = job.data;
    
    // Auto-reply logic for Meta/WhatsApp Click ads or website forms
    if (job.name === 'process-meta-message' || job.name === 'process-twilio-message' || job.name === 'process-tiktok-lead' || job.name === 'process-telegram-message') {
      try {
        if (job.name === 'process-telegram-message') {
          const { chatId, name, message: msgText } = job.data;
          console.log(`[Telegram Worker] Processing message from Telegram user: ${name}`);
          
          const telegramService = require('../services/telegramService');
          let responseText = `Hi ${name || 'there'}! Welcome to Kiaan Technologies. 💻🚀\n\nFor IT & Software Engineering services, type /services.\nFor booking an Architecture Discovery Session, type /book.`;
          
          if (lowerText.includes('/services') || lowerText.includes('service') || lowerText.includes('software')) {
            responseText = `<b>Kiaan Technologies IT Solutions</b> 🚀\n\nWe specialize in:\n• Custom Software & Web/Mobile Apps\n• Cloud Infrastructure & DevOps (AWS/GCP)\n• AI Engineering & Workflow Automation\n• Dedicated Engineering Pods\n\nReply /book to schedule a technical discovery call.`;
          } else if (lowerText.includes('/book') || lowerText.includes('book') || lowerText.includes('discovery')) {
            responseText = `<b>Book Discovery Session</b> 📅\n\nPlease schedule your technical session using our portal: https://kiaantechnologies.com/discovery`;
          }
          
          await telegramService.sendTelegramMessage(chatId, responseText);
        } else if (job.name === 'process-meta-message' || job.name === 'process-twilio-message') {
          // Process inbound user message via the Chatbot
          const chatbotService = require('../services/chatbotService');
          await chatbotService.handleChatbotMessage(job.data.phone, job.data.name || 'Applicant', job.data.message || '', job.data.messageId, job.data.mediaUrl);
        } else {
          // External lead form submission (process-tiktok-lead)
          console.log(`[Communications Worker] External lead submission processed for ${name || phone || email}`);
        }
      } catch (err) {
        console.error('Failed to process incoming communications webhook job:', err);
        throw err;
      }
    } else if (job.name === 'process-meta-comment') {
      try {
        const { commentId, senderName, message, platform } = job.data;
        console.log(`[Worker] Processing comment from ${senderName} on ${platform}: ${message}`);
        
        // Simulates checking if comment is asking for info
        const lowerMsg = (message || '').toLowerCase();
        const asksForInfo = ['visa', 'spain', 'info', 'price', 'how', 'eligible', 'help', 'cost'].some(kw => lowerMsg.includes(kw));
        
        if (asksForInfo) {
          console.log(`[Worker] Comment matching criteria for auto-reply on ${platform}. Sending simulated public reply.`);
          // In production, we call Facebook Graph API to reply:
          // await axios.post(`https://graph.facebook.com/v17.0/${commentId}/comments`, { message: ... })
          
          // Log reply simulation
          console.log(`[Auto-Reply Simulated] "Hi @${senderName}, thank you for reaching out! We've sent you a DM to get started, or you can book an assessment directly here: https://aaabusinessconsultancy.com/book-assessment"`);
        }
      } catch (err) {
        console.error('Failed to process meta comment auto-reply job:', err);
        throw err;
      }
    }
  }, { connection });

  communicationsWorker.on('failed', handleJobFailure);

  // Reminders Worker (Automated messages disabled)
  const remindersWorker = new Worker('reminders', async (job) => {
    console.log(`[Reminders Worker] Automated reminder job ${job.id} (${job.name}) skipped - automated messaging disabled.`);
  }, { connection });

  remindersWorker.on('failed', handleJobFailure);

  // No-Show Enforcer Worker
  const noShowEnforcerWorker = new Worker('no-show-enforcer', async (job) => {
    console.log(`Processing no-show-enforcer job ${job.id} - Messaging disabled by admin setting.`);
  }, { connection });

  noShowEnforcerWorker.on('failed', handleJobFailure);

  // Payment Drip Worker (Automated messages disabled)
  const paymentDripWorker = new Worker('payment-drip', async (job) => {
    console.log(`[Payment Drip Worker] Automated payment drip job ${job.id} (${job.name}) skipped - automated messaging disabled.`);
  }, { connection });

  paymentDripWorker.on('failed', handleJobFailure);

  console.log('BullMQ Workers initialized');
};

module.exports = { setupWorkers };
