const reviewService = require('../services/reviewService');

/**
 * GET /api/v1/reviews
 * Fetches paginated reviews with filters.
 */
const getReviews = async (req, res) => {
  try {
    const data = await reviewService.getReviews(req.query);
    res.json(data);
  } catch (err) {
    console.error('Error fetching reviews:', err.message);
    res.status(500).json({ message: 'Failed to retrieve reviews.' });
  }
};

/**
 * GET /api/v1/reviews/stats
 * Fetches aggregated review metrics (rating, sentiment, platform, response rate).
 */
const getReviewStats = async (req, res) => {
  try {
    const includeDemo = req.query.includeDemo === 'true' || req.query.includeDemo === true;
    const stats = await reviewService.getReviewStats(includeDemo);
    res.json(stats);
  } catch (err) {
    console.error('Error fetching review stats:', err.message);
    res.status(500).json({ message: 'Failed to retrieve review statistics.' });
  }
};

/**
 * POST /api/v1/reviews
 * Creates a verified manual review or imported review.
 */
const createReview = async (req, res) => {
  try {
    const review = await reviewService.createReview(req.body, req.user?.id);
    res.status(201).json({
      message: 'Review created successfully.',
      review
    });
  } catch (err) {
    if (err.code === 'CONFLICT') {
      return res.status(409).json({ message: err.message });
    }
    if (err.message && err.message.includes('Rating') || err.message.includes('provider')) {
      return res.status(400).json({ message: err.message });
    }
    console.error('Error creating review:', err.message);
    res.status(500).json({ message: 'Failed to create review.' });
  }
};

/**
 * POST /api/v1/reviews/:id/respond
 * Submits an official company reply to a review.
 */
const respondToReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { responseText } = req.body;

    if (!responseText || typeof responseText !== 'string' || !responseText.trim()) {
      return res.status(400).json({ message: 'Response text is required and cannot be empty.' });
    }

    const updated = await reviewService.respondToReview(id, responseText, req.user?.id);
    res.json({
      message: 'Response posted successfully.',
      review: updated
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ message: err.message });
    }
    console.error('Error responding to review:', err.message);
    res.status(500).json({ message: 'Failed to post review response.' });
  }
};

/**
 * PATCH /api/v1/reviews/:id/status
 * Moderates review visibility (PUBLISHED, HIDDEN, FLAGGED).
 */
const updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['PUBLISHED', 'HIDDEN', 'FLAGGED'].includes(status)) {
      return res.status(400).json({ message: 'Status must be one of: PUBLISHED, HIDDEN, FLAGGED' });
    }

    const updated = await reviewService.updateReviewStatus(id, status);
    res.json({
      message: `Review status updated to ${status}.`,
      review: updated
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ message: err.message });
    }
    console.error('Error updating review status:', err.message);
    res.status(500).json({ message: 'Failed to update review status.' });
  }
};

/**
 * GET /api/v1/reviews/providers
 * Returns all provider connection statuses (secrets masked).
 */
const getProviderStatuses = async (req, res) => {
  try {
    const statuses = await reviewService.getProviderStatuses();
    res.json(statuses);
  } catch (err) {
    console.error('Error fetching provider statuses:', err.message);
    res.status(500).json({ message: 'Failed to retrieve provider connection statuses.' });
  }
};

/**
 * POST /api/v1/reviews/providers/:provider/sync
 * Triggers a synchronization attempt for a given provider.
 */
const syncProviderReviews = async (req, res) => {
  try {
    const provider = req.params.provider?.toUpperCase();
    const adapter = reviewService.providerAdapters[provider];

    if (!adapter) {
      return res.status(400).json({ message: `Unknown provider: ${provider}` });
    }

    // Clutch is manual only
    if (provider === 'CLUTCH') {
      return res.status(200).json({
        provider,
        status: 'MANUAL_ONLY',
        message: 'Clutch REST API is restricted to Enterprise partners. Please import reviews via CSV or manual entry.'
      });
    }

    const syncResult = await adapter.syncReviews();
    res.json({
      provider,
      ...syncResult
    });
  } catch (err) {
    console.error('Error syncing provider reviews:', err.message);
    res.status(500).json({ message: 'Failed to synchronize provider reviews.' });
  }
};

/**
 * POST /api/v1/reviews/providers/:provider/config
 * Sets encrypted API credentials for a review provider (SuperAdmin only).
 */
const updateProviderConfig = async (req, res) => {
  try {
    const provider = req.params.provider?.toUpperCase();
    if (!['GOOGLE', 'META', 'CLUTCH', 'TRUSTPILOT'].includes(provider)) {
      return res.status(400).json({ message: 'Invalid provider name.' });
    }

    const result = await reviewService.updateProviderConfig(provider, req.body);
    res.json({
      message: `${provider} provider configuration updated successfully.`,
      config: result
    });
  } catch (err) {
    console.error('Error updating provider configuration:', err.message);
    res.status(500).json({ message: 'Failed to update provider configuration: ' + err.message });
  }
};

module.exports = {
  getReviews,
  getReviewStats,
  createReview,
  respondToReview,
  updateReviewStatus,
  getProviderStatuses,
  syncProviderReviews,
  updateProviderConfig
};

