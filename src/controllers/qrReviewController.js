/**
 * qrReviewController.js — Smart QR Review & Complaint Management Controller
 *
 * Implements both public customer interactions (scan resolution, telemetry, private feedback)
 * and authenticated business management endpoints (QR codes, complaints, analytics, settings).
 */

'use strict';

const crypto = require('crypto');
const Joi = require('joi');
const prisma = require('../config/db');
const { generateQrSvg } = require('../utils/qrGenerator');

// ==========================================
// HELPER FUNCTIONS & TENANT RESOLUTION
// ==========================================

/**
 * Resolves tenant identity securely from authenticated JWT payload.
 * NEVER trusts client-supplied query string or body tenantId.
 * NEVER silently assigns all users to the same shared 'default' tenant.
 */
function resolveTenantId(req) {
  if (req.user?.tenantId && typeof req.user.tenantId === 'string' && req.user.tenantId.trim()) {
    return req.user.tenantId.trim();
  }

  if (req.user?.email && req.user.email.toLowerCase().endsWith('@aaaconsultancy.com')) {
    return 'tenant_aaa_consultancy';
  }

  if (req.user?.id) {
    return `tenant_user_${req.user.id}`;
  }

  const err = new Error('UNAUTHORIZED_TENANT: Missing valid tenant affiliation in authentication token.');
  err.statusCode = 403;
  throw err;
}

/**
 * Deterministic sentiment classifier for customer rating and comments.
 */
function evaluateSentiment(rating, text = '') {
  const content = String(text || '').toLowerCase();
  const strongNegativeKeywords = ['terrible', 'worst', 'bad', 'horrible', 'rude', 'dirty', 'slow', 'cold', 'hair', 'scam', 'avoid', 'disappointing'];
  const strongPositiveKeywords = ['excellent', 'amazing', 'great', 'delicious', 'friendly', 'fast', 'clean', 'wonderful', 'best', 'loved'];

  const hasNegative = strongNegativeKeywords.some(kw => content.includes(kw));
  const hasPositive = strongPositiveKeywords.some(kw => content.includes(kw));

  if (rating >= 4) {
    return hasNegative ? 'NEUTRAL' : 'POSITIVE';
  } else if (rating === 3) {
    if (hasPositive && !hasNegative) return 'POSITIVE';
    if (hasNegative && !hasPositive) return 'NEGATIVE';
    return 'NEUTRAL';
  } else {
    // 1 or 2 stars
    return hasPositive && !hasNegative ? 'NEUTRAL' : 'NEGATIVE';
  }
}

/**
 * Collision-safe unique complaint ticket number generator.
 * Format: CMP-YYYY-XXXX (where XXXX is random uppercase alphanumeric)
 */
function generateTicketNumber() {
  const year = new Date().getFullYear();
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  return `CMP-${year}-${randomSuffix}`;
}

// ==========================================
// 1. PUBLIC UNAUTHENTICATED ENDPOINTS
// ==========================================

/**
 * GET /api/v1/reviews/qr-hub/public/qr/:slug
 * Resolves public QR destination and branding, atomically recording a scan event.
 */
