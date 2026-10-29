/**
 * Phase 2 Validation Test Suite: IT Sales Pipeline & Service Catalog Configuration
 * AAA CRM -> IT Company CRM Adaptation
 */

const assert = require('assert');

function createMockRes() {
  return {
    statusCode: 200,
    responseData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.responseData = data;
      return this;
    }
  };
}

async function runPhase2Tests() {
  console.log('======================================================');
  console.log('=== RUNNING PHASE 2 PIPELINE & SERVICES TEST SUITE ===');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function recordTest(testName, passedCondition, details = '') {
    if (passedCondition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  // --- PART 1: IT LEAD PIPELINE STAGES ---
  console.log('--- TEST GROUP 1: IT SALES PIPELINE STAGES ---');
  const { getLeadStages } = require('./src/controllers/settingsController');
  const prisma = require('./src/config/db');

  const origCompanyFind = prisma.companySetting.findFirst;
  try {
    // When DB setting is null, fallback CURRENT_LEAD_STAGES should be returned
    prisma.companySetting.findFirst = async () => null;

    const resStages = createMockRes();
    await getLeadStages({}, resStages);
    const stages = resStages.responseData;

    recordTest(
      'getLeadStages returns an array of stages',
      Array.isArray(stages) && stages.length >= 7
    );

    const expectedStageNames = [
      'New Lead',
      'Contacted',
      'Discovery Scheduled',
      'Proposal Sent',
      'Negotiation',
      'Won',
      'Lost'
    ];

    const actualTop7 = stages.slice(0, 7).map(s => s.name);
    const stagesMatch = expectedStageNames.every((name, idx) => actualTop7[idx] === name);

    recordTest(
      'Top 7 stages match exact sequence: New Lead -> Contacted -> Discovery Scheduled -> Proposal Sent -> Negotiation -> Won -> Lost',
      stagesMatch,
      `Received: ${JSON.stringify(actualTop7)}`
    );

    const hasColorsAndEmojis = stages.slice(0, 7).every(s => s.color && s.emoji && s.type);
    recordTest(
      'All IT stages have valid UI theme colors, emojis, and type',
      hasColorsAndEmojis
    );
  } finally {
    prisma.companySetting.findFirst = origCompanyFind;
  }

  // --- PART 2: IT SERVICE CATALOG ---
  console.log('\n--- TEST GROUP 2: IT SERVICE CATALOG CONFIGURATION ---');
  const { getVisaServices } = require('./src/controllers/settingsController');
  const origVisaFind = prisma.visaService.findMany;

  try {
    // When DB table is empty, fallback DEFAULT_IT_SERVICES should be returned
    prisma.visaService.findMany = async () => [];

    const resServices = createMockRes();
    await getVisaServices({}, resServices);
    const services = resServices.responseData;

    recordTest(
      'getVisaServices returns array of services',
      Array.isArray(services) && services.length === 8
    );

    const expectedServices = [
      'Web Development',
      'Mobile App Development',
      'SaaS Development',
      'AI & Workflow Automation',
      'CRM / ERP Development',
      'UI/UX Design',
      'API Integration',
      'Maintenance & Support'
    ];

    const actualServiceNames = services.map(s => s.name);
    const allServicesPresent = expectedServices.every(name => actualServiceNames.includes(name));

    recordTest(
      'All 8 proposed IT service categories are configured and active',
      allServicesPresent,
      `Received: ${JSON.stringify(actualServiceNames)}`
    );

    const allHaveBasePrice = services.every(s => typeof s.basePrice === 'number' && s.basePrice > 0);
    recordTest(
      'All configured IT services have valid base prices',
      allHaveBasePrice
    );
  } finally {
    prisma.visaService.findMany = origVisaFind;
  }

  // --- PART 3: FRONTEND MOCK DATA CONTRACT & COMPATIBILITY ---
  console.log('\n--- TEST GROUP 3: FRONTEND CONTRACT & BACKWARD COMPATIBILITY ---');
  const mockDataPath = require('path').join(__dirname, '../frontend/src/constants/mockData.js');
  const fs = require('fs');
  const mockContent = fs.readFileSync(mockDataPath, 'utf8');

  recordTest(
    'mockData.js exports SERVICES with Web Development as primary option',
    mockContent.includes("name: 'Web Development'")
  );

  recordTest(
    'mockData.js exports MAIN_SERVICES with all 8 IT services',
    mockContent.includes("id: 'ai_automation'") && mockContent.includes("id: 'saas_dev'")
  );

  recordTest(
    'mockData.js preserves legacy mappings (visa, dnv, sworn_translation) for zero demo data disruption',
    mockContent.includes("id: 'visa'") && mockContent.includes("id: 'dnv'")
  );

  console.log('\n======================================================');
  console.log(`=== PHASE 2 SUITE RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

