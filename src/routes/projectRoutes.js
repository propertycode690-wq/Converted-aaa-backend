const express = require('express');
const { authMiddleware, rbacMiddleware } = require('../middlewares/authMiddleware');
const {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  createTask,
  updateTask,
  deleteTask,
  logTime,
  deleteTimeLog,
  createHandover,
  signOffHandover
} = require('../controllers/projectController');

const router = express.Router();

// Apply authentication to all project routes
router.use(authMiddleware);

// Project Core Routes
router.route('/')
  .get(getProjects)
  .post(rbacMiddleware(['admin', 'super_admin', 'consultant', 'operations']), createProject);

router.route('/:id')
  .get(getProjectById)
  .put(rbacMiddleware(['admin', 'super_admin', 'consultant', 'operations']), updateProject)
  .delete(rbacMiddleware(['admin', 'super_admin']), deleteProject);

// Milestones & Sprints
router.post('/:id/milestones', rbacMiddleware(['admin', 'super_admin', 'consultant', 'operations']), createMilestone);
router.put('/:id/milestones/:milestoneId', rbacMiddleware(['admin', 'super_admin', 'consultant', 'operations']), updateMilestone);
router.delete('/:id/milestones/:milestoneId', rbacMiddleware(['admin', 'super_admin']), deleteMilestone);

// Tasks
router.post('/:id/tasks', createTask);
router.put('/:id/tasks/:taskId', updateTask);
router.delete('/:id/tasks/:taskId', rbacMiddleware(['admin', 'super_admin', 'consultant', 'operations']), deleteTask);

// Time Logs
router.post('/:id/time-logs', logTime);
router.delete('/:id/time-logs/:logId', deleteTimeLog);

// QA, UAT, Deployment & Handover
router.post('/:id/handovers', rbacMiddleware(['admin', 'super_admin', 'operations', 'consultant']), createHandover);
router.put('/:id/handovers/:handoverId/signoff', rbacMiddleware(['admin', 'super_admin', 'operations']), signOffHandover);

module.exports = router;
