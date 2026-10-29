const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const prisma = require('../config/db');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT == 465;
const SMTP_FROM = process.env.SMTP_FROM || `"Kiaan Technologies" <info@kiaantechnologies.com>`;

let resendClient = null;
let transporter = null;

const getCleanPackageName = (rawPackageName, serviceType) => {
  const input = String(rawPackageName || serviceType || '').trim();
  if (!input) return 'Enterprise IT Solutions & Engineering';

  // If input is a raw technical ID like pkg_1785313855786 or Stripe session ID
  if (input.startsWith('pkg_') || input.startsWith('cs_') || input.startsWith('pi_') || input.startsWith('ch_')) {
    if (serviceType && !String(serviceType).startsWith('pkg_')) {
      return getCleanPackageName(serviceType, null);
    }
    return 'IT Services & Software Engineering';
  }

  const lower = input.toLowerCase();
  if (lower.includes('case_assessment') || lower.includes('option_a') || lower === 'option a') return 'Startup MVP Acceleration (Option A)';
  if (lower.includes('option_b') || lower.includes('full processing')) return 'Dedicated Engineering Pod (Option B)';
  if (lower.includes('option_c') || lower.includes('premium')) return 'Cloud & DevOps Modernization (Option C)';
  if (lower.includes('option_d') || lower.includes('relocation')) return 'Enterprise Custom Solutions (Option D)';
  if (lower.includes('custom_software') || lower.includes('software')) return 'Custom Software Development';
  if (lower.includes('web')) return 'Web Application Development';
  if (lower.includes('mobile') || lower.includes('app')) return 'Mobile App Development';
  if (lower.includes('cloud') || lower.includes('devops')) return 'Cloud Architecture & DevOps';
  if (lower.includes('ai') || lower.includes('automation')) return 'AI & Workflow Automation';

  return input;
};

/**
 * Helper function to format any Date object or string (YYYY-MM-DD, ISO, timestamp) into DD/MM/YYYY
 */
const formatDateDDMMYYYY = (dateInput) => {
  if (!dateInput) return '';
  const str = String(dateInput).trim();
  
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }
  
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const clean = str.split('T')[0];
    const parts = clean.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  
  const d = new Date(dateInput);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  
  return str;
};

if (RESEND_API_KEY && RESEND_API_KEY !== 'your_resend_api_key_here') {
  console.log('Email Service: Initializing Resend client');
  resendClient = new Resend(RESEND_API_KEY);
}

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  console.log(`Email Service: Initializing SMTP transporter to ${SMTP_HOST}:${SMTP_PORT}`);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000
  });
}

if (!resendClient && !transporter) {
  console.warn('Email Service: Neither Resend nor SMTP credentials configured. Running in local DRY-RUN/Sandbox mode.');
}

/**
 * Sends an email using Resend, SMTP, or prints to logs if neither is configured (dry-run).
 * @param {Object} options - Email sending options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} [options.text] - Plain text body fallback
 * @returns {Promise<{success: boolean, messageId?: string, dryRun?: boolean}>}
 */