const resolvePublicQr = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'QR slug is required.' });
    }

    const cleanSlug = slug.trim().toLowerCase();
    const qrCode = await prisma.qrCode.findUnique({
      where: { slug: cleanSlug }
    });

    if (!qrCode || !qrCode.isActive) {
      return res.status(404).json({ success: false, message: 'QR Code not found or has been deactivated.' });
    }

    // 1. Atomically increment scan count
    await prisma.qrCode.update({
      where: { id: qrCode.id },
      data: { scanCount: { increment: 1 } }
    });

    // 2. Asynchronously log QR_SCAN event (non-blocking)
    const deviceType = req.headers['user-agent']?.toLowerCase().includes('mobile') ? 'mobile' : 'desktop';
    const referrer = req.headers['referer'] || null;
    const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex').substring(0, 32);

    prisma.qrAnalyticsEvent.create({
      data: {
        tenantId: qrCode.tenantId,
        qrCodeId: qrCode.id,
        eventType: 'QR_SCAN',
        deviceType,
        referrer,
        ipHash
      }
    }).catch(err => console.warn('[QR Scan Telemetry Warn]:', err.message));

    // 3. Fetch branding settings
    let settings = await prisma.qrBusinessSetting.findUnique({
      where: { tenantId: qrCode.tenantId }
    });

    if (!settings) {
      settings = {
        businessName: 'My Business',
        businessType: 'RESTAURANT',
        logoUrl: null,
        primaryColor: '#2563EB',
        googlePlaceId: null,
        googleReviewUrl: null,
        welcomeMessage: 'Welcome! We value your feedback.',
        privateFeedbackHeader: 'How was your experience today?'
      };
    }

    return res.json({
      success: true,
      qrCode: {
        id: qrCode.id,
        slug: qrCode.slug,
        codeLabel: qrCode.codeLabel,
        locationName: qrCode.locationName,
        targetType: qrCode.targetType
      },
      business: {
        businessName: settings.businessName,
        businessType: settings.businessType,
        logoUrl: settings.logoUrl,
        primaryColor: settings.primaryColor || '#2563EB',
        googleReviewUrl: qrCode.googleReviewUrl || settings.googleReviewUrl,
        welcomeMessage: settings.welcomeMessage || 'Welcome! We value your feedback.',
        privateFeedbackHeader: settings.privateFeedbackHeader || 'How was your experience today?'
      }
    });
  } catch (error) {
    console.error('Error resolving public QR code:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to resolve QR code.' });
  }
};

/**
 * POST /api/v1/reviews/qr-hub/public/track-click
 * Logs customer intent to review on Google. Clearly distinguished from a published review.
 */
const trackPublicClick = async (req, res) => {
  try {
    const { slug, deviceType } = req.body;
    if (!slug) {
      return res.status(400).json({ success: false, message: 'QR slug is required.' });
    }

    const cleanSlug = String(slug).trim().toLowerCase();
    const qrCode = await prisma.qrCode.findUnique({
      where: { slug: cleanSlug }
    });

    if (!qrCode || !qrCode.isActive) {
      return res.status(404).json({ success: false, message: 'QR Code not found or inactive.' });
    }

    // 1. Atomically increment intent click count
    await prisma.qrCode.update({
      where: { id: qrCode.id },
      data: { googleReviewClicks: { increment: 1 } }
    });

    // 2. Log intent telemetry event
    const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex').substring(0, 32);
    await prisma.qrAnalyticsEvent.create({
      data: {
        tenantId: qrCode.tenantId,
        qrCodeId: qrCode.id,
        eventType: 'GOOGLE_REVIEW_CLICK',
        deviceType: deviceType || 'mobile',
        referrer: req.headers['referer'] || null,
        ipHash
      }
    });

    return res.json({
      success: true,
      message: 'Google review link intent recorded successfully.'
    });
  } catch (error) {
    console.error('Error recording Google review click:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to record click.' });
  }
};

/**
 * POST /api/v1/reviews/qr-hub/public/feedback
 * Accepts customer private feedback. Auto-creates a complaint ticket if rating <= 3.
 */
