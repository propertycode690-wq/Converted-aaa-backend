const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    table
  );
  return Number(rows[0].cnt) > 0;
}

async function migrateAiEmployeeSchema() {
  console.log('[AI Schema Migration] Starting 7 Autonomous AI Employees Schema Setup...');

  // 1. ai_agents
  const hasAiAgents = await tableExists('ai_agents');
  if (!hasAiAgents) {
    console.log('[AI Schema] Creating `ai_agents` table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ai_agents\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`tenantId\` VARCHAR(191) NOT NULL DEFAULT 'default',
        \`code\` VARCHAR(50) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`roleTitle\` VARCHAR(191) NOT NULL,
        \`description\` TEXT NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        \`executionMode\` VARCHAR(50) NOT NULL DEFAULT 'AUTOMATIC',
        \`scheduleCron\` VARCHAR(100) NULL,
        \`dailyBudget\` DOUBLE NOT NULL DEFAULT 5.0,
        \`spentToday\` DOUBLE NOT NULL DEFAULT 0.0,
        \`lastRunAt\` DATETIME(3) NULL,
        \`lastSuccessAt\` DATETIME(3) NULL,
        \`failureCount\` INT NOT NULL DEFAULT 0,
        \`config\` JSON NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`ai_agents_code_key\`(\`code\`),
        INDEX \`ai_agents_tenantId_idx\`(\`tenantId\`),
        INDEX \`ai_agents_status_idx\`(\`status\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('[AI Schema] `ai_agents` table created.');
  } else {
    console.log('[AI Schema] `ai_agents` table already exists.');
  }

  // 2. ai_task_executions
  const hasTaskExec = await tableExists('ai_task_executions');
  if (!hasTaskExec) {
    console.log('[AI Schema] Creating `ai_task_executions` table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ai_task_executions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`tenantId\` VARCHAR(191) NOT NULL DEFAULT 'default',
        \`agentId\` VARCHAR(191) NOT NULL,
        \`agentCode\` VARCHAR(50) NOT NULL,
        \`taskType\` VARCHAR(100) NOT NULL,
        \`triggerEvent\` VARCHAR(100) NOT NULL,
        \`entityType\` VARCHAR(50) NULL,
        \`entityId\` VARCHAR(191) NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
        \`inputPayload\` JSON NULL,
        \`outputResult\` JSON NULL,
        \`errorMessage\` TEXT NULL,
        \`retryCount\` INT NOT NULL DEFAULT 0,
        \`executionTimeMs\` INT NOT NULL DEFAULT 0,
        \`tokensUsed\` INT NOT NULL DEFAULT 0,
        \`costEstimate\` DOUBLE NOT NULL DEFAULT 0.0,
        \`startedAt\` DATETIME(3) NULL,
        \`completedAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`ai_task_executions_agentCode_idx\`(\`agentCode\`),
        INDEX \`ai_task_executions_status_idx\`(\`status\`),
        INDEX \`ai_task_executions_createdAt_idx\`(\`createdAt\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('[AI Schema] `ai_task_executions` table created.');
  } else {
    console.log('[AI Schema] `ai_task_executions` table already exists.');
  }

  // 3. ai_approval_requests
  const hasApprovals = await tableExists('ai_approval_requests');
  if (!hasApprovals) {
    console.log('[AI Schema] Creating `ai_approval_requests` table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ai_approval_requests\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`tenantId\` VARCHAR(191) NOT NULL DEFAULT 'default',
        \`agentId\` VARCHAR(191) NOT NULL,
        \`agentCode\` VARCHAR(50) NOT NULL,
        \`taskExecutionId\` VARCHAR(191) NULL,
        \`actionType\` VARCHAR(100) NOT NULL,
        \`entityType\` VARCHAR(50) NOT NULL,
        \`entityId\` VARCHAR(191) NOT NULL,
        \`proposedPayload\` JSON NULL,
        \`reason\` TEXT NOT NULL,
        \`riskLevel\` VARCHAR(50) NOT NULL DEFAULT 'MEDIUM',
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        \`decisionNotes\` TEXT NULL,
        \`decidedById\` VARCHAR(191) NULL,
        \`decidedByName\` VARCHAR(191) NULL,
        \`decidedAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`ai_approval_requests_status_idx\`(\`status\`),
        INDEX \`ai_approval_requests_agentCode_idx\`(\`agentCode\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('[AI Schema] `ai_approval_requests` table created.');
  } else {
    console.log('[AI Schema] `ai_approval_requests` table already exists.');
  }

  // 4. ai_daily_metrics
  const hasDailyMetrics = await tableExists('ai_daily_metrics');
  if (!hasDailyMetrics) {
    console.log('[AI Schema] Creating `ai_daily_metrics` table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ai_daily_metrics\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`tenantId\` VARCHAR(191) NOT NULL DEFAULT 'default',
        \`agentCode\` VARCHAR(50) NOT NULL,
        \`metricDate\` VARCHAR(50) NOT NULL,
        \`totalJobs\` INT NOT NULL DEFAULT 0,
        \`successJobs\` INT NOT NULL DEFAULT 0,
        \`failedJobs\` INT NOT NULL DEFAULT 0,
        \`totalTokens\` INT NOT NULL DEFAULT 0,
        \`totalCost\` DOUBLE NOT NULL DEFAULT 0.0,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`ai_daily_metrics_agent_date_key\`(\`agentCode\`, \`metricDate\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('[AI Schema] `ai_daily_metrics` table created.');
  } else {
    console.log('[AI Schema] `ai_daily_metrics` table already exists.');
  }

  // 5. Seed the Exactly 7 AI Employees
  const SEED_AGENTS = [
    {
      id: 'agent_sales_01',
      code: 'sales_ai',
      name: 'Sales & Lead Management AI',
      roleTitle: 'Lead Qualification & Inbound Deal Pipeline AI Specialist',
      description: 'Monitors incoming B2B IT inquiries, categorizes leads by tech stack & budget, qualifies prospects, drafts project proposals, and enforces follow-up SLAs.',
      status: 'ACTIVE',
      executionMode: 'AUTOMATIC',
      scheduleCron: '*/5 * * * *',
      dailyBudget: 5.0,
      config: JSON.stringify({
        services: ['Custom SaaS', 'Mobile Apps (iOS/Android)', 'Enterprise Cloud & DevOps', 'AI/ML Solutions', 'Web Applications'],
        budgetTiers: { low: '<$5,000', mid: '$5,000-$25,000', high: '$25,000+' },
        followUpIntervalHours: 2,
        autoAssign: true
      })
    },
    {
      id: 'agent_project_02',
      code: 'project_ai',
      name: 'Software Project & Task Management AI',
      roleTitle: 'Agile Delivery, Sprint Tracker & Risk Prevention Specialist',
      description: 'Monitors software development milestones, deliverables, and assigned tasks. Identifies blockers, prepares sprint health reports, and flags overdue milestones.',
      status: 'ACTIVE',
      executionMode: 'AUTOMATIC',
      scheduleCron: '*/15 * * * *',
      dailyBudget: 5.0,
      config: JSON.stringify({
        maxSprintDelayDays: 2,
        autoAlertLeadArchitect: true,
        riskThresholdHours: 24
      })
    },
    {
      id: 'agent_dev_03',
      code: 'dev_ai',
      name: 'Developer Productivity & Code Intelligence AI',
      roleTitle: 'Technical Requirements, Bug Intelligence & Release Notes Specialist',
      description: 'Translates client specs into actionable engineering tasks, analyzes bug reports, drafts technical documentation, and tracks unresolved engineering blockers.',
      status: 'ACTIVE',
      executionMode: 'AUTOMATIC',
      scheduleCron: '0 * * * *',
      dailyBudget: 5.0,
      config: JSON.stringify({
        preferredStack: ['React', 'Node.js', 'Express', 'MariaDB', 'Docker'],
        autoGenerateAcceptanceCriteria: true
      })
    },
    {
      id: 'agent_support_04',
      code: 'support_ai',
      name: 'Client Communication & Support AI',
      roleTitle: '24/7 Client Service, SLA Guardian & Support Ticket Specialist',
      description: 'Monitors incoming client messages and tickets. Answers routine questions with verified company docs, drafts status updates, and escalates complaints to human engineers.',
      status: 'ACTIVE',
      executionMode: 'AUTOMATIC',
      scheduleCron: '*/5 * * * *',
      dailyBudget: 5.0,
      config: JSON.stringify({
        slaTargetMinutes: 15,
        escalateUncertaintyScore: 0.7,
        channelPolicy: 'Verified IT Integrations Only'
      })
    },
    {
      id: 'agent_finance_05',
      code: 'finance_ai',
      name: 'Finance & Invoicing AI',
      roleTitle: 'Billing Guardian, Payment Reminders & Cash-Flow Intelligence Specialist',
      description: 'Monitors milestone invoices and outstanding balances. Flags overdue payments, generates polite automated reminders, and computes project profit margins. Strictly forbids direct money transfers.',
      status: 'ACTIVE',
      executionMode: 'AUTOMATIC',
      scheduleCron: '0 * * * *',
      dailyBudget: 5.0,
      config: JSON.stringify({
        overdueGracePeriodDays: 2,
        autoSendGraceReminders: true,
        requireApprovalForDiscounts: true
      })
    },
    {
      id: 'agent_ops_06',
      code: 'ops_ai',
      name: 'Operations, HR & Team Productivity AI',
      roleTitle: 'Workload Balancer, Timesheet Monitor & Resource Allocation Specialist',
      description: 'Monitors engineer workload, task distribution, and daily work log submissions. Detects missing timesheets and generates end-of-day team productivity summaries.',
      status: 'ACTIVE',
      executionMode: 'AUTOMATIC',
      scheduleCron: '0 18 * * 1-5',
      dailyBudget: 5.0,
      config: JSON.stringify({
        expectedDailyHours: 8,
        timesheetWarningHour: 17,
        maxTaskLoadPerDeveloper: 6
      })
    },
    {
      id: 'agent_ceo_07',
      code: 'ceo_supervisor',
      name: 'CEO Intelligence & AI Supervisor',
      roleTitle: 'Executive BI Synthesizer & Autonomous Agent Orchestrator',
      description: 'Synthesizes enterprise-wide metrics (Revenue, Lead Velocity, Project Health, SLA adherence) into the executive "Brief My Day" report. Orchestrates all 6 specialist agents and enforces safety limits.',
      status: 'ACTIVE',
      executionMode: 'AUTOMATIC',
      scheduleCron: '0 8 * * *',
      dailyBudget: 10.0,
      config: JSON.stringify({
        dailyBriefingTime: '08:00',
        maxGlobalDailySpend: 40.0,
        circuitBreakerErrorRate: 0.25,
        orchestratorHeartbeatSeconds: 60
      })
    }
  ];

  for (const agent of SEED_AGENTS) {
    const existing = await prisma.$queryRawUnsafe('SELECT id FROM ai_agents WHERE code = ?', agent.code);
    if (!existing || existing.length === 0) {
      console.log(`[AI Seed] Inserting agent: ${agent.name} (${agent.code})...`);
      await prisma.$executeRawUnsafe(
        `INSERT INTO ai_agents (id, tenantId, code, name, roleTitle, description, status, executionMode, scheduleCron, dailyBudget, spentToday, config, createdAt, updatedAt)
         VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, NOW(), NOW())`,
        agent.id,
        agent.code,
        agent.name,
        agent.roleTitle,
        agent.description,
        agent.status,
        agent.executionMode,
        agent.scheduleCron,
        agent.dailyBudget,
        agent.config
      );
    } else {
      console.log(`[AI Seed] Agent ${agent.code} already exists.`);
    }
  }

  console.log('[AI Schema Migration] All 7 AI Employees successfully configured in database!');
}

migrateAiEmployeeSchema()
  .catch(err => {
    console.error('[AI Schema Migration Error]:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

