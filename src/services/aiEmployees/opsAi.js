/**
 * Agent 6 — Operations, HR & Team Productivity AI
 * Specialization: Workload balancing, timesheet compliance, developer productivity tracking
 * Controlled Autonomy: Sensitive HR actions (evaluations, salary, leaves) strictly require human review.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aiGateway = require('../aiGateway');

class OpsAiService {
  constructor() {
    this.agentCode = 'ops_ai';
  }

  /**
   * Monitor engineer workload and task distribution
   */
  async analyzeTeamWorkload() {
    // 1. Fetch active tasks grouped by assigned engineer
    const activeTasks = await prisma.projectTask.findMany({
      where: {
        status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] }
      },
      include: { assignedTo: true, project: true }
    });

    const workloadMap = {};
    for (const task of activeTasks) {
      const devId = task.assignedToId || 'unassigned';
      const devName = task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : 'Unassigned Pool';
      if (!workloadMap[devId]) {
        workloadMap[devId] = {
          developerId: devId,
          developerName: devName,
          activeTasksCount: 0,
          totalEstimatedHours: 0,
          tasks: []
        };
      }
      workloadMap[devId].activeTasksCount += 1;
      workloadMap[devId].totalEstimatedHours += (Number(task.estimatedHours) || 0);
      workloadMap[devId].tasks.push({
        id: task.id,
        title: task.title,
        priority: task.priority,
        project: task.project?.title
      });
    }

    const workloadSummary = Object.values(workloadMap);
    const overloadedEngineers = workloadSummary.filter(w => w.activeTasksCount > 6 || w.totalEstimatedHours > 40);

    await aiGateway.logExecution({
      agentCode: this.agentCode,
      taskType: 'team_workload_audit',
      triggerEvent: 'cron:daily_workload',
      entityType: 'team_audit',
      entityId: 'workload_audit',
      inputPayload: { activeTasksCount: activeTasks.length, developersTracked: workloadSummary.length },
      outputResult: { workloadSummary, overloadedCount: overloadedEngineers.length },
      executionTimeMs: 145,
      tokensUsed: 120,
      costEstimate: 0.0001,
      status: 'COMPLETED'
    });

    return {
      totalActiveTasks: activeTasks.length,
      developersTracked: workloadSummary.length,
      overloadedCount: overloadedEngineers.length,
      workloadSummary
    };
  }

  /**
   * Scan for missing daily timesheets across engineering team
   */
  async scanMissingTimesheets() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const loggedToday = await prisma.projectTimeLog.findMany({
      where: {
        createdAt: { gte: today }
      },
      select: { userId: true, hours: true }
    });

    const loggedUsers = new Set(loggedToday.map(l => l.userId));

    // Get all engineers / team members
    const teamMembers = await prisma.user.findMany({
      where: {
        status: 'Active',
        role: { in: ['admin', 'consultant', 'operations'] }
      },
      select: { id: true, firstName: true, lastName: true, email: true }
    });

    const missingEngineers = teamMembers.filter(m => !loggedUsers.has(m.id));

    return {
      date: today.toISOString().split('T')[0],
      totalTeamMembers: teamMembers.length,
      loggedCount: loggedUsers.size,
      missingCount: missingEngineers.length,
      missingEngineers: missingEngineers.map(m => ({ id: m.id, name: `${m.firstName} ${m.lastName}`, email: m.email }))
    };
  }

  /**
   * Request human review for an HR / sensitive decision
   */
  async requestHrAction({ employeeId, actionType, details, reason }) {
    return await aiGateway.requestApproval({
      agentCode: this.agentCode,
      actionType: `HR_${actionType.toUpperCase()}`,
      entityType: 'user',
      entityId: employeeId,
      proposedPayload: { actionType, details, reason },
      reason: `HR action '${actionType}' requested. HR policy strictly mandates human authorization.`,
      riskLevel: 'HIGH'
    });
  }
}

module.exports = new OpsAiService();