const submitPublicFeedback = async (req, res) => {
  try {
    // 1. Anti-bot honeypot check: if user_website is filled, silently ignore
    if (req.body.user_website) {
      return res.json({ success: true, message: 'Thank you for your feedback!' });
    }

    // 2. Validate input schema
    const schema = Joi.object({
      slug: Joi.string().required(),
      rating: Joi.number().integer().min(1).max(5).required(),
      feedbackCategory: Joi.string().max(100).allow(null, '').optional(),
      feedbackText: Joi.string().max(2000).allow(null, '').optional(),
      customerName: Joi.string().max(100).allow(null, '').optional(),
      customerEmail: Joi.string().email().max(191).allow(null, '').optional(),
      customerPhone: Joi.string().max(50).allow(null, '').optional(),
      deviceFingerprint: Joi.string().max(191).allow(null, '').optional(),
      user_website: Joi.string().allow(null, '').optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const { slug, rating, feedbackCategory, feedbackText, customerName, customerEmail, customerPhone, deviceFingerprint } = value;

    const qrCode = await prisma.qrCode.findUnique({
      where: { slug: slug.trim().toLowerCase() }
    });

    if (!qrCode || !qrCode.isActive) {
      return res.status(404).json({ success: false, message: 'QR Code not found or inactive.' });
    }

    const sentiment = evaluateSentiment(rating, feedbackText);
    const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex').substring(0, 32);

    // 3. Atomic Database Transaction: Save feedback, increment counter, create complaint if negative
    const [feedback, complaint] = await prisma.$transaction(async (tx) => {
      // Create feedback
      const fb = await tx.customerFeedback.create({
        data: {
          tenantId: qrCode.tenantId,
          qrCodeId: qrCode.id,
          rating,
          feedbackCategory: feedbackCategory || 'General',
          customerName: customerName ? customerName.trim() : null,
          customerEmail: customerEmail ? customerEmail.trim().toLowerCase() : null,
          customerPhone: customerPhone ? customerPhone.trim() : null,
          feedbackText: feedbackText ? feedbackText.trim() : null,
          sentiment,
          deviceFingerprint: deviceFingerprint || null
        }
      });

      // Increment feedback submission counter on QR code
      await tx.qrCode.update({
        where: { id: qrCode.id },
        data: { feedbackSubmissions: { increment: 1 } }
      });

      // Log analytics event
      await tx.qrAnalyticsEvent.create({
        data: {
          tenantId: qrCode.tenantId,
          qrCodeId: qrCode.id,
          eventType: 'PRIVATE_FEEDBACK_SUBMIT',
          deviceType: req.headers['user-agent']?.toLowerCase().includes('mobile') ? 'mobile' : 'desktop',
          referrer: req.headers['referer'] || null,
          ipHash
        }
      });

      // If rating <= 3, automatically escalate to an internal complaint ticket
      let comp = null;
      if (rating <= 3) {
        let ticketNumber = generateTicketNumber();
        // Check collision (rare)
        const existingTicket = await tx.customerComplaint.findUnique({ where: { ticketNumber } });
        if (existingTicket) {
          ticketNumber = generateTicketNumber() + 'A';
        }

        comp = await tx.customerComplaint.create({
          data: {
            tenantId: qrCode.tenantId,
            ticketNumber,
            feedbackId: fb.id,
            qrCodeId: qrCode.id,
            priority: rating === 1 ? 'CRITICAL' : 'HIGH',
            status: 'OPEN',
            issueCategory: feedbackCategory || 'Customer Dissatisfaction',
            customerName: customerName ? customerName.trim() : 'Anonymous Customer',
            customerContact: customerPhone || customerEmail || 'No contact provided',
            description: feedbackText || `Customer left a ${rating}-star rating with no text comment.`,
            internalNotes: []
          }
        });
      }

      return [fb, comp];
    });

    // 4. Outside transaction: Trigger In-App Real-time Notification
    if (complaint) {
      try {
        const io = req.app.get('io');
        const notifTitle = `⚠️ Negative Feedback Ticket: ${complaint.ticketNumber}`;
        const notifBody = `${complaint.issueCategory} issue reported at ${qrCode.codeLabel} (${rating}★). Immediate attention required.`;

        if (io) {
          io.to('role:admin').to('role:operations').emit('new-notification', {
            type: 'new_complaint',
            title: notifTitle,
            body: notifBody,
            ticketId: complaint.id,
            ticketNumber: complaint.ticketNumber
          });
        }

        // Persist internal CRM notification for all admin/operations staff
        const staff = await prisma.user.findMany({
          where: { role: { in: ['super_admin', 'admin', 'operations'] } },
          select: { id: true }
        });

        if (staff.length > 0) {
          await prisma.notification.createMany({
            data: staff.map(s => ({
              userId: s.id,
              type: 'complaint_alert',
              title: notifTitle,
              body: notifBody,
              isRead: false
            })),
            skipDuplicates: true
          });
        }
      } catch (notifErr) {
        console.warn('[Complaint Notification Warn]:', notifErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Thank you for your feedback! It helps us improve our service.',
      feedbackId: feedback.id,
      ticketCreated: Boolean(complaint),
      ticketNumber: complaint?.ticketNumber || null
    });
  } catch (error) {
    console.error('Error submitting customer feedback:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to record feedback.' });
  }
};

// ==========================================
// 2. AUTHENTICATED MANAGEMENT ENDPOINTS
// ==========================================

/**
 * GET /api/v1/reviews/qr-hub/qr-codes
 * Lists all QR codes for the current tenant.
 */
const getQrCodes = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { page = 1, limit = 20, search, status, location } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = { tenantId };
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (location && location !== 'ALL') where.locationName = location;

    if (search && search.trim()) {
      where.OR = [
        { codeLabel: { contains: search.trim() } },
        { slug: { contains: search.trim() } },
        { locationName: { contains: search.trim() } },
        { campaignName: { contains: search.trim() } }
      ];
    }

    const [total, qrCodes] = await Promise.all([
      prisma.qrCode.count({ where }),
      prisma.qrCode.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // Attach computed landing URLs
    const baseUrl = process.env.PUBLIC_CRM_URL || 'https://crm.kiaantechnology.com';
    const enhancedCodes = qrCodes.map(code => ({
      ...code,
      publicUrl: `${baseUrl}/r/${code.slug}`
    }));

    return res.json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / take),
      qrCodes: enhancedCodes
    });
  } catch (error) {
    console.error('Error fetching QR codes:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve QR codes.' });
  }
};

