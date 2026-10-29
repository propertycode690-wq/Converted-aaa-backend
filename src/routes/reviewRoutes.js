const express = require('express');
const {
  getReviews,
  getReviewStats,
  createReview,
  respondToReview,
  updateReviewStatus,
  getProviderStatuses,
  syncProviderReviews,
  updateProviderConfig
} = require('../controllers/reviewController');
const { authMiddleware, rbacMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// Enforce authentication for all review routes
router.use(authMiddleware);

// 1. Core Review Feed & Stats
router.get('/', rbacMiddleware(['super_admin', 'admin', 'operations', 'marketing']), getReviews);
router.get('/stats', rbacMiddleware(['super_admin', 'admin', 'operations', 'marketing']), getReviewStats);
router.post('/', rbacMiddleware(['super_admin', 'admin', 'operations']), createReview);

// 2. Review Response & Status Moderation
router.post('/:id/respond', rbacMiddleware(['super_admin', 'admin', 'operations', 'marketing']), respondToReview);
router.patch('/:id/status', rbacMiddleware(['super_admin', 'admin']), updateReviewStatus);

// 3. Provider Connection & Sync Management
router.get('/providers', rbacMiddleware(['super_admin', 'admin', 'operations', 'marketing']), getProviderStatuses);
router.post('/providers/:provider/sync', rbacMiddleware(['super_admin', 'admin']), syncProviderReviews);
router.post('/providers/:provider/config', rbacMiddleware(['super_admin']), updateProviderConfig); // SuperAdmin only

module.exports = router;