exports.sendEmail = async ({ to, subject, html, text }) => {
  const currentKey = process.env.RESEND_API_KEY;
  if (!resendClient && currentKey && currentKey !== 'your_resend_api_key_here') {
    console.log('Email Service: Dynamically initializing Resend client');
    resendClient = new Resend(currentKey);
  }

  if (resendClient) {
    try {
      const rawFrom = process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || process.env.SMTP_FROM || 'client@aaabusinessconsultancy.com';
      let cleanFrom = rawFrom.replace(/\\"/g, '"');
      if (!cleanFrom.includes('<')) {
        cleanFrom = `AAA Business Consultancy <${cleanFrom}>`;
      }
      const response = await resendClient.emails.send({
        from: cleanFrom,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, '') // Basic HTML strip for fallback text
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      console.log(`Email sent successfully via Resend to ${to}. Message ID: ${response.data?.id}`);
      return { success: true, messageId: response.data?.id, dryRun: false };
    } catch (error) {
      console.error(`Failed to send email via Resend to ${to}:`, error.message || error);
      if (transporter) {
        console.log(`Resend dispatch failed for ${to}. Attempting automatic SMTP fallback...`);
        try {
          const info = await transporter.sendMail({
            from: SMTP_FROM,
            to,
            subject,
            text: text || html.replace(/<[^>]*>/g, ''),
            html
          });
          console.log(`Email sent successfully via SMTP fallback to ${to}. Message ID: ${info.messageId}`);
          return { success: true, messageId: info.messageId, dryRun: false };
        } catch (smtpErr) {
          console.error(`SMTP fallback also failed for ${to}:`, smtpErr.message || smtpErr);
          throw smtpErr;
        }
      }
      throw error;
    }
  } else if (transporter) {
    try {
      const sendPromise = transporter.sendMail({
        from: SMTP_FROM,
        to,
        subject,
        text: text || html.replace(/<[^>]*>/g, ''), // Basic HTML strip for fallback text
        html
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SMTP sendMail timed out after 10s')), 10000)
      );

      const info = await Promise.race([sendPromise, timeoutPromise]);

      console.log(`Email sent successfully via SMTP to ${to}. Message ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId, dryRun: false };
    } catch (error) {
      console.error(`Failed to send email via SMTP to ${to}:`, error);
      throw error;
    }
  } else {
    // Sandbox / Dry-Run Log
    const fromAddress = RESEND_FROM || SMTP_FROM;
    console.log('------------------------------------------------------------');
    console.log(`[EMAIL DRY-RUN (NOT CONFIGURED)]`);
    console.log(`From:    ${fromAddress}`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body (Preview): ${html.substring(0, 150)}...`);
    console.log('------------------------------------------------------------');
    return { success: true, messageId: `dryrun-${Date.now()}`, dryRun: true };
  }
};

/**
 * Sends a customized IT Project Deliverables checklist to the client upon successful payment.
 * @param {string} to - Client email
 * @param {string} clientName - Client's name
 * @param {string} serviceType - Service type/project stream selected
 */
exports.sendVisaChecklist = async (to, clientName, serviceType, paymentData = {}) => {
  const normalizedService = (serviceType || '').toLowerCase();
  let checklistTitle = "IT Project Technical Deliverables Checklist";
  let checklistHtml = `
    <li>Project Scope Document / Statement of Work (SOW)</li>
    <li>Technical Architecture & API Specifications</li>
    <li>Company Tax ID & Registration Verification</li>
    <li>Authorized Signatory Identification</li>
    <li>Git Repository & CI/CD Pipeline Provisioning</li>
  `;

  if (normalizedService.includes('custom') || normalizedService.includes('software')) {
    checklistTitle = "Custom Software Engineering Kickoff Checklist";
    checklistHtml = `
      <li><b>Requirements Specification:</b> Comprehensive PRD and user story mapping.</li>
      <li><b>System Architecture:</b> High-level diagram, database schemas, and microservices topology.</li>
      <li><b>Repository Access:</b> GitHub/GitLab org invitations and branch security rules.</li>
      <li><b>Environment Config:</b> Staging cloud accounts and secret management vaults.</li>
      <li><b>Sprint Schedule:</b> Bi-weekly sprint milestones and acceptance criteria.</li>
    `;
  } else if (normalizedService.includes('web') || normalizedService.includes('frontend')) {
    checklistTitle = "Web Application Development Kickoff Checklist";
    checklistHtml = `
      <li><b>Design & Brand Assets:</b> Figma mockups, design tokens, and style guide.</li>
      <li><b>API Contracts:</b> OpenAPI/Swagger endpoints and authentication schemes.</li>
      <li><b>Domain & DNS:</b> Target DNS provisioning and SSL termination setups.</li>
      <li><b>Analytics & Tracking:</b> Event schemas, Google Tag Manager, or telemetry IDs.</li>
    `;
  } else if (normalizedService.includes('mobile') || normalizedService.includes('app')) {
    checklistTitle = "Mobile App Engineering Kickoff Checklist";
    checklistHtml = `
      <li><b>Store Accounts:</b> Apple App Store Connect and Google Play Console access.</li>
      <li><b>UI/UX Flows:</b> Native screen workflows, responsive wireframes, and assets.</li>
      <li><b>Push Notifications:</b> APNs and Firebase Cloud Messaging credentials.</li>
      <li><b>Beta Testing:</b> TestFlight internal/external tester group lists.</li>
    `;
  } else if (normalizedService.includes('cloud') || normalizedService.includes('devops')) {
    checklistTitle = "Cloud Infrastructure & DevOps Modernization Checklist";
    checklistHtml = `
      <li><b>Cloud Provider Access:</b> AWS IAM roles, GCP Service Accounts, or Azure RBAC.</li>
      <li><b>IaC Templates:</b> Terraform or CloudFormation existing configuration scripts.</li>
      <li><b>Security Policies:</b> Compliance frameworks (SOC2, HIPAA, ISO27001) requirements.</li>
      <li><b>Observability:</b> Monitoring and log aggregation dashboards (Datadog/Grafana).</li>
    `;
  } else if (normalizedService.includes('ai') || normalizedService.includes('automation')) {
    checklistTitle = "AI & Workflow Automation Kickoff Checklist";
    checklistHtml = `
      <li><b>Data Sources:</b> Ingestion data schemas, vector stores, and sample datasets.</li>
      <li><b>LLM / API Keys:</b> Private model endpoints or OpenAI/Anthropic/Gemini credentials.</li>
      <li><b>Evaluation Criteria:</b> Accuracy benchmarks, latency targets, and fallback strategies.</li>
    `;
  }

  const frontendUrl = process.env.FRONTEND_URL || 'https://crm.kiaantechnologies.com';
  const clientCode = paymentData.clientCode || 'N/A';
  const amountPaid = paymentData.amount ? `€${Number(paymentData.amount).toFixed(2)}` : 'N/A';
  const packageName = getCleanPackageName(paymentData.packageName, serviceType);
  const invoiceUrl = paymentData.invoiceUrl || `${frontendUrl}/#/portal/login`;
  const portalUrl = `${frontendUrl}/#/portal/login`;
  const dateStr = formatDateDDMMYYYY(new Date());

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #070D19, #0B1426); padding: 24px; text-align: center; color: #ffffff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #C59B27;">Kiaan Technologies</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.85; color: #F1F5F9;">Enterprise IT Solutions & Custom Engineering</p>
      </div>

      <div style="padding: 28px;">
        <h3 style="color: #2d3748; margin-top: 0; font-size: 18px;">🎉 Retainer Payment Confirmed — Kiaan Technologies</h3>
        <p style="color: #4a5568; line-height: 1.6;">Dear <b>${clientName}</b>,</p>
        <p style="color: #4a5568; line-height: 1.6;">Thank you! We have successfully received your project initiation payment. Here are your transaction details:</p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #1e293b; font-size: 15px;">📋 Receipt Summary:</h4>
          <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.8;">
            <li><b>👤 Client ID:</b> ${clientCode}</li>
            <li><b>💳 Amount Paid:</b> ${amountPaid}</li>
            <li><b>📦 Engagement Plan:</b> ${packageName}</li>
            <li><b>📅 Date:</b> ${dateStr}</li>
          </ul>
        </div>

        <div style="margin: 20px 0; background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 14px; border-radius: 4px;">
          <p style="margin: 0; color: #1e40af; font-size: 14px;">
            <b>🧾 Official Tax Invoice:</b> <a href="${invoiceUrl}" style="color: #2563eb; text-decoration: underline; font-weight: 600;">View & Download Official Tax Invoice</a>
          </p>
        </div>

        <div style="margin: 24px 0;">
          <h4 style="color: #1e293b; margin-top: 0; font-size: 15px;">🚀 Next Steps:</h4>
          <p style="color: #4a5568; line-height: 1.6; margin-bottom: 12px;">Your Client Portal is active. Log in to upload your technical specifications and track sprint deliverables in real time:</p>
          <div style="text-align: center; margin: 16px 0;">
            <a href="${portalUrl}" style="display: inline-block; padding: 12px 24px; background-color: #C59B27; color: #070D19; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">🔗 Access Client Portal</a>
          </div>
        </div>

        <p style="color: #4a5568; margin-top: 24px; line-height: 1.6;">Thank you for partnering with Kiaan Technologies! 🚀</p>
        <p style="color: #2d3748; margin-bottom: 0;"><b>Best regards,</b><br/>Kiaan Technologies Engineering Team</p>
      </div>

      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
        © 2026 Kiaan Technologies · All rights reserved
      </div>
    </div>
  `;

  return exports.sendEmail({
    to,
    subject: `🎉 Project Retainer Confirmed - Kiaan Technologies (${clientCode})`,
    html
  });
};

/**
 * Sends branded Discovery Session Confirmation email with Reschedule, Cancel, and Services action buttons.
 */
exports.sendAppointmentConfirmationEmail = async ({ to, firstName, serviceType }) => {
  const { getServiceTitleInfo } = require('../utils/serviceTitleHelper');
  const svcInfo = getServiceTitleInfo(serviceType);
  const servicesUrl = "https://kiaantechnologies.com/#services";
  const contactUrl = "https://kiaantechnologies.com/#contact";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #070D19, #0B1426); padding: 24px; text-align: center; color: #ffffff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #C59B27;">Kiaan Technologies</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.85; color: #F1F5F9;">${svcInfo.categoryName}</p>
      </div>

      <div style="padding: 28px;">
        <h3 style="color: #2d3748; margin-top: 0; font-size: 18px;">${svcInfo.icon} Technical Inquiry Received</h3>
        <p style="color: #4a5568; line-height: 1.6;">Dear <b>${firstName || 'Client'}</b>,</p>
        <p style="color: #4a5568; line-height: 1.6;">Thank you for reaching out to <b>Kiaan Technologies</b> regarding <b>${svcInfo.title}</b>. We have successfully logged your project specifications.</p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #1e293b; font-size: 15px;">📋 Next Steps:</h4>
          <p style="margin: 0; color: #334155; line-height: 1.6;">
            Our Lead Solutions Architect is reviewing your technical requirements. A senior engineering lead will connect with you shortly to schedule your architecture discovery session.
          </p>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${contactUrl}" style="display: inline-block; padding: 12px 24px; background-color: #C59B27; color: #070D19; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">💬 Connect with Engineering Team</a>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

        <div style="text-align: center; margin-bottom: 20px;">
          <a href="${servicesUrl}" style="display: inline-block; padding: 10px 18px; background-color: #0F172A; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px;">📦 Explore Enterprise IT Services</a>
        </div>
      </div>

      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
        © 2026 Kiaan Technologies · All rights reserved
      </div>
    </div>
  `;

  return exports.sendEmail({
    to,
    subject: `Technical Inquiry Received: ${svcInfo.title} - Kiaan Technologies 🚀`,
    html
  });
};

/**
 * Sends a branded Invoice & Payment Link Email to the client.
 */
exports.sendInvoiceNotificationEmail = async ({ to, clientName, amount, discount, netAmount, serviceType, checkoutUrl, portalUrl, tempPassword }) => {
  const loginUrl = portalUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/#/portal/login`;
  const paymentLink = checkoutUrl || loginUrl;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #070D19, #0B1426); padding: 24px; text-align: center; color: #ffffff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #C59B27;">Kiaan Technologies</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.85; color: #F1F5F9;">Enterprise Software Engineering & IT Solutions</p>
      </div>

      <div style="padding: 28px;">
        <h3 style="color: #1e293b; margin-top: 0; font-size: 18px;">📄 IT Project Retainer Invoice & Client Portal Account</h3>
        <p style="color: #475569; line-height: 1.6;">Dear <b>${clientName}</b>,</p>
        <p style="color: #475569; line-height: 1.6;">Welcome to Kiaan Technologies! Your project repository and account have been initialized. Please find your invoice details below:</p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #1e293b; font-size: 15px;">💳 Invoice Summary:</h4>
          <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.8;">
            <li><b>Service Track:</b> ${serviceType || 'Custom Software Engineering'}</li>
            <li><b>Base Amount:</b> €${Number(amount || 0).toLocaleString()}</li>
            ${discount > 0 ? `<li><b>Discount Applied:</b> -€${Number(discount).toLocaleString()}</li>` : ''}
            <li><b>Total Amount Due:</b> <strong style="color: #2563eb; font-size: 16px;">€${Number(netAmount || amount || 0).toLocaleString()}</strong></li>
          </ul>

          <div style="text-align: center; margin-top: 20px;">
            <a href="${paymentLink}" style="display: inline-block; padding: 12px 26px; background-color: #C59B27; color: #070D19; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">💳 Proceed to Secure Stripe Payment</a>
          </div>
        </div>

        ${tempPassword ? `
        <div style="background-color: #f1f5f9; border-left: 4px solid #4f46e5; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <h4 style="margin: 0 0 8px; color: #4f46e5; font-size: 14px;">🔐 Client Portal Access Credentials:</h4>
          <p style="margin: 4px 0; font-size: 13px; color: #334155;"><b>Portal Link:</b> <a href="${loginUrl}" style="color: #2563eb; font-weight: 600;">Access Portal Here</a></p>
          <p style="margin: 4px 0; font-size: 13px; color: #334155;"><b>Username:</b> ${to}</p>
          <p style="margin: 4px 0; font-size: 13px; color: #334155;"><b>Temporary Password:</b> <code style="background-color: #ffffff; padding: 2px 8px; border-radius: 4px; border: 1px solid #cbd5e1; font-weight: bold; color: #e11d48;">${tempPassword}</code></p>
          <p style="font-size: 11px; color: #ef4444; margin: 8px 0 0;">* Note: You can log in to upload SOW documents, inspect sprint tasks, and review milestones.</p>
        </div>
        ` : ''}

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b; line-height: 1.5;">
          If you have any questions or require assistance, please reply directly to this email or contact your assigned engineering lead.
        </p>
      </div>

      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
        © 2026 Kiaan Technologies · All rights reserved
      </div>
    </div>
  `;

  return exports.sendEmail({
    to,
    subject: `Project Invoice & Client Portal Account - Kiaan Technologies 💻`,
    html
  });
};

exports.sendPackagePaymentConfirmationEmail = async ({ clientId, paymentId }) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { client: true }
    });

    if (!payment || !payment.client) {
      console.warn('[Email Confirmation] payment or client not found for confirmation email');
      return;
    }

    const client = payment.client;
    const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Valued Client';

    // Parse snapshot
    let snapshot = payment.invoiceSnapshot;
    if (typeof snapshot === 'string') {
      try { snapshot = JSON.parse(snapshot); } catch (e) { }
    }

    if (!snapshot) {
      console.warn('[Email Confirmation] invoiceSnapshot is missing for payment:', paymentId);
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const loginUrl = `${frontendUrl}/#/portal/login`;

    const htmlBody = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #070D19, #0B1426); padding: 24px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #C59B27;">Kiaan Technologies</h2>
          <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.85; color: #F1F5F9;">Enterprise Software Engineering & IT Solutions</p>
        </div>

        <div style="padding: 28px;">
          <h3 style="color: #22c55e; margin-top: 0; font-size: 18px;">🎉 Payment Successful & Confirmed</h3>
          <p style="color: #475569; line-height: 1.6;">Dear <b>${clientName}</b>,</p>
          <p style="color: #475569; line-height: 1.6;">Thank you for your payment! We have successfully received your retainer for the selected IT engagement plan.</p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #1e293b; font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">📄 Invoice Receipt Details:</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155; line-height: 1.8;">
              <tr>
                <td style="padding: 4px 0; font-weight: 600;">Invoice Reference:</td>
                <td style="padding: 4px 0; text-align: right;">PAY-${payment.id.slice(0, 8).toUpperCase()}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600;">Selected Plan:</td>
                <td style="padding: 4px 0; text-align: right;">${snapshot.packageName}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600;">Base Plan Price:</td>
                <td style="padding: 4px 0; text-align: right;">€${Number(snapshot.basePrice).toFixed(2)}</td>
              </tr>
              <tr style="border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 0; font-weight: bold;">Subtotal:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">€${Number(snapshot.subtotal || snapshot.basePrice).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600;">VAT (${snapshot.vatRate || 5}%):</td>
                <td style="padding: 4px 0; text-align: right;">€${Number(snapshot.vatAmount || 0).toFixed(2)}</td>
              </tr>
              <tr style="font-size: 16px; border-top: 2px solid #1e293b;">
                <td style="padding: 8px 0; font-weight: bold; color: #1e293b;">Total Amount Paid:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #C59B27;">€${Number(snapshot.total).toFixed(2)}</td>
              </tr>
            </table>

            <div style="text-align: center; margin-top: 24px;">
              <a href="${loginUrl}" style="display: inline-block; padding: 12px 26px; background-color: #C59B27; color: #070D19; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">💻 Access Project Portal</a>
            </div>
          </div>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #64748b; line-height: 1.5;">
            Your official invoice receipt is now available directly in your client portal. Your dedicated Technical Lead has been notified to initiate sprint onboarding.
          </p>
        </div>

        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
          © 2026 Kiaan Technologies · All rights reserved
        </div>
      </div>
    `;

    return exports.sendEmail({
      to: client.email,
      subject: `Payment Confirmed — ${snapshot.packageName} — Kiaan Technologies 🎉`,
      html: htmlBody
    });
  } catch (error) {
    console.error('[Email Confirmation Error] Failed to prepare/send package confirmation email:', error.message);
  }
};

/**
 * Sends branded Payment Success Email for IT services and technical deliverable payments.
 */
exports.sendPaymentSuccessEmail = async ({ to, clientName, customerId, serviceType, amount, tempPassword }) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const loginUrl = `${frontendUrl}/#/portal/login`;
  const formattedAmount = Number(amount || 0).toFixed(2);

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #070D19, #0B1426); padding: 24px; text-align: center; color: #ffffff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #C59B27;">Kiaan Technologies</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.85; color: #F1F5F9;">Enterprise Software Engineering & IT Solutions</p>
      </div>

      <div style="padding: 28px;">
        <h3 style="color: #22c55e; margin-top: 0; font-size: 18px;">🎉 Payment Successful & Receipt Confirmed</h3>
        <p style="color: #475569; line-height: 1.6;">Dear <b>${clientName || 'Valued Client'}</b>,</p>
        <p style="color: #475569; line-height: 1.6;">Thank you for partnering with Kiaan Technologies. We have successfully received your payment.</p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #1e293b; font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">📄 Payment Receipt Details:</h4>
          <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.8;">
            <li><b>Customer ID:</b> <strong style="color: #2563eb;">${customerId || 'N/A'}</strong></li>
            <li><b>Service Track:</b> ${serviceType || 'IT Software Development'}</li>
            <li><b>Amount Paid:</b> <strong style="color: #22c55e; font-size: 16px;">€${formattedAmount}</strong></li>
          </ul>

          ${tempPassword ? `
          <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-top: 16px;">
            <h4 style="margin: 0 0 6px; color: #4f46e5; font-size: 14px;">🔑 Client Portal Login Credentials:</h4>
            <p style="margin: 4px 0; font-size: 13px; color: #334155;"><b>Portal Link:</b> <a href="${loginUrl}" style="color: #2563eb; font-weight: 600;">Click to Login</a></p>
            <p style="margin: 4px 0; font-size: 13px; color: #334155;"><b>Username (Email):</b> ${to}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #334155;"><b>Temporary Password:</b> <code style="background-color: #f1f5f9; padding: 2px 8px; border-radius: 4px; border: 1px solid #cbd5e1; font-weight: bold; color: #e11d48;">${tempPassword}</code></p>
          </div>
          ` : ''}

          <div style="text-align: center; margin-top: 20px;">
            <a href="${loginUrl}" style="display: inline-block; padding: 12px 26px; background-color: #C59B27; color: #070D19; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">💻 Access Project Portal</a>
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b; line-height: 1.5;">
          You can log into your client portal anytime to upload technical specifications, review milestones, and track project status in real time.
        </p>
      </div>

      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
        © 2026 Kiaan Technologies · All rights reserved
      </div>
    </div>
  `;

  return exports.sendEmail({
    to,
    subject: `Payment Confirmed [${customerId || 'Receipt'}] — Kiaan Technologies 🚀`,
    html
  });
};

exports.sendMeetingCancelledEmail = async ({ to, firstName, date, time, rebookLink }) => {
  const formattedDate = formatDateDDMMYYYY(date);
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #070D19, #0B1426); padding: 24px; text-align: center; color: #ffffff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #C59B27;">Kiaan Technologies</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.85; color: #F1F5F9;">Enterprise Software Engineering</p>
      </div>

      <div style="padding: 28px;">
        <h3 style="color: #e53e3e; margin-top: 0; font-size: 18px;">❌ Discovery Session Cancelled</h3>
        <p style="color: #4a5568; line-height: 1.6;">Dear <b>${firstName}</b>,</p>
        <p style="color: #4a5568; line-height: 1.6;">Your Technical Discovery & Scoping Session scheduled for <b>${formattedDate}</b> at <b>${time}</b> has been cancelled.</p>
        
        <p style="color: #4a5568; line-height: 1.6;">If you would like to reschedule with our solutions engineering team, please use the button below:</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${rebookLink}" style="display: inline-block; padding: 12px 24px; background-color: #C59B27; color: #070D19; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">🔄 Reschedule Discovery Call</a>
        </div>
      </div>

      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
        © 2026 Kiaan Technologies · All rights reserved
      </div>
    </div>
  `;
  return exports.sendEmail({
    to,
    subject: `Discovery Session Cancelled: Kiaan Technologies Technical Discovery ❌`,
    html
  });
};

exports.sendMeetingRescheduledEmail = async ({ to, firstName, date, time, link, rescheduleLink, cancelLink }) => {
  const formattedDate = formatDateDDMMYYYY(date);
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #070D19, #0B1426); padding: 24px; text-align: center; color: #ffffff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #C59B27;">Kiaan Technologies</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.85; color: #F1F5F9;">Enterprise Software Engineering</p>
      </div>

      <div style="padding: 28px;">
        <h3 style="color: #4f46e5; margin-top: 0; font-size: 18px;">🔄 Technical Discovery Session Rescheduled</h3>
        <p style="color: #4a5568; line-height: 1.6;">Dear <b>${firstName}</b>,</p>
        <p style="color: #4a5568; line-height: 1.6;">Your Technical Discovery & Architecture Session has been rescheduled successfully.</p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #1e293b; font-size: 15px;">📅 New Session Details:</h4>
          <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.8;">
            <li><b>Date:</b> ${formattedDate}</li>
            <li><b>Time:</b> ${time}</li>
            <li><b>Duration:</b> 20 Minutes</li>
          </ul>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <h4 style="color: #334155; margin-bottom: 12px; font-size: 14px;">⚙️ Manage Your Booking:</h4>
        <div style="margin-bottom: 20px;">
          <a href="${rescheduleLink}" style="display: inline-block; padding: 10px 18px; background-color: #C59B27; color: #070D19; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px; margin-right: 8px; margin-bottom: 8px;">🔄 Reschedule Call</a>
          <a href="${cancelLink}" style="display: inline-block; padding: 10px 18px; background-color: #ef4444; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px; margin-right: 8px; margin-bottom: 8px;">❌ Cancel Call</a>
        </div>
      </div>

      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
        © 2026 Kiaan Technologies · All rights reserved
      </div>
    </div>
  `;
  return exports.sendEmail({
    to,
    subject: `Technical Session Rescheduled: Kiaan Technologies (${formattedDate} at ${time}) 🔄`,
    html
  });
};
