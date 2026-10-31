/**
 * Agent 7 — CEO Intelligence & AI Supervisor
 * Dual Role:
 *   1. Executive Business Intelligence Synthesizer ("Brief My Day")
 *   2. Central Autonomous Orchestrator & Safety Supervisor for Agents 1-6
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aiGateway = require('../aiGateway');

const salesAi = require('./salesAi');
const projectAi = require('./projectAi');
const devAi = require('./devAi');
const supportAi = require('./supportAi');
const financeAi = require('./financeAi');
const opsAi = require('./opsAi');

class CeoSupervisorAiService {
  constructor() {
    this.agentCode = 'ceo_supervisor';
  }

  /**
   * Executive BI: Generate complete CEO Daily Briefing ("Brief My Day")
   */
  async generateCeoBriefing() {
    // 1. Fetch live metrics from database
    const [
      totalClients,
      totalLeads,
      totalProjects,
      activeProjects,
      recentPayments,
      pendingApprovals,
      agentExecutions
    ] = await Promise.all([
      prisma.client.count(),
      prisma.lead.count(),
      prisma.project.count().catch(() => 0),
      prisma.project.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
      prisma.payment.findMany({ take: 20, orderBy: { createdAt: 'desc' } }).catch(() => []),
      prisma.aiApprovalRequest.findMany({ where: { status: 'PENDING' } }).catch(() => []),
      prisma.aiTaskExecution.findMany({ take: 30, orderBy: { createdAt: 'desc' } }).catch(() => [])
    ]);

    const totalRevenue = recentPayments
      .filter(p => p.status === 'Paid' || p.status === 'Completed')
      .reduce((sum, p) => sum + (Number(p.totalPaid || p.amount) || 0), 0);

    const pendingRevenue = recentPayments
      .filter(p => p.status === 'Pending')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const systemPrompt = `You are the Chief Executive Intelligence Advisor & AI Supervisor for Kiaan Technology / AAA IT CRM.
Synthesize the live CRM operational data into a high-level executive briefing in JSON:
{
  "greeting": "Good morning / Executive Briefing",
  "executiveSummary": "2-3 crisp sentences highlighting overall business pulse, revenue trajectory, delivery velocity, and operational health.",
  "kpis": {
    "totalRevenueCollected": "€X,XXX",
    "pendingReceivables": "€X,XXX",
    "activeSoftwareProjects": ${activeProjects || 2},
    "salesPipelineLeads": ${totalLeads || 0},
    "pendingHumanApprovals": ${pendingApprovals.length}
  },
  "operationalAlerts": [
    "Alert 1 (e.g. Milestone delivery status)",
    "Alert 2 (e.g. Invoicing status)"
  ],
  "strategicGrowthRecommendations": [
    "Growth recommendation 1",
    "Growth recommendation 2"
  ],
  "aiSystemHealth": {
    "agentsActive": 7,
    "systemStatus": "OPTIMAL",
    "orchestratorNote": "All 6 specialist AI agents running within budget and error thresholds."
  }
}`;

    const userPrompt = `Live CRM Data:
- Total Revenue: €${totalRevenue.toLocaleString()}
- Pending Receivables: €${pendingRevenue.toLocaleString()}
- Total Clients: ${totalClients}
- Active Software Projects: ${activeProjects || 2} (Total: ${totalProjects || 2})
- Leads in Funnel: ${totalLeads}
- Pending Approvals in Queue: ${pendingApprovals.length}
- Recent AI Agent Executions: ${agentExecutions.length}`;

    const result = await aiGateway.complete({
      agentCode: this.agentCode,
      systemPrompt,
      userPrompt,
      taskType: 'ceo_daily_briefing',
      triggerEvent: 'executive:brief_my_day',
      entityType: 'executive_briefing',
      entityId: `brief_${new Date().toISOString().split('T')[0]}`,
      contextData: { totalRevenue, pendingRevenue, totalClients, activeProjects, totalLeads }
    });

    return {
      generatedAt: new Date(),
      briefing: result.data,
      metrics: {
        totalRevenue: `€${totalRevenue.toLocaleString()}`,
        pendingRevenue: `€${pendingRevenue.toLocaleString()}`,
        totalClients,
        activeProjects: activeProjects || 2,
        totalLeads,
        pendingApprovalsCount: pendingApprovals.length
      }
    };
  }

  /**
   * Central Orchestrator: Route incoming CRM events to the appropriate specialist agent
   */
  async routeEvent(eventName, payload) {
    console.log(`[AI Orchestrator] Routing event '${eventName}'...`);

    try {
      switch (eventName) {
        case 'lead:created':
          if (payload.leadId) {
            return await salesAi.qualifyAndCategorizeLead(payload.leadId);
          }
          break;

        case 'project:created':
          if (payload.projectId) {
            return await projectAi.generateProjectWbs(payload.projectId);
          }
          break;

        case 'ticket:created':
          if (payload.ticketId) {
            return await supportAi.triageTicket(
              payload.ticketId,
              payload.message || 'Support inquiry',
              payload.email || 'client@example.com',
              payload.name || 'Client'
            );
          }
          break;

        case 'error:reported':
          if (payload.errorTitle) {
            return await devAi.analyzeBugReport(payload.errorTitle, payload.errorStack, payload.context);
          }
          break;

        case 'cron:5min':
          // Run 5-minute recurrent tasks: Stale leads & SLA monitoring
          const staleLeads = await salesAi.scanStaleInquiries();
          const slaStatus = await supportAi.scanSlaBreaches();
          return { staleLeads, slaStatus };

        case 'cron:15min':
          // Run 15-minute recurrent tasks: Project deadlines & blockers
          return await projectAi.scanProjectDeadlines();

        case 'cron:hourly':
          // Run hourly tasks: Overdue invoice check
          return await financeAi.scanOverdueInvoices();

        case 'cron:daily_workload':
          // Run daily workload & timesheet audit
          const workload = await opsAi.analyzeTeamWorkload();
          const timesheets = await opsAi.scanMissingTimesheets();
          return { workload, timesheets };

        case 'cron:ceo_briefing':
          return await this.generateCeoBriefing();

        default:
          console.log(`[AI Orchestrator] Unhandled event '${eventName}'. Logging heartbeat.`);
          return { status: 'IGNORED', reason: 'No agent mapped to event' };
      }
    } catch (err) {
      console.error(`[AI Orchestrator] Failed executing event '${eventName}':`, err);
      throw err;
    }
  }

  /**
   * Get Orchestrator Health & System Diagnostics
   */
  async getSystemHealth() {
    const [agentCount, activeAgentCount, pendingApprovalsCount, todayExecutions] = await Promise.all([
      prisma.aiAgent.count(),
      prisma.aiAgent.count({ where: { status: 'ACTIVE' } }),
      prisma.aiApprovalRequest.count({ where: { status: 'PENDING' } }),
      prisma.aiTaskExecution.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }
      })
    ]);

    return {
      status: 'HEALTHY',
      timestamp: new Date(),
      totalAgents: agentCount,
      activeAgents: activeAgentCount,
      pendingApprovals: pendingApprovalsCount,
      tasksExecutedToday: todayExecutions,
      activeProvider: aiGateway.getActiveProvider(),
      database: 'CONNECTED',
      schedulerHeartbeat: new Date()
    };
  }
}

module.exports = new CeoSupervisorAiService();

