const express = require('express');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { getDashboardMetrics, getRecentActivity } = require('../controllers/dashboardController');

const router = express.Router();

router.use(authMiddleware);

router.get('/metrics', getDashboardMetrics);
router.get('/recent-activity', getRecentActivity);

module.exports = router;
