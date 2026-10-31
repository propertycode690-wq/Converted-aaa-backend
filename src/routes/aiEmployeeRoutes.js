/**
 * Routes for 7 Autonomous AI Employees Control Center
 */

const express = require('express');
const router = express.Router();
const aiEmployeeController = require('../controllers/aiEmployeeController');
const { authMiddleware, rbacMiddleware } = require('../middlewares/authMiddleware');

// Roles permitted to view AI control center
const allowedRoles = ['super_admin', 'admin', 'operations', 'marketing', 'consultant'];

router.get('/overview', authMiddleware, rbacMiddleware(allowedRoles), (req, res) => aiEmployeeController.getOverview(req, res));
router.get('/agents', authMiddleware, rbacMiddleware(allowedRoles), (req, res) => aiEmployeeController.getAgents(req, res));
router.patch('/agents/:id/status', authMiddleware, rbacMiddleware(['super_admin', 'admin']), (req, res) => aiEmployeeController.updateAgentStatus(req, res));
router.post('/agents/:id/trigger', authMiddleware, rbacMiddleware(allowedRoles), (req, res) => aiEmployeeController.triggerAgentNow(req, res));

router.get('/tasks', authMiddleware, rbacMiddleware(allowedRoles), (req, res) => aiEmployeeController.getTasks(req, res));
router.get('/approvals', authMiddleware, rbacMiddleware(allowedRoles), (req, res) => aiEmployeeController.getApprovals(req, res));
router.post('/approvals/:id/decide', authMiddleware, rbacMiddleware(['super_admin', 'admin', 'operations']), (req, res) => aiEmployeeController.decideApproval(req, res));

router.get('/health', authMiddleware, rbacMiddleware(allowedRoles), (req, res) => aiEmployeeController.getHealth(req, res));
router.post('/ceo-briefing', authMiddleware, rbacMiddleware(allowedRoles), (req, res) => aiEmployeeController.getCeoBriefing(req, res));

module.exports = router;