/**
 * GET /api/v1/reviews/qr-hub/qr-codes/:id
 * Fetches a single QR code and renders on-the-fly SVG markup.
 */
const getQrCodeById = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const qrCode = await prisma.qrCode.findFirst({
      where: { id, tenantId }
    });

    if (!qrCode) {
      return res.status(404).json({ success: false, message: 'QR Code not found.' });
    }

    const baseUrl = process.env.PUBLIC_CRM_URL || 'https://crm.kiaantechnology.com';
    const publicUrl = `${baseUrl}/r/${qrCode.slug}`;
    const svgData = generateQrSvg(publicUrl);

    return res.json({
      success: true,
      qrCode: {
        ...qrCode,
        publicUrl,
        svgData
      }
    });
  } catch (error) {
    console.error('Error fetching QR code by ID:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve QR code.' });
  }
};

/**
 * POST /api/v1/reviews/qr-hub/qr-codes
 * Creates a new QR code for a location, table, or campaign.
 */
const createQrCode = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    const schema = Joi.object({
      codeLabel: Joi.string().max(191).required(),
      locationName: Joi.string().max(191).allow(null, '').optional(),
      campaignName: Joi.string().max(191).allow(null, '').optional(),
      targetType: Joi.string().valid('REVIEW_PAGE', 'DIRECT_GOOGLE').default('REVIEW_PAGE'),
      googleReviewUrl: Joi.string().uri().allow(null, '').optional(),
      customSlug: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(3).max(50).allow(null, '').optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const { codeLabel, locationName, campaignName, targetType, googleReviewUrl, customSlug } = value;

    // Generate unique slug
    let slug = customSlug
      ? customSlug.toLowerCase()
      : codeLabel.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30) + '-' + crypto.randomBytes(2).toString('hex');

    // Verify slug uniqueness
    const existing = await prisma.qrCode.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
    }

    const baseUrl = process.env.PUBLIC_CRM_URL || 'https://crm.kiaantechnology.com';
    const destinationUrl = `${baseUrl}/r/${slug}`;

    const newCode = await prisma.qrCode.create({
      data: {
        tenantId,
        slug,
        codeLabel: codeLabel.trim(),
        locationName: locationName ? locationName.trim() : null,
        campaignName: campaignName ? campaignName.trim() : null,
        targetType: targetType || 'REVIEW_PAGE',
        destinationUrl,
        googleReviewUrl: googleReviewUrl || null,
        isActive: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'QR Code created successfully.',
      qrCode: {
        ...newCode,
        publicUrl: destinationUrl,
        svgData: generateQrSvg(destinationUrl)
      }
    });
  } catch (error) {
    console.error('Error creating QR code:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create QR code.' });
  }
};

/**
 * PATCH /api/v1/reviews/qr-hub/qr-codes/:id
 * Updates label, location, campaign, or status of an existing QR code.
 */
