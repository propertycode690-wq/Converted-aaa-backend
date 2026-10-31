/**
 * Agent 3 — Developer Productivity & Code Intelligence AI
 * Specialization: Technical specs, bug report breakdown, release notes, test gap analysis
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aiGateway = require('../aiGateway');

class DevAiService {
  constructor() {
    this.agentCode = 'dev_ai';
  }

  /**
   * Break down a complex technical requirement or client feature request into an engineering spec
   */
  async generateTechnicalSpec(featureTitle, featureDescription, targetProject) {
    const systemPrompt = `You are the Lead Software Architect & Engineering Lead AI at Kiaan Technology.
Given a feature request or technical issue, output a rigorous technical specification in JSON:
{
  "featureTitle": "string",
  "architecturalOverview": "string",
  "frontendRequirements": ["Requirement 1", "Requirement 2"],
  "backendRequirements": ["API Endpoint", "Service logic"],
  "databaseSchemaChanges": ["Table or column additions/modifications"],
  "acceptanceCriteria": [
    "Given ..., When ..., Then ...",
    "Given ..., When ..., Then ..."
  ],
  "securityConsiderations": ["Auth, sanitization, rate limiting"],
  "unitTestPlan": ["Test case 1", "Test case 2"],
  "estimatedDeveloperHours": 16
}`;

    const userPrompt = `Project: ${targetProject || 'Core IT CRM'}. Feature Request: ${featureTitle}. Details: ${featureDescription}`;

    return await aiGateway.complete({
      agentCode: this.agentCode,
      systemPrompt,
      userPrompt,
      taskType: 'technical_specification',
      triggerEvent: 'manual:dev_spec',
      entityType: 'technical_spec',
      entityId: featureTitle,
      contextData: { featureTitle, targetProject }
    });
  }

  /**
   * Analyze an error log or bug report and suggest fixes
   */
  async analyzeBugReport(bugTitle, errorStack, context) {
    const systemPrompt = `You are the Principal Debugging & Code Intelligence AI at Kiaan Technology.
Analyze this bug report / error stack and output an actionable root cause and remediation plan in JSON:
{
  "likelyRootCause": "string",
  "severityLevel": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "impactedComponents": ["Component 1", "Component 2"],
  "suggestedFix": "Detailed code fix or approach",
  "regressionPrevention": "How to write a unit or integration test to prevent this bug",
  "estimatedFixTimeHours": 2
}`;

    const userPrompt = `Bug Title: ${bugTitle}\nContext: ${context || 'Runtime error'}\nError Stack:\n${errorStack}`;

    return await aiGateway.complete({
      agentCode: this.agentCode,
      systemPrompt,
      userPrompt,
      taskType: 'bug_analysis',
      triggerEvent: 'error:reported',
      entityType: 'bug',
      entityId: bugTitle,
      contextData: { bugTitle }
    });
  }

  /**
   * Draft automated release notes for a completed milestone
   */
  async draftReleaseNotes(projectId, milestoneTitle, completedTaskTitles = []) {
    const systemPrompt = `You are the Release Engineering AI at Kiaan Technology.
Generate professional, client-ready Software Release Notes in JSON:
{
  "version": "v1.X.0",
  "releaseSummary": "Executive summary of changes in this milestone",
  "newFeatures": ["Feature 1", "Feature 2"],
  "bugFixes": ["Bug fix 1"],
  "performanceImprovements": ["Improvement 1"],
  "knownLimitations": [],
  "deploymentNotes": "Verified on staging environment. Ready for production rollout upon client signoff."
}`;

    const userPrompt = `Project ID: ${projectId}. Milestone: ${milestoneTitle}. Completed items:\n- ${completedTaskTitles.join('\n- ')}`;

    return await aiGateway.complete({
      agentCode: this.agentCode,
      systemPrompt,
      userPrompt,
      taskType: 'release_notes',
      triggerEvent: 'milestone:completed',
      entityType: 'project',
      entityId: projectId,
      contextData: { projectId, milestoneTitle }
    });
  }
}

module.exports = new DevAiService();

