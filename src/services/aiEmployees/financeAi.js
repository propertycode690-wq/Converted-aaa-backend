/**
 * Agent 5 — Finance & Invoicing AI
 * Specialization: Billing monitoring, overdue reminders, revenue & margin analysis
 * Strict Safety Guarantee: Never issues refunds, discounts, or money transfers directly.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aiGateway = require('../aiGateway');

class FinanceAiService {
  constructor() {
    this.agentCode = 'finance_ai';
  }

  /**
   * Scan for overdue invoices and generate reminder drafts
   */
  async scanOverdueInvoices() {
    const now = new Date();
    const overdueInvoices = await prisma.payment.findMany({
      where: {
        status: 'Pending',
        dueDate: { lt: now }
      },
      include: { client: true },
      take: 20
    });

    const reminderQueue = [];
    for (const inv of overdueInvoices) {
      const daysOverdue = Math.ceil((now - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24));
      const clientName = inv.client ? `${inv.client.firstName} ${inv.client.lastName}` : 'Client';
      const clientEmail = inv.client?.email;
      const amount = Number(inv.amount) || 0;

      const draftReminder = `Dear ${clientName},\n\nWe hope this message finds you well. This is a polite notification from the Kiaan Technology billing team regarding Invoice #${inv.id.substring(0, 8)} for the amount of €${amount.toLocaleString()} (Due Date: ${new Date(inv.dueDate).toLocaleDateString()}).\n\nAs the invoice is now ${daysOverdue} day(s) overdue, please kindly process the payment at your earliest convenience to maintain uninterrupted milestone delivery on your software project.\n\nThank you for your prompt attention to this matter.\n\nBest regards,\nFinance & Invoicing Department\nKiaan Technology`;

      reminderQueue.push({
        invoiceId: inv.id,
        clientId: inv.clientId,
        clientName,
        clientEmail,
        amount,
        daysOverdue,
        draftReminder
      });
    }

    await aiGateway.logExecution({
      agentCode: this.agentCode,
      taskType: 'overdue_invoice_scan',
      triggerEvent: 'cron:hourly',
      entityType: 'invoice_batch',
      entityId: 'overdue_scan',
      inputPayload: { totalOverdueFound: overdueInvoices.length },
      outputResult: { count: overdueInvoices.length, reminderQueue },
      executionTimeMs: 130,
      tokensUsed: 110,
      costEstimate: 0.0001,
      status: 'COMPLETED'
    });

    return {
      totalOverdue: overdueInvoices.length,
      reminderQueue
    };
  }

  /**
   * Request approval for a proposed discount or refund (Controlled Autonomy)
   */
  async proposeInvoiceAdjustment({ invoiceId, adjustmentType, amount, reason }) {
    return await aiGateway.requestApproval({
      agentCode: this.agentCode,
      actionType: `FINANCIAL_${adjustmentType.toUpperCase()}`,
      entityType: 'invoice',
      entityId: invoiceId,
      proposedPayload: { adjustmentType, amount, reason },
      reason: `Proposed ${adjustmentType} of €${amount} for Invoice #${invoiceId}. Reason: ${reason}. Financial safety policy strictly requires human executive authorization.`,
      riskLevel: 'CRITICAL'
    });
  }

  /**
   * Calculate project financial margin summary
   */
  async generateProjectFinancialSummary(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        timeLogs: true
      }
    });
    if (!project) throw new Error(`Project #${projectId} not found`);

    const contractValue = Number(project.contractValue) || 0;
    const totalHoursLogged = project.timeLogs.reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
    const estimatedDevCost = totalHoursLogged * 45; // €45/hr average blended internal engineering cost
    const grossMargin = contractValue > 0 ? contractValue - estimatedDevCost : 0;
    const marginPct = contractValue > 0 ? Math.round((grossMargin / contractValue) * 100) : 0;

    return {
      projectId: project.id,
      title: project.title,
      contractValue: `€${contractValue.toLocaleString()}`,
      totalHoursLogged,
      estimatedDevCost: `€${estimatedDevCost.toLocaleString()}`,
      grossMargin: `€${grossMargin.toLocaleString()}`,
      marginPercentage: `${marginPct}%`,
      status: marginPct > 40 ? 'HEALTHY_MARGIN' : marginPct > 20 ? 'ACCEPTABLE' : 'LOW_MARGIN_WARNING'
    };
  }
}

module.exports = new FinanceAiService();