const updateQrCode = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const existing = await prisma.qrCode.findFirst({
      where: { id, tenantId }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'QR Code not found.' });
    }

    const schema = Joi.object({
      codeLabel: Joi.string().max(191).optional(),
      locationName: Joi.string().max(191).allow(null, '').optional(),
      campaignName: Joi.string().max(191).allow(null, '').optional(),
      googleReviewUrl: Joi.string().uri().allow(null, '').optional(),
      isActive: Joi.boolean().optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const updated = await prisma.qrCode.update({
      where: { id },
      data: value
    });

    return res.json({
      success: true,
      message: 'QR Code updated successfully.',
      qrCode: updated
    });
  } catch (error) {
    console.error('Error updating QR code:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update QR code.' });
  }
};

/**
 * DELETE /api/v1/reviews/qr-hub/qr-codes/:id
 * Safely deletes a QR code (linked feedback and complaints retain records with NULL qrCodeId).
 */
const deleteQrCode = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const existing = await prisma.qrCode.findFirst({
      where: { id, tenantId }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'QR Code not found.' });
    }

    await prisma.qrCode.delete({
      where: { id }
    });

    return res.json({
      success: true,
      message: 'QR Code deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting QR code:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete QR code.' });
  }
};

/**
 * GET /api/v1/reviews/qr-hub/qr-codes/:id/download-svg
 * Directly serves the SVG file for download or printing.
 */
