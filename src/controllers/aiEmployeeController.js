/**
 * Controller for 7 Autonomous AI Employees & Control Center
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aiGateway = require('../services/aiGateway');
const aiScheduler = require('../services/aiScheduler');

const salesAi = require('../services/aiEmployees/salesAi');
const projectAi = require('../services/aiEmployees/projectAi');
const devAi = require('../services/aiEmployees/devAi');
const supportAi = require('../services/aiEmployees/supportAi');
const financeAi = require('../services/aiEmployees/financeAi');
const opsAi = require('../services/aiEmployees/opsAi');
const ceoSupervisorAi = require('../services/aiEmployees/ceoSupervisorAi');

class AiEmployeeController {
  /**
   * GET /api/v1/ai-employees/overview
   */
  async getOverview(req, res) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        agents,
        todayExecutions,
        pendingApprovalsCount,
        recentExecutions
      ] = await Promise.all([
        prisma.aiAgent.findMany({ orderBy: { code: 'asc' } }),
        prisma.aiTaskExecution.findMany({
          where: { createdAt: { gte: today } }
        }),
        prisma.aiApprovalRequest.count({ where: { status: 'PENDING' } }),
        prisma.aiTaskExecution.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' }
        })
      ]);

      const activeAgents = agents.filter(a => a.status === 'ACTIVE').length;
      const pausedAgents = agents.filter(a => a.status === 'PAUSED').length;
      const disabledAgents = agents.filter(a => a.status === 'DISABLED').length;

      const completedTasksToday = todayExecutions.filter(e => e.status === 'COMPLETED').length;
      const failedTasksToday = todayExecutions.filter(e => e.status === 'FAILED').length;
      const runningTasksToday = todayExecutions.filter(e => e.status === 'RUNNING').length;

      const totalCostToday = agents.reduce((sum, a) => sum + (Number(a.spentToday) || 0), 0);
      const totalTokensToday = todayExecutions.reduce((sum, e) => sum + (Number(e.tokensUsed) || 0), 0);

      return res.json({
        success: true,
        data: {
          totalAgents: agents.length,
          activeAgents,
          pausedAgents,
          disabledAgents,
          tasksSummary: {
            todayTotal: todayExecutions.length,
            completed: completedTasksToday,
            failed: failedTasksToday,
            running: runningTasksToday
          },
          pendingApprovals: pendingApprovalsCount,
          spending: {
            totalCostToday: Number(totalCostToday.toFixed(4)),
            totalTokensToday,
            activeProvider: aiGateway.getActiveProvider()
          },
          scheduler: aiScheduler.getHeartbeat(),
          recentExecutions
        }
      });
    } catch (err) {
      console.error('[AI Controller Overview error]:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/v1/ai-employees/agents
   */
  async getAgents(req, res) {
    try {
      const agents = await prisma.aiAgent.findMany({
        orderBy: { code: 'asc' }
      });
      return res.json({ success: true, data: agents });
    } catch (err) {
      console.error('[AI Controller getAgents error]:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * PATCH /api/v1/ai-employees/agents/:id/status
   */
  async updateAgentStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, executionMode, dailyBudget } = req.body;

      const updateData = {};
      if (status) updateData.status = status;
      if (executionMode) updateData.executionMode = executionMode;
      if (dailyBudget !== undefined) updateData.dailyBudget = Number(dailyBudget);

      const updated = await prisma.aiAgent.update({
        where: { id },
        data: updateData
      });

      return res.json({
        success: true,
        message: `Agent ${updated.name} updated successfully`,
        data: updated
      });
    } catch (err) {
      console.error('[AI Controller updateAgentStatus error]:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/v1/ai-employees/agents/:id/trigger
   * Run agent manually ("Run Now")
   */
  async triggerAgentNow(req, res) {
    try {
      const { id } = req.params;
      const agent = await prisma.aiAgent.findUnique({ where: { id } });
      if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

      let result = null;
      switch (agent.code) {
        case 'sales_ai':
          result = await salesAi.scanStaleInquiries();
          break;
        case 'project_ai':
          result = await projectAi.scanProjectDeadlines();
          break;
        case 'dev_ai':
          result = await devAi.generateTechnicalSpec('Full-Stack Architectural Review', 'Verify security, performance, and API stability across the CRM stack', 'Core Platform');
          break;
        case 'support_ai':
          result = await supportAi.scanSlaBreaches();
          break;
        case 'finance_ai':
          result = await financeAi.scanOverdueInvoices();
          break;
        case 'ops_ai':
          result = await opsAi.analyzeTeamWorkload();
          break;
        case 'ceo_supervisor':
          result = await ceoSupervisorAi.generateCeoBriefing();
          break;
        default:
          throw new Error(`Unknown agent code: ${agent.code}`);
      }

      return res.json({
        success: true,
        message: `Agent ${agent.name} executed successfully`,
        data: result
      });
    } catch (err) {
      console.error('[AI Controller triggerAgentNow error]:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/v1/ai-employees/tasks
   */
  async getTasks(req, res) {
    try {
      const { agentCode, status, limit = 50, page = 1 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where = {};
      if (agentCode) where.agentCode = agentCode;
      if (status) where.status = status;

      const [tasks, total] = await Promise.all([
        prisma.aiTaskExecution.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.aiTaskExecution.count({ where })
      ]);

      return res.json({
        success: true,
        data: tasks,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (err) {
      console.error('[AI Controller getTasks error]:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/v1/ai-employees/approvals
   */
  async getApprovals(req, res) {
    try {
      const { status = 'PENDING' } = req.query;
      const approvals = await prisma.aiApprovalRequest.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: 'desc' }
      });
      return res.json({ success: true, data: approvals });
    } catch (err) {
      console.error('[AI Controller getApprovals error]:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/v1/ai-employees/approvals/:id/decide
   */
  async decideApproval(req, res) {
    try {
      const { id } = req.params;
      const { decision, notes } = req.body; // decision: 'APPROVED' | 'REJECTED' | 'REVISED'
      const decider = req.user || { id: 'admin', firstName: 'Admin', lastName: 'User' };

      if (!['APPROVED', 'REJECTED', 'REVISED'].includes(decision)) {
        return res.status(400).json({ success: false, message: 'Decision must be APPROVED, REJECTED, or REVISED' });
      }

      const approval = await prisma.aiApprovalRequest.update({
        where: { id },
        data: {
          status: decision,
          decisionNotes: notes || '',
          decidedById: decider.id,
          decidedByName: `${decider.firstName || ''} ${decider.lastName || ''}`.trim() || 'Admin',
          decidedAt: new Date()
        }
      });

      return res.json({
        success: true,
        message: `Approval request #${id} marked as ${decision}`,
        data: approval
      });
    } catch (err) {
      console.error('[AI Controller decideApproval error]:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/v1/ai-employees/health
   */
  async getHealth(req, res) {
    try {
      const health = await ceoSupervisorAi.getSystemHealth();
      return res.json({ success: true, data: health });
    } catch (err) {
      console.error('[AI Controller getHealth error]:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/v1/ai-employees/ceo-briefing
   */
  async getCeoBriefing(req, res) {
    try {
      const briefing = await ceoSupervisorAi.generateCeoBriefing();
      return res.json({ success: true, data: briefing });
    } catch (err) {
      console.error('[AI Controller getCeoBriefing error]:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new AiEmployeeController();

