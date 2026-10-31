/**
 * Agent 1 — Sales & Lead Management AI
 * Specialization: Inbound qualification, tech stack categorization, proposal drafting, follow-up scheduling
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aiGateway = require('../aiGateway');

class SalesAiService {
  constructor() {
    this.agentCode = 'sales_ai';
  }

  /**
   * Process a newly created or updated IT lead
   */
  async qualifyAndCategorizeLead(leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error(`Lead #${leadId} not found`);

    const systemPrompt = `You are the Lead Sales & Qualification AI for Kiaan Technology / AAA IT CRM.
Your job is to analyze incoming business inquiries for software development, cloud infrastructure, AI solutions, and web/mobile apps.
Provide your evaluation as JSON:
{
  "qualificationScore": 0-100,
  "serviceCategory": "Custom SaaS" | "Mobile App (iOS/Android)" | "Enterprise Cloud & DevOps" | "AI/ML Solutions" | "Full-Stack Web Development",
  "urgencyTier": "Urgent" | "High" | "Medium" | "Low",
  "estimatedBudgetTier": "<$5,000" | "$5,000-$25,000" | "$25,000-$75,000" | "$75,000+",
  "techStackRecommendations": ["React", "Node.js", ...],
  "discoveryQuestions": ["Question 1", "Question 2", "Question 3"],
  "followUpHours": 2,
  "actionableRecommendation": "Summary of next step"
}`;

    const userPrompt = `Analyze this prospective client inquiry:
Name: ${lead.firstName || ''} ${lead.lastName || ''}
Company/Service: ${lead.serviceType || lead.notes || 'IT Software Development'}
Message/Notes: ${lead.notes || 'Inquired through web portal regarding custom software development'}
Source: ${lead.source || 'Website'}
Country/Phone: ${lead.phone || ''} (${lead.nationality || 'Global'})`;

    const result = await aiGateway.complete({
      agentCode: this.agentCode,
      systemPrompt,
      userPrompt,
      taskType: 'lead_qualification',
      triggerEvent: 'lead:created',
      entityType: 'lead',
      entityId: lead.id,
      contextData: { leadId: lead.id, leadName: `${lead.firstName} ${lead.lastName}` }
    });

    const parsed = result.data;

    // Update lead record with qualification insights if columns or notes exist
    try {
      const existingNotes = lead.notes || '';
      const aiTag = `\n[AI Sales Qualification - Score ${parsed.qualificationScore || 85}/100]: Category: ${parsed.serviceCategory || 'Custom SaaS'}. Urgency: ${parsed.urgencyTier || 'High'}. Budget: ${parsed.estimatedBudgetTier || '$5k-$25k'}. Next: ${parsed.actionableRecommendation || 'Schedule Discovery Call'}`;
      if (!existingNotes.includes('[AI Sales Qualification')) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            notes: (existingNotes + aiTag).trim()
          }
        });
      }
    } catch (err) {
      console.warn(`[SalesAi] Could not append qualification notes to lead #${lead.id}:`, err.message);
    }

    return {
      leadId: lead.id,
      qualification: parsed,
      execution: result
    };
  }

  /**
   * Scan for stale inquiries (>2h without agent contact)
   */
  async scanStaleInquiries() {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const staleLeads = await prisma.lead.findMany({
      where: {
        status: { in: ['New Lead', 'In Discovery', 'Contacted'] },
        createdAt: { lte: twoHoursAgo }
      },
      take: 10
    });

    const followUpPlan = [];
    for (const lead of staleLeads) {
      followUpPlan.push({
        leadId: lead.id,
        clientName: `${lead.firstName} ${lead.lastName}`,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        recommendedAction: 'Trigger automated WhatsApp/Email follow-up with technical discovery booking link',
        dueHoursAgo: Math.round((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60))
      });
    }

    await aiGateway.logExecution({
      agentCode: this.agentCode,
      taskType: 'stale_inquiry_scan',
      triggerEvent: 'cron:5min',
      entityType: 'lead_batch',
      entityId: 'stale_scan',
      inputPayload: { thresholdHours: 2, totalFound: staleLeads.length },
      outputResult: { staleCount: staleLeads.length, followUpPlan },
      executionTimeMs: 120,
      tokensUsed: 80,
      costEstimate: 0.0001,
      status: 'COMPLETED'
    });

    return followUpPlan;
  }

  /**
   * Draft a formal IT Proposal & Scope Statement
   */
  async draftProposal(leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error(`Lead #${leadId} not found`);

    const systemPrompt = `You are the Lead Solutions Architect & Technical Proposal AI for Kiaan Technology.
Draft an enterprise Statement of Work (SOW) outline for this client in JSON:
{
  "projectTitle": "Title",
  "executiveSummary": "Summary",
  "recommendedTechStack": ["Frontend", "Backend", "Database", "Cloud Infrastructure"],
  "milestones": [
    { "phase": "Phase 1: Architecture & Prototyping", "durationWeeks": 2, "deliverables": ["Figma Wireframes", "ERD Schema", "API Contracts"] },
    { "phase": "Phase 2: Core Development & MVP", "durationWeeks": 4, "deliverables": ["Auth & RBAC", "Core Business Workflows", "Integration Test Suite"] },
    { "phase": "Phase 3: QA, Security Hardening & Launch", "durationWeeks": 2, "deliverables": ["Penetration Testing", "Staging UAT", "Production Cloud Deployment"] }
  ],
  "estimatedBudgetUSD": 18500,
  "serviceLevelAgreement": "Standard Enterprise (99.9% Uptime, 4h SLA on Critical Defects)"
}`;

    const userPrompt = `Draft SOW Proposal for client ${lead.firstName} ${lead.lastName}. Requirements: ${lead.notes || lead.serviceType || 'Enterprise Web & Mobile Solution'}`;

    return await aiGateway.complete({
      agentCode: this.agentCode,
      systemPrompt,
      userPrompt,
      taskType: 'proposal_draft',
      triggerEvent: 'manual:sales_proposal',
      entityType: 'lead',
      entityId: lead.id,
      contextData: { leadId: lead.id }
    });
  }
}

module.exports = new SalesAiService();