const downloadQrSvg = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const qrCode = await prisma.qrCode.findFirst({
      where: { id, tenantId }
    });

    if (!qrCode) {
      return res.status(404).json({ success: false, message: 'QR Code not found.' });
    }

    const baseUrl = process.env.PUBLIC_CRM_URL || 'https://crm.kiaantechnology.com';
    const publicUrl = `${baseUrl}/r/${qrCode.slug}`;
    const svg = generateQrSvg(publicUrl);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="qr-${qrCode.slug}.svg"`);
    return res.send(svg);
  } catch (error) {
    console.error('Error downloading QR SVG:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to download SVG.' });
  }
};

// ==========================================
// 3. CUSTOMER FEEDBACK MANAGEMENT
// ==========================================

/**
 * GET /api/v1/reviews/qr-hub/feedbacks
 * Lists paginated private customer feedback with filters.
 */
const getFeedbacks = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { page = 1, limit = 20, rating, sentiment, qrCodeId, search } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = { tenantId };
    if (rating && rating !== 'ALL') where.rating = Number(rating);
    if (sentiment && sentiment !== 'ALL') where.sentiment = sentiment;
    if (qrCodeId && qrCodeId !== 'ALL') where.qrCodeId = qrCodeId;

    if (search && search.trim()) {
      where.OR = [
        { customerName: { contains: search.trim() } },
        { customerEmail: { contains: search.trim() } },
        { feedbackText: { contains: search.trim() } },
        { feedbackCategory: { contains: search.trim() } }
      ];
    }

    const [total, feedbacks] = await Promise.all([
      prisma.customerFeedback.count({ where }),
      prisma.customerFeedback.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          qrCode: {
            select: { id: true, codeLabel: true, locationName: true, slug: true }
          },
          complaint: {
            select: { id: true, ticketNumber: true, status: true, priority: true }
          }
        }
      })
    ]);

    return res.json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / take),
      feedbacks
    });
  } catch (error) {
    console.error('Error fetching feedbacks:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve customer feedbacks.' });
  }
};

// ==========================================
// 4. COMPLAINT TICKETING & RESOLUTION
// ==========================================

/**
 * GET /api/v1/reviews/qr-hub/complaints
 * Lists complaint tickets with status, priority, and search filters.
 */
const getComplaints = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { page = 1, limit = 20, status, priority, search } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = { tenantId };
    if (status && status !== 'ALL') where.status = status;
    if (priority && priority !== 'ALL') where.priority = priority;

    if (search && search.trim()) {
      where.OR = [
        { ticketNumber: { contains: search.trim() } },
        { customerName: { contains: search.trim() } },
        { customerContact: { contains: search.trim() } },
        { issueCategory: { contains: search.trim() } },
        { description: { contains: search.trim() } }
      ];
    }

    const [total, complaints] = await Promise.all([
      prisma.customerComplaint.count({ where }),
      prisma.customerComplaint.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          qrCode: { select: { codeLabel: true, locationName: true } },
          feedback: { select: { rating: true, feedbackText: true, createdAt: true } }
        }
      })
    ]);

    return res.json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / take),
      complaints
    });
  } catch (error) {
    console.error('Error fetching complaints:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve complaints.' });
  }
};

/**
 * PATCH /api/v1/reviews/qr-hub/complaints/:id
 * Updates complaint status, priority, assignment, or resolution notes.
 */
const updateComplaint = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const existing = await prisma.customerComplaint.findFirst({
      where: { id, tenantId }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Complaint ticket not found.' });
    }

    const schema = Joi.object({
      status: Joi.string().valid('OPEN', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED').optional(),
      priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
      assignedToId: Joi.string().allow(null, '').optional(),
      resolutionNotes: Joi.string().allow(null, '').optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const dataToUpdate = { ...value };
    if (value.status === 'RESOLVED' || value.status === 'DISMISSED') {
      dataToUpdate.resolvedAt = new Date();
    }

    const updated = await prisma.customerComplaint.update({
      where: { id },
      data: dataToUpdate
    });

    return res.json({
      success: true,
      message: 'Complaint updated successfully.',
      complaint: updated
    });
  } catch (error) {
    console.error('Error updating complaint:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update complaint.' });
  }
};

/**
 * POST /api/v1/reviews/qr-hub/complaints/:id/notes
 * Appends an internal staff note to a complaint ticket.
 */
const addComplaintNote = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;
    const { text } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Note text is required.' });
    }

    const existing = await prisma.customerComplaint.findFirst({
      where: { id, tenantId }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const currentNotes = Array.isArray(existing.internalNotes) ? existing.internalNotes : [];
    const newNote = {
      id: crypto.randomUUID(),
      authorName: req.user?.fullName || req.user?.name || 'Staff Member',
      authorRole: req.user?.role || 'admin',
      text: text.trim(),
      createdAt: new Date().toISOString()
    };

    const updated = await prisma.customerComplaint.update({
      where: { id },
      data: {
        internalNotes: [...currentNotes, newNote]
      }
    });

    return res.json({
      success: true,
      message: 'Internal note added successfully.',
      notes: updated.internalNotes
    });
  } catch (error) {
    console.error('Error adding complaint note:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add note.' });
  }
};

// ==========================================
// 5. QR & FEEDBACK ANALYTICS SUMMARY
// ==========================================

/**
 * GET /api/v1/reviews/qr-hub/analytics/summary
 * Computes telemetry KPIs: scans, intent clicks, feedback count, ratings, conversion rate.
 */
const getQrAnalyticsSummary = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    const [
      totalScans,
      totalGoogleClicks,
      totalFeedbacks,
      feedbacks,
      complaints,
      qrCodes
    ] = await Promise.all([
      prisma.qrAnalyticsEvent.count({ where: { tenantId, eventType: 'QR_SCAN' } }),
      prisma.qrAnalyticsEvent.count({ where: { tenantId, eventType: 'GOOGLE_REVIEW_CLICK' } }),
      prisma.qrAnalyticsEvent.count({ where: { tenantId, eventType: 'PRIVATE_FEEDBACK_SUBMIT' } }),
      prisma.customerFeedback.findMany({
        where: { tenantId },
        select: { rating: true, sentiment: true, createdAt: true }
      }),
      prisma.customerComplaint.findMany({
        where: { tenantId },
        select: { status: true, priority: true }
      }),
      prisma.qrCode.findMany({
        where: { tenantId },
        select: { id: true, codeLabel: true, scanCount: true, googleReviewClicks: true, feedbackSubmissions: true }
      })
    ]);

    // Average rating
    const avgRating = feedbacks.length > 0
      ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)
      : '0.0';

    // Rating distribution
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const sentimentBreakdown = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };

    for (let f of feedbacks) {
      if (ratingDistribution[f.rating] !== undefined) ratingDistribution[f.rating]++;
      if (sentimentBreakdown[f.sentiment] !== undefined) sentimentBreakdown[f.sentiment]++;
    }

    // Complaints metrics
    const complaintsSummary = {
      total: complaints.length,
      open: complaints.filter(c => c.status === 'OPEN').length,
      inProgress: complaints.filter(c => c.status === 'IN_PROGRESS' || c.status === 'UNDER_REVIEW').length,
      resolved: complaints.filter(c => c.status === 'RESOLVED' || c.status === 'DISMISSED').length
    };

    // Overall Conversion Rate: (Google Clicks + Feedback) / Max(1, Scans)
    const effectiveScans = Math.max(1, totalScans);
    const conversionRate = (((totalGoogleClicks + totalFeedbacks) / effectiveScans) * 100).toFixed(1);

    return res.json({
      success: true,
      summary: {
        totalScans,
        totalGoogleClicks,
        totalFeedbacks,
        conversionRate: Number(conversionRate),
        averagePrivateRating: Number(avgRating),
        ratingDistribution,
        sentimentBreakdown,
        complaintsSummary,
        activeQrCount: qrCodes.length,
        topQrCodes: qrCodes.sort((a, b) => b.scanCount - a.scanCount).slice(0, 5)
      }
    });
  } catch (error) {
    console.error('Error fetching QR analytics summary:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve analytics summary.' });
  }
};

// ==========================================
// 6. BRANDING & GOOGLE REVIEW SETTINGS
// ==========================================

/**
 * GET /api/v1/reviews/qr-hub/settings
 * Retrieves branding and Google Place review configuration.
 */
const getQrSettings = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    let settings = await prisma.qrBusinessSetting.findUnique({
      where: { tenantId }
    });

    if (!settings) {
      settings = await prisma.qrBusinessSetting.create({
        data: {
          tenantId,
          businessName: 'My Business',
          businessType: 'RESTAURANT',
          primaryColor: '#2563EB',
          welcomeMessage: 'Welcome! We value your feedback.',
          privateFeedbackHeader: 'How was your experience today?'
        }
      });
    }

    return res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error fetching QR settings:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve settings.' });
  }
};

/**
 * PUT /api/v1/reviews/qr-hub/settings
 * Updates business branding and review preferences.
 */
const updateQrSettings = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    const schema = Joi.object({
      businessName: Joi.string().max(191).required(),
      businessType: Joi.string().max(50).default('RESTAURANT'),
      logoUrl: Joi.string().uri().allow(null, '').optional(),
      primaryColor: Joi.string().max(20).default('#2563EB'),
      googlePlaceId: Joi.string().max(191).allow(null, '').optional(),
      googleReviewUrl: Joi.string().uri().allow(null, '').optional(),
      welcomeMessage: Joi.string().max(500).allow(null, '').optional(),
      privateFeedbackHeader: Joi.string().max(500).allow(null, '').optional(),
      notifyEmail: Joi.string().email().allow(null, '').optional(),
      notifyWhatsapp: Joi.string().max(50).allow(null, '').optional(),
      notifyOnNegativeFeedback: Joi.boolean().default(true)
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    // Generate Google Review URL if Google Place ID provided but review URL empty
    if (value.googlePlaceId && !value.googleReviewUrl) {
      value.googleReviewUrl = `https://search.google.com/local/writereview?placeid=${value.googlePlaceId.trim()}`;
    }

    const updated = await prisma.qrBusinessSetting.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ...value
      },
      update: value
    });

    return res.json({
      success: true,
      message: 'Branding and review settings updated successfully.',
      settings: updated
    });
  } catch (error) {
    console.error('Error updating QR settings:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
};

module.exports = {
  // Public handlers
  resolvePublicQr,
  trackPublicClick,
  submitPublicFeedback,

  // Authenticated management handlers
  getQrCodes,
  getQrCodeById,
  createQrCode,
  updateQrCode,
  deleteQrCode,
  downloadQrSvg,
  getFeedbacks,
  getComplaints,
  updateComplaint,
  addComplaintNote,
  getQrAnalyticsSummary,
  getQrSettings,
  updateQrSettings
};
