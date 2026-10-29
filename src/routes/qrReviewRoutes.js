/**
 * qrReviewRoutes.js — Smart QR Review & Complaint Management API Routes
 *
 * Mounts public customer endpoints and authenticated CRM management endpoints.
 */

'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  // Public
  resolvePublicQr,
  trackPublicClick,
  submitPublicFeedback,

  // Authenticated Management
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
} = require('../controllers/qrReviewController');

const { authMiddleware, rbacMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// ==========================================
// 1. PUBLIC RATE LIMITERS
// ==========================================

const publicScanLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again shortly.' }
});

const publicFeedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 submissions per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Submission limit reached. Please try again in 15 minutes.' }
});

// ==========================================
// 2. PUBLIC ENDPOINTS (UNAUTHENTICATED)
// ==========================================

router.get('/public/qr/:slug', publicScanLimiter, resolvePublicQr);
router.post('/public/track-click', trackPublicClick);
router.post('/public/feedback', publicFeedbackLimiter, submitPublicFeedback);

// ==========================================
// 3. AUTHENTICATED MANAGEMENT ENDPOINTS
// ==========================================

// Enforce JWT authentication for all management endpoints
router.use(authMiddleware);

// Restrict to authorized CRM manager roles
const managerRbac = rbacMiddleware(['super_admin', 'admin', 'operations', 'marketing']);

// QR Code Management
router.get('/qr-codes', managerRbac, getQrCodes);
router.get('/qr-codes/:id', managerRbac, getQrCodeById);
router.post('/qr-codes', managerRbac, createQrCode);
router.patch('/qr-codes/:id', managerRbac, updateQrCode);
router.delete('/qr-codes/:id', managerRbac, deleteQrCode);
router.get('/qr-codes/:id/download-svg', managerRbac, downloadQrSvg);

// Customer Feedback Feed
router.get('/feedbacks', managerRbac, getFeedbacks);

// Complaint Resolution
router.get('/complaints', managerRbac, getComplaints);
router.patch('/complaints/:id', managerRbac, updateComplaint);
router.post('/complaints/:id/notes', managerRbac, addComplaintNote);

// Analytics & Telemetry Summary
router.get('/analytics/summary', managerRbac, getQrAnalyticsSummary);

// Branding & Google Review Settings
router.get('/settings', managerRbac, getQrSettings);
router.put('/settings', managerRbac, updateQrSettings);

module.exports = router;

