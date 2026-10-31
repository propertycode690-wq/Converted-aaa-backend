/**
 * deploy.js — Railway Safe Startup Script & Auto-Migration Enforcer
 *
 * Guarantees Phase 2 & Phase B database schema columns & tables exist on production MySQL/MariaDB:
 *   - documents.checklistItemId, version, reviewedById, reviewedAt
 *   - application_cycles phase 2 columns
 *   - resubmission_checklist_items table
 *   - consultations.clientId
 *   - relocation_packages.isRefundable
 *   - leads.companyName, leads.dealValue, leads.currency
 *   - leads_companyName_idx index on leads(companyName)
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function columnExists(table, column) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name   = ?
         AND column_name  = ?`,
      table,
      column
    );
    return Number(rows[0].cnt) > 0;
  } catch (err) {
    throw new Error(`Failed to check column existence for \`${table}.${column}\`: ${err.message}`);
  }
}

async function tableExists(table) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name   = ?`,
      table
    );
    return Number(rows[0].cnt) > 0;
  } catch (err) {
    throw new Error(`Failed to check table existence for \`${table}\`: ${err.message}`);
  }
}

async function indexExists(table, indexName) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name   = ?
         AND index_name   = ?`,
      table,
      indexName
    );
    return Number(rows[0].cnt) > 0;
  } catch (err) {
    throw new Error(`Failed to check index existence for \`${indexName}\` on \`${table}\`: ${err.message}`);
  }
}

async function ensurePhase2Schema() {
  console.log('[Deploy] Checking database schema for Phase 2 columns & tables...');

  // 1. Ensure resubmission_checklist_items table exists
  const hasChecklistTable = await tableExists('resubmission_checklist_items');
  if (!hasChecklistTable) {
    console.log('[Deploy] Creating table `resubmission_checklist_items`...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`resubmission_checklist_items\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`applicationId\` VARCHAR(191) NOT NULL,
        \`templateKey\` VARCHAR(191) NOT NULL,
        \`belongsTo\` VARCHAR(191) NOT NULL DEFAULT 'Main Applicant',
        \`category\` VARCHAR(191) NOT NULL,
        \`title\` VARCHAR(191) NOT NULL,
        \`isMandatory\` BOOLEAN NOT NULL DEFAULT true,
        \`dueDate\` DATETIME(3) NULL,
        \`clientInstructions\` TEXT NULL,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'MISSING',
        \`sourceDocumentId\` VARCHAR(191) NULL,
        \`activeDocumentId\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        UNIQUE INDEX \`resubmission_checklist_items_activeDocumentId_key\`(\`activeDocumentId\`),
        INDEX \`resubmission_checklist_items_applicationId_idx\`(\`applicationId\`),
        INDEX \`resubmission_checklist_items_status_idx\`(\`status\`),
        INDEX \`resubmission_checklist_items_sourceDocumentId_idx\`(\`sourceDocumentId\`),
        UNIQUE INDEX \`rci_appId_tmplKey_belongsTo_key\`(\`applicationId\`, \`templateKey\`, \`belongsTo\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('[Deploy] Table `resubmission_checklist_items` created successfully.');
  } else {
    console.log('[Deploy] Table `resubmission_checklist_items`: OK');
  }

  // 2. Ensure documents table columns exist
  const docCols = [
    { name: 'checklistItemId', sql: 'ALTER TABLE `documents` ADD COLUMN `checklistItemId` VARCHAR(191) NULL;' },
    { name: 'version',          sql: 'ALTER TABLE `documents` ADD COLUMN `version` INT NOT NULL DEFAULT 1;' },
    { name: 'reviewedById',     sql: 'ALTER TABLE `documents` ADD COLUMN `reviewedById` VARCHAR(191) NULL;' },
    { name: 'reviewedAt',       sql: 'ALTER TABLE `documents` ADD COLUMN `reviewedAt` DATETIME(3) NULL;' }
  ];

  for (const col of docCols) {
    const exists = await columnExists('documents', col.name);
    if (!exists) {
      console.log(`[Deploy] Adding column \`documents.${col.name}\`...`);
      try {
        await prisma.$executeRawUnsafe(col.sql);
        console.log(`[Deploy] Column \`documents.${col.name}\` added.`);
      } catch (err) {
        console.log(`[Deploy] Note on \`documents.${col.name}\`: ${err.message}`);
      }
    } else {
      console.log(`[Deploy] Column \`documents.${col.name}\`: OK`);
    }
  }

  // 3. Ensure application_cycles table columns exist
  const cycleCols = [
    { name: 'submissionReference',  sql: 'ALTER TABLE `application_cycles` ADD COLUMN `submissionReference` VARCHAR(191) NULL;' },
    { name: 'submissionNotes',      sql: 'ALTER TABLE `application_cycles` ADD COLUMN `submissionNotes` TEXT NULL;' },
    { name: 'submissionReceiptUrl', sql: 'ALTER TABLE `application_cycles` ADD COLUMN `submissionReceiptUrl` VARCHAR(191) NULL;' },
    { name: 'submittedById',        sql: 'ALTER TABLE `application_cycles` ADD COLUMN `submittedById` VARCHAR(191) NULL;' },
    { name: 'submittedAt',          sql: 'ALTER TABLE `application_cycles` ADD COLUMN `submittedAt` DATETIME(3) NULL;' },
    { name: 'closureReason',        sql: 'ALTER TABLE `application_cycles` ADD COLUMN `closureReason` TEXT NULL;' },
    { name: 'closedById',           sql: 'ALTER TABLE `application_cycles` ADD COLUMN `closedById` VARCHAR(191) NULL;' },
    { name: 'closedAt',             sql: 'ALTER TABLE `application_cycles` ADD COLUMN `closedAt` DATETIME(3) NULL;' }
  ];

  for (const col of cycleCols) {
    const exists = await columnExists('application_cycles', col.name);
    if (!exists) {
      console.log(`[Deploy] Adding column \`application_cycles.${col.name}\`...`);
      try {
        await prisma.$executeRawUnsafe(col.sql);
        console.log(`[Deploy] Column \`application_cycles.${col.name}\` added.`);
      } catch (err) {
        console.log(`[Deploy] Note on \`application_cycles.${col.name}\`: ${err.message}`);
      }
    } else {
      console.log(`[Deploy] Column \`application_cycles.${col.name}\`: OK`);
    }
  }

  // 4. Ensure consultations table columns exist
  const consultationCols = [
    { name: 'clientId', sql: 'ALTER TABLE `consultations` ADD COLUMN `clientId` VARCHAR(191) NULL;' }
  ];

  for (const col of consultationCols) {
    const exists = await columnExists('consultations', col.name);
    if (!exists) {
      console.log(`[Deploy] Adding column \`consultations.${col.name}\`...`);
      try {
        await prisma.$executeRawUnsafe(col.sql);
        console.log(`[Deploy] Column \`consultations.${col.name}\` added.`);
      } catch (err) {
        console.log(`[Deploy] Note on \`consultations.${col.name}\`: ${err.message}`);
      }
    } else {
      console.log(`[Deploy] Column \`consultations.${col.name}\`: OK`);
    }
  }

  // 5. Ensure relocation_packages table isRefundable column exists
  const pkgCols = [
    { name: 'isRefundable', sql: 'ALTER TABLE `relocation_packages` ADD COLUMN `isRefundable` BOOLEAN NOT NULL DEFAULT false;' }
  ];

  for (const col of pkgCols) {
    const exists = await columnExists('relocation_packages', col.name);
    if (!exists) {
      console.log(`[Deploy] Adding column \`relocation_packages.${col.name}\`...`);
      try {
        await prisma.$executeRawUnsafe(col.sql);
        console.log(`[Deploy] Column \`relocation_packages.${col.name}\` added.`);
      } catch (err) {
        console.log(`[Deploy] Note on \`relocation_packages.${col.name}\`: ${err.message}`);
      }
    } else {
      console.log(`[Deploy] Column \`relocation_packages.${col.name}\`: OK`);
    }
  }
}

async function ensurePhaseBSchema() {
  console.log('[Deploy] Checking database schema for Phase B leads commercial fields...');

  // 1. Verify required leads table exists
  const hasLeadsTable = await tableExists('leads');
  if (!hasLeadsTable) {
    throw new Error('Required table `leads` does not exist in the database.');
  }

  // 2. Ensure leads table commercial columns exist
  const leadCols = [
    {
      name: 'companyName',
      sql: 'ALTER TABLE `leads` ADD COLUMN `companyName` VARCHAR(191) NULL AFTER `budget`;'
    },
    {
      name: 'dealValue',
      sql: 'ALTER TABLE `leads` ADD COLUMN `dealValue` DECIMAL(12, 2) NULL AFTER `companyName`;'
    },
    {
      name: 'currency',
      sql: "ALTER TABLE `leads` ADD COLUMN `currency` VARCHAR(10) NOT NULL DEFAULT 'USD' AFTER `dealValue`;"
    }
  ];

  for (const col of leadCols) {
    const exists = await columnExists('leads', col.name);
    if (!exists) {
      console.log(`[Deploy] Adding column \`leads.${col.name}\`...`);
      try {
        await prisma.$executeRawUnsafe(col.sql);
      } catch (err) {
        throw new Error(`Failed to add column \`leads.${col.name}\`: ${err.message}`);
      }

      // Verify column exists after creation
      const verified = await columnExists('leads', col.name);
      if (!verified) {
        throw new Error(`Verification failed: Column \`leads.${col.name}\` was not created.`);
      }
      console.log(`[Deploy] Column \`leads.${col.name}\` added and verified.`);
    } else {
      console.log(`[Deploy] Column \`leads.${col.name}\`: OK`);
    }
  }

  // 3. Ensure leads_companyName_idx index exists
  const hasIndex = await indexExists('leads', 'leads_companyName_idx');
  if (!hasIndex) {
    console.log('[Deploy] Creating index `leads_companyName_idx` on `leads`(`companyName`)...');
    try {
      await prisma.$executeRawUnsafe('CREATE INDEX `leads_companyName_idx` ON `leads` (`companyName`);');
    } catch (err) {
      throw new Error(`Failed to create index \`leads_companyName_idx\`: ${err.message}`);
    }

    // Verify index exists after creation
    const indexVerified = await indexExists('leads', 'leads_companyName_idx');
    if (!indexVerified) {
      throw new Error('Verification failed: Index `leads_companyName_idx` was not created.');
    }
    console.log('[Deploy] Index `leads_companyName_idx` created and verified.');
  } else {
    console.log('[Deploy] Index `leads_companyName_idx`: OK');
  }

  // 4. Safe repeatable backfill: only backfills where companyName is NULL and qualificationData has valid non-empty companyName
  try {
    const backfillSql = `
      UPDATE \`leads\`
      SET \`companyName\` = JSON_UNQUOTE(JSON_EXTRACT(\`qualificationData\`, '$.companyName'))
      WHERE \`companyName\` IS NULL
        AND \`qualificationData\` IS NOT NULL
        AND JSON_VALID(\`qualificationData\`) = 1
        AND JSON_EXTRACT(\`qualificationData\`, '$.companyName') IS NOT NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(\`qualificationData\`, '$.companyName')) != ''
        AND JSON_UNQUOTE(JSON_EXTRACT(\`qualificationData\`, '$.companyName')) != 'null';
    `;
    const backfilled = await prisma.$executeRawUnsafe(backfillSql);
    if (backfilled > 0) {
      console.log(`[Deploy] Backfilled companyName for ${backfilled} lead(s) from qualificationData.`);
    }
  } catch (err) {
    console.warn(`[Deploy] Note on \`leads.companyName\` backfill: ${err.message}`);
  }
}

async function ensureSmartQrSchema() {
  console.log('[Deploy] Checking database schema for Smart QR Review System tables...');

  // 1. Ensure `qr_codes` table exists
  const hasQrCodes = await tableExists('qr_codes');
  if (!hasQrCodes) {
    console.log('[Deploy] Creating table `qr_codes`...');
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`qr_codes\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`tenantId\` VARCHAR(191) NOT NULL DEFAULT 'default',
          \`slug\` VARCHAR(100) NOT NULL,
          \`codeLabel\` VARCHAR(191) NOT NULL,
          \`locationName\` VARCHAR(191) NULL,
          \`campaignName\` VARCHAR(191) NULL,
          \`targetType\` VARCHAR(50) NOT NULL DEFAULT 'REVIEW_PAGE',
          \`destinationUrl\` TEXT NOT NULL,
          \`googleReviewUrl\` TEXT NULL,
          \`scanCount\` INT NOT NULL DEFAULT 0,
          \`googleReviewClicks\` INT NOT NULL DEFAULT 0,
          \`feedbackSubmissions\` INT NOT NULL DEFAULT 0,
          \`isActive\` BOOLEAN NOT NULL DEFAULT true,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          UNIQUE INDEX \`qr_codes_slug_key\`(\`slug\`),
          INDEX \`qr_codes_tenantId_idx\`(\`tenantId\`),
          INDEX \`qr_codes_slug_idx\`(\`slug\`),
          INDEX \`qr_codes_isActive_idx\`(\`isActive\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
    } catch (err) {
      throw new Error(`Failed to create table \`qr_codes\`: ${err.message}`);
    }

    const verified = await tableExists('qr_codes');
    if (!verified) {
      throw new Error('Verification failed: Table `qr_codes` was not created.');
    }
    console.log('[Deploy] Table `qr_codes` created and verified.');
  } else {
    console.log('[Deploy] Table `qr_codes`: OK');
  }

  // 2. Ensure `customer_feedbacks` table exists
  const hasFeedbacks = await tableExists('customer_feedbacks');
  if (!hasFeedbacks) {
    console.log('[Deploy] Creating table `customer_feedbacks`...');
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`customer_feedbacks\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`tenantId\` VARCHAR(191) NOT NULL DEFAULT 'default',
          \`qrCodeId\` VARCHAR(191) NULL,
          \`rating\` INT NOT NULL,
          \`feedbackCategory\` VARCHAR(100) NULL,
          \`customerName\` VARCHAR(191) NULL,
          \`customerEmail\` VARCHAR(191) NULL,
          \`customerPhone\` VARCHAR(50) NULL,
          \`feedbackText\` TEXT NULL,
          \`sentiment\` VARCHAR(20) NOT NULL DEFAULT 'NEUTRAL',
          \`isResolved\` BOOLEAN NOT NULL DEFAULT false,
          \`deviceFingerprint\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          INDEX \`customer_feedbacks_tenantId_idx\`(\`tenantId\`),
          INDEX \`customer_feedbacks_qrCodeId_idx\`(\`qrCodeId\`),
          INDEX \`customer_feedbacks_rating_idx\`(\`rating\`),
          INDEX \`customer_feedbacks_createdAt_idx\`(\`createdAt\`),
          CONSTRAINT \`customer_feedbacks_qrCodeId_fkey\` FOREIGN KEY (\`qrCodeId\`) REFERENCES \`qr_codes\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
    } catch (err) {
      throw new Error(`Failed to create table \`customer_feedbacks\`: ${err.message}`);
    }

    const verified = await tableExists('customer_feedbacks');
    if (!verified) {
      throw new Error('Verification failed: Table `customer_feedbacks` was not created.');
    }
    console.log('[Deploy] Table `customer_feedbacks` created and verified.');
  } else {
    console.log('[Deploy] Table `customer_feedbacks`: OK');
  }

  // 3. Ensure `customer_complaints` table exists
  const hasComplaints = await tableExists('customer_complaints');
  if (!hasComplaints) {
    console.log('[Deploy] Creating table `customer_complaints`...');
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`customer_complaints\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`tenantId\` VARCHAR(191) NOT NULL DEFAULT 'default',
          \`ticketNumber\` VARCHAR(50) NOT NULL,
          \`feedbackId\` VARCHAR(191) NULL,
          \`qrCodeId\` VARCHAR(191) NULL,
          \`priority\` VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
          \`status\` VARCHAR(30) NOT NULL DEFAULT 'OPEN',
          \`issueCategory\` VARCHAR(100) NOT NULL,
          \`customerName\` VARCHAR(191) NULL,
          \`customerContact\` VARCHAR(191) NULL,
          \`description\` TEXT NOT NULL,
          \`internalNotes\` LONGTEXT NULL,
          \`assignedToId\` VARCHAR(191) NULL,
          \`resolutionNotes\` TEXT NULL,
          \`resolvedAt\` DATETIME(3) NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          UNIQUE INDEX \`customer_complaints_ticketNumber_key\`(\`ticketNumber\`),
          UNIQUE INDEX \`customer_complaints_feedbackId_key\`(\`feedbackId\`),
          INDEX \`customer_complaints_tenantId_idx\`(\`tenantId\`),
          INDEX \`customer_complaints_status_idx\`(\`status\`),
          INDEX \`customer_complaints_priority_idx\`(\`priority\`),
          INDEX \`customer_complaints_assignedToId_idx\`(\`assignedToId\`),
          INDEX \`customer_complaints_createdAt_idx\`(\`createdAt\`),
          CONSTRAINT \`customer_complaints_feedbackId_fkey\` FOREIGN KEY (\`feedbackId\`) REFERENCES \`customer_feedbacks\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT \`customer_complaints_qrCodeId_fkey\` FOREIGN KEY (\`qrCodeId\`) REFERENCES \`qr_codes\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT \`customer_complaints_assignedToId_fkey\` FOREIGN KEY (\`assignedToId\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
    } catch (err) {
      throw new Error(`Failed to create table \`customer_complaints\`: ${err.message}`);
    }

    const verified = await tableExists('customer_complaints');
    if (!verified) {
      throw new Error('Verification failed: Table `customer_complaints` was not created.');
    }
    console.log('[Deploy] Table `customer_complaints` created and verified.');
  } else {
    console.log('[Deploy] Table `customer_complaints`: OK');
  }

  // 4. Ensure `qr_analytics_events` table exists
  const hasAnalytics = await tableExists('qr_analytics_events');
  if (!hasAnalytics) {
    console.log('[Deploy] Creating table `qr_analytics_events`...');
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`qr_analytics_events\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`tenantId\` VARCHAR(191) NOT NULL DEFAULT 'default',
          \`qrCodeId\` VARCHAR(191) NOT NULL,
          \`eventType\` VARCHAR(50) NOT NULL,
          \`deviceType\` VARCHAR(50) NULL,
          \`referrer\` TEXT NULL,
          \`ipHash\` VARCHAR(64) NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          INDEX \`qr_analytics_events_tenantId_idx\`(\`tenantId\`),
          INDEX \`qr_analytics_events_qrCodeId_idx\`(\`qrCodeId\`),
          INDEX \`qr_analytics_events_eventType_idx\`(\`eventType\`),
          INDEX \`qr_analytics_events_createdAt_idx\`(\`createdAt\`),
          CONSTRAINT \`qr_analytics_events_qrCodeId_fkey\` FOREIGN KEY (\`qrCodeId\`) REFERENCES \`qr_codes\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
    } catch (err) {
      throw new Error(`Failed to create table \`qr_analytics_events\`: ${err.message}`);
    }

    const verified = await tableExists('qr_analytics_events');
    if (!verified) {
      throw new Error('Verification failed: Table `qr_analytics_events` was not created.');
    }
    console.log('[Deploy] Table `qr_analytics_events` created and verified.');
  } else {
    console.log('[Deploy] Table `qr_analytics_events`: OK');
  }

  // 5. Ensure `qr_business_settings` table exists
  const hasSettings = await tableExists('qr_business_settings');
  if (!hasSettings) {
    console.log('[Deploy] Creating table `qr_business_settings`...');
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`qr_business_settings\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`tenantId\` VARCHAR(191) NOT NULL DEFAULT 'default',
          \`businessName\` VARCHAR(191) NOT NULL DEFAULT 'My Business',
          \`businessType\` VARCHAR(50) NOT NULL DEFAULT 'RESTAURANT',
          \`logoUrl\` TEXT NULL,
          \`primaryColor\` VARCHAR(20) NOT NULL DEFAULT '#2563EB',
          \`googlePlaceId\` VARCHAR(191) NULL,
          \`googleReviewUrl\` TEXT NULL,
          \`welcomeMessage\` TEXT NULL,
          \`privateFeedbackHeader\` TEXT NULL,
          \`notifyEmail\` VARCHAR(191) NULL,
          \`notifyWhatsapp\` VARCHAR(50) NULL,
          \`notifyOnNegativeFeedback\` BOOLEAN NOT NULL DEFAULT true,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          UNIQUE INDEX \`qr_business_settings_tenantId_key\`(\`tenantId\`),
          INDEX \`qr_business_settings_tenantId_idx\`(\`tenantId\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
    } catch (err) {
      throw new Error(`Failed to create table \`qr_business_settings\`: ${err.message}`);
    }

    const verified = await tableExists('qr_business_settings');
    if (!verified) {
      throw new Error('Verification failed: Table `qr_business_settings` was not created.');
    }
    console.log('[Deploy] Table `qr_business_settings` created and verified.');
  } else {
    console.log('[Deploy] Table `qr_business_settings`: OK');
  }
}

async function ensureItProjectSchema() {
  console.log('[Deploy] Checking database schema for IT Project & Delivery tables...');

  // 1. projects
  const hasProjects = await tableExists('projects');
  if (!hasProjects) {
    console.log('[Deploy] Creating table `projects`...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`projects\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`projectCode\` VARCHAR(191) NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`description\` TEXT NULL,
        \`serviceType\` VARCHAR(191) NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'PLANNING',
        \`priority\` VARCHAR(50) NOT NULL DEFAULT 'MEDIUM',
        \`health\` VARCHAR(50) NOT NULL DEFAULT 'ON_TRACK',
        \`startDate\` DATETIME(3) NULL,
        \`deadline\` DATETIME(3) NULL,
        \`completedAt\` DATETIME(3) NULL,
        \`budget\` DOUBLE NOT NULL DEFAULT 0,
        \`spentBudget\` DOUBLE NOT NULL DEFAULT 0,
        \`currency\` VARCHAR(10) NOT NULL DEFAULT 'USD',
        \`repositoryUrl\` VARCHAR(255) NULL,
        \`stagingUrl\` VARCHAR(255) NULL,
        \`productionUrl\` VARCHAR(255) NULL,
        \`techStack\` JSON NULL,
        \`clientId\` VARCHAR(191) NOT NULL,
        \`projectManagerId\` VARCHAR(191) NULL,
        \`deliveryManagerId\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`projects_projectCode_key\`(\`projectCode\`),
        INDEX \`projects_clientId_idx\`(\`clientId\`),
        INDEX \`projects_status_idx\`(\`status\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('[Deploy] Table `projects` created.');
  } else {
    console.log('[Deploy] Table `projects`: OK');
  }

  // 2. project_milestones
  const hasMilestones = await tableExists('project_milestones');
  if (!hasMilestones) {
    console.log('[Deploy] Creating table `project_milestones`...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`project_milestones\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`projectId\` VARCHAR(191) NOT NULL,
        \`title\` VARCHAR(191) NOT NULL,
        \`description\` TEXT NULL,
        \`milestoneType\` VARCHAR(50) NOT NULL DEFAULT 'MILESTONE',
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        \`startDate\` DATETIME(3) NULL,
        \`dueDate\` DATETIME(3) NULL,
        \`completedAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`project_milestones_projectId_idx\`(\`projectId\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('[Deploy] Table `project_milestones` created.');
  } else {
    console.log('[Deploy] Table `project_milestones`: OK');
  }

  // 3. project_tasks
  const hasTasks = await tableExists('project_tasks');
  if (!hasTasks) {
    console.log('[Deploy] Creating table `project_tasks`...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`project_tasks\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`projectId\` VARCHAR(191) NOT NULL,
        \`milestoneId\` VARCHAR(191) NULL,
        \`title\` VARCHAR(191) NOT NULL,
        \`description\` TEXT NULL,
        \`taskType\` VARCHAR(50) NOT NULL DEFAULT 'FEATURE',
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'TODO',
        \`priority\` VARCHAR(50) NOT NULL DEFAULT 'MEDIUM',
        \`estimatedHours\` DOUBLE NOT NULL DEFAULT 0,
        \`actualHours\` DOUBLE NOT NULL DEFAULT 0,
        \`assignedToId\` VARCHAR(191) NULL,
        \`dueDate\` DATETIME(3) NULL,
        \`completedAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`project_tasks_projectId_idx\`(\`projectId\`),
        INDEX \`project_tasks_assignedToId_idx\`(\`assignedToId\`),
        INDEX \`project_tasks_status_idx\`(\`status\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('[Deploy] Table `project_tasks` created.');
  } else {
    console.log('[Deploy] Table `project_tasks`: OK');
  }

  // 4. project_time_logs
  const hasTimeLogs = await tableExists('project_time_logs');
  if (!hasTimeLogs) {
    console.log('[Deploy] Creating table `project_time_logs`...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`project_time_logs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`projectId\` VARCHAR(191) NOT NULL,
        \`taskId\` VARCHAR(191) NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`hours\` DOUBLE NOT NULL,
        \`workDate\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`description\` TEXT NULL,
        \`isBillable\` BOOLEAN NOT NULL DEFAULT true,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`project_time_logs_projectId_idx\`(\`projectId\`),
        INDEX \`project_time_logs_userId_idx\`(\`userId\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('[Deploy] Table `project_time_logs` created.');
  } else {
    console.log('[Deploy] Table `project_time_logs`: OK');
  }

  // 5. project_handovers
  const hasHandovers = await tableExists('project_handovers');
  if (!hasHandovers) {
    console.log('[Deploy] Creating table `project_handovers`...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`project_handovers\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`projectId\` VARCHAR(191) NOT NULL,
        \`stage\` VARCHAR(50) NOT NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        \`releaseNotes\` TEXT NULL,
        \`checklist\` JSON NULL,
        \`signOffByName\` VARCHAR(191) NULL,
        \`signOffDate\` DATETIME(3) NULL,
        \`signedOffById\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`project_handovers_projectId_idx\`(\`projectId\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('[Deploy] Table `project_handovers` created.');
  } else {
    console.log('[Deploy] Table `project_handovers`: OK');
  }
}

async function ensureAiEmployeeSchema() {
  console.log('[Deploy] Checking database schema for 7 Autonomous AI Employees...');

  const hasAiAgents = await tableExists('ai_agents');
  if (!hasAiAgents) {
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
    console.log('[Deploy] Table `ai_agents` created.');
  } else {
    console.log('[Deploy] Table `ai_agents`: OK');
  }

  const hasTaskExec = await tableExists('ai_task_executions');
  if (!hasTaskExec) {
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
    console.log('[Deploy] Table `ai_task_executions` created.');
  } else {
    console.log('[Deploy] Table `ai_task_executions`: OK');
  }

  const hasApprovals = await tableExists('ai_approval_requests');
  if (!hasApprovals) {
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
    console.log('[Deploy] Table `ai_approval_requests` created.');
  } else {
    console.log('[Deploy] Table `ai_approval_requests`: OK');
  }

  const hasDailyMetrics = await tableExists('ai_daily_metrics');
  if (!hasDailyMetrics) {
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
    console.log('[Deploy] Table `ai_daily_metrics` created.');
  } else {
    console.log('[Deploy] Table `ai_daily_metrics`: OK');
  }
}

async function main() {
  console.log('[Deploy] ===== AAA Backend Startup =====');

  try {
    await ensurePhase2Schema();
    console.log('[Deploy] All Phase 2 database schema checks complete.');

    await ensurePhaseBSchema();
    console.log('[Deploy] All Phase B database schema checks complete.');

    await ensureSmartQrSchema();
    console.log('[Deploy] All Smart QR database schema checks complete.');

    await ensureItProjectSchema();
    console.log('[Deploy] All IT Project database schema checks complete.');

    await ensureAiEmployeeSchema();
    console.log('[Deploy] All 7 AI Employees database schema checks complete.');
  } catch (err) {
    console.error(`[Deploy] FATAL: Database schema initialization failed: ${err.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  console.log('[Deploy] Launching Express server (src/app)...');
  require('./src/app');
}

main();
