const axios = require('axios');
const prisma = require('../config/db');

/**
 * Normalizes phone numbers to standard international E.164 format (without '+' for Meta API)
 */
const cleanPhoneNumber = (phone) => {
  if (!phone) return null;
  let clean = String(phone).trim().replace(/[^\d+]/g, '');
  if (clean.startsWith('+')) {
    clean = clean.substring(1);
  }
  if (clean.startsWith('00')) {
    clean = clean.substring(2);
  }
  // Default UAE fallback if 9 digits starting with 50/52/54/55/56/58
  if (clean.length === 9 && (clean.startsWith('50') || clean.startsWith('52') || clean.startsWith('54') || clean.startsWith('55') || clean.startsWith('56') || clean.startsWith('58'))) {
    clean = '971' + clean;
  }
  return clean.length >= 8 ? clean : null;
};

/**
 * Retrieves Meta WhatsApp Cloud API credentials directly from CompanySetting table
 * (as saved in the Super Admin Integrations page) or environment variables.
 */
const getCredentials = async () => {
  try {
    const setting = await prisma.companySetting.findFirst();
    const wa = setting?.customizationSettings?.integrations?.socialPlatforms?.whatsapp;

    const phoneNumberId = wa?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_PHONE_NUMBER_ID;
    const accessToken = wa?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    const businessAccountId = wa?.businessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.META_BUSINESS_ACCOUNT_ID;

    const isConnected = !!(
      accessToken &&
      accessToken.length >= 15 &&
      accessToken !== 'placeholder' &&
      !wa?.disconnected &&
      (phoneNumberId || businessAccountId)
    );

    return {
      isConnected,
      phoneNumberId,
      accessToken,
      businessAccountId,
      source: wa?.accessToken ? 'integrations_setting' : 'env'
    };
  } catch (error) {
    console.error('Error fetching WhatsApp credentials from settings:', error.message);
    return {
      isConnected: false,
      phoneNumberId: null,
      accessToken: null,
      businessAccountId: null,
      source: 'none'
    };
  }
};

/**
 * Fetches approved Meta Message Templates directly from Meta Graph API.
 * Strict Mode: No mock or fake templates. Returns real templates from Meta Business Account.
 */
const getApprovedTemplates = async () => {
  const creds = await getCredentials();

  if (!creds.isConnected || !creds.businessAccountId || !creds.accessToken) {
    console.log('[Meta Template Sync] WhatsApp Business credentials not configured yet. Returning empty templates list.');
    return [];
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${creds.businessAccountId}/message_templates?limit=100`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
      timeout: 10000
    });

    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data.map(tpl => ({
        name: tpl.name,
        category: tpl.category,
        language: tpl.language,
        status: tpl.status,
        components: tpl.components || []
      }));
    }
    return [];
  } catch (error) {
    console.warn('Meta Graph API template fetch error:', error.response?.data?.error?.message || error.message);
    return [];
  }
};

/**
 * Dispatches an approved Template Message via Meta WhatsApp Cloud API
 */
const sendTemplateMessage = async ({ to, templateName, languageCode = 'en', components = [] }) => {
  const cleanTo = cleanPhoneNumber(to);
  if (!cleanTo) {
    return { success: false, error: 'Invalid recipient phone number format' };
  }

  // Check Opt-out suppression
  try {
    const optOut = await prisma.whatsAppOptOut.findUnique({ where: { phone: cleanTo } });
    if (optOut) {
      return { success: false, error: 'Recipient has opted out of WhatsApp messages', optedOut: true };
    }
  } catch (e) {}

  const creds = await getCredentials();

  // If live credentials are not yet configured, return clear error (Strict: Zero fake/mock simulation)
  if (!creds.isConnected || !creds.phoneNumberId || !creds.accessToken) {
    console.warn(`[WhatsApp Marketing] Meta credentials not configured. Cannot dispatch template "${templateName}" to ${cleanTo}`);
    return {
      success: false,
      error: 'Meta WhatsApp Business Cloud API credentials not configured. Please enter your Phone Number ID and Access Token in Integrations settings.'
    };
  }

  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components.length > 0 ? components : undefined
      }
    };

    const url = `https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`;
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const metaMsgId = res.data?.messages?.[0]?.id || `wamid.${Date.now()}`;
    return {
      success: true,
      messageId: metaMsgId,
      status: 'SENT'
    };
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error(`Meta Cloud API Error sending to ${cleanTo}:`, errMsg);
    return {
      success: false,
      error: errMsg
    };
  }
};

/**
 * Sends a direct 2-way text message (Customer service window)
 */
const sendTextMessage = async ({ to, text, aiGenerated = false }) => {
  const cleanTo = cleanPhoneNumber(to);
  if (!cleanTo) return { success: false, error: 'Invalid phone' };

  const creds = await getCredentials();

  if (!creds.isConnected || !creds.phoneNumberId || !creds.accessToken) {
    console.warn(`[WhatsApp Marketing] Meta credentials not configured. Cannot send text to ${cleanTo}`);
    return {
      success: false,
      error: 'Meta WhatsApp Business Cloud API credentials not configured. Please enter your Phone Number ID and Access Token in Integrations settings.'
    };
  }

  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: { preview_url: false, body: text }
    };

    const url = `https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`;
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      success: true,
      messageId: res.data?.messages?.[0]?.id || `wamid.${Date.now()}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
};

module.exports = {
  cleanPhoneNumber,
  getCredentials,
  getApprovedTemplates,
  sendTemplateMessage,
  sendTextMessage
};

