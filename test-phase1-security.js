/**
 * Phase 1 Security Regression Test Suite
 * AAA CRM -> IT Company CRM Adaptation
 * 
 * Tests:
 * 1. Authentication Security & Backdoor Removal
 * 2. Role-Based Access Control & IDOR Prevention on Leads API
 * 3. Role-Based Access Control & IDOR Prevention on Consultations API
 */

const assert = require('assert');

// Mock response object generator
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

async function runSecurityTests() {
  console.log('====================================================');
  console.log('=== RUNNING PHASE 1 SECURITY REGRESSION TEST SUITE ===');
  console.log('====================================================\n');

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

  // --- PART 1: AUTH CONTROLLER BACKDOOR REMOVAL TESTS ---
  console.log('--- TEST GROUP 1: AUTHENTICATION BACKDOOR REMOVAL ---');
  const { login } = require('./src/controllers/authController');
  const prisma = require('./src/config/db');
  const bcrypt = require('bcrypt');

  // Backup original prisma methods
  const originalFindUniqueUser = prisma.user.findUnique;
  const originalUpdateUser = prisma.user.update;

  try {
    const realHashedPassword = await bcrypt.hash('CorrectSecret123!', 10);
    const mockAdminUser = {
      id: 'admin-uuid-1',
      email: 'superadmin@aaaconsultancy.com',
      fullName: 'Super Admin',
      role: 'super_admin',
      password: realHashedPassword,
      customPermissions: null
    };

    // Mock prisma.user.findUnique
    prisma.user.findUnique = async ({ where }) => {
      if (where.email === 'superadmin@aaaconsultancy.com') {
        return { ...mockAdminUser };
      }
      return null;
    };

    let userUpdatedCalled = false;
    prisma.user.update = async () => {
      userUpdatedCalled = true;
      return mockAdminUser;
    };

    // Test 1.1: Invalid password should fail with 401
    const req1 = { body: { email: 'superadmin@aaaconsultancy.com', password: 'CompletelyWrongPassword' } };
    const res1 = createMockRes();
    await login(req1, res1);
    recordTest(
      'Login fails with 401 for incorrect password',
      res1.statusCode === 401 && res1.responseData.message === 'Invalid credentials'
    );

    // Test 1.2: Old backdoor password (password123) MUST FAIL with 401 and MUST NOT overwrite password
    userUpdatedCalled = false;
    const req2 = { body: { email: 'superadmin@aaaconsultancy.com', password: 'password123' } };
    const res2 = createMockRes();
    await login(req2, res2);
    recordTest(
      'Backdoor attempt "password123" is blocked with 401 and DB password is not overwritten',
      res2.statusCode === 401 && userUpdatedCalled === false
    );

    // Test 1.3: Old backdoor password (superadmin123) MUST FAIL with 401
    userUpdatedCalled = false;
    const req3 = { body: { email: 'superadmin@aaaconsultancy.com', password: 'superadmin123' } };
    const res3 = createMockRes();
    await login(req3, res3);
    recordTest(
      'Backdoor attempt "superadmin123" is blocked with 401 and DB password is not overwritten',
      res3.statusCode === 401 && userUpdatedCalled === false
    );

    // Test 1.4: Legitimate verified bcrypt password succeeds with 200 and token
    const req4 = { body: { email: 'superadmin@aaaconsultancy.com', password: 'CorrectSecret123!' } };
    const res4 = createMockRes();
    await login(req4, res4);
    recordTest(
      'Legitimate admin password succeeds with 200, JWT token, and user payload',
      res4.statusCode === 200 && typeof res4.responseData.token === 'string' && res4.responseData.user.role === 'super_admin'
    );
  } finally {
    prisma.user.findUnique = originalFindUniqueUser;
    prisma.user.update = originalUpdateUser;
  }

  // --- PART 2: LEADS CONTROLLER SERVER-SIDE SCOPING TESTS ---
  console.log('\n--- TEST GROUP 2: LEADS SERVER-SIDE DATA ISOLATION ---');
  const { getLeads, getLeadById, updateLead, updateLeadStatus, assignLead } = require('./src/controllers/leadController');

  const mockLeads = [
    { id: 'lead-1', firstName: 'Alice', lastName: 'Smith', assignedToId: 'consultant-1', serviceType: 'Web Dev', createdAt: new Date() },
    { id: 'lead-2', firstName: 'Bob', lastName: 'Jones', assignedToId: 'consultant-2', serviceType: 'Mobile App', createdAt: new Date() }
  ];

  const originalLeadFindMany = prisma.lead.findMany;
  const originalLeadFindUnique = prisma.lead.findUnique;
  const originalLeadUpdate = prisma.lead.update;

  try {
    // Test 2.1: Super Admin gets all organization leads
    prisma.lead.findMany = async (args) => {
      if (args.select?.id) {
        // Step 1: ID list
        const filtered = args.where?.assignedToId 
          ? mockLeads.filter(l => l.assignedToId === args.where.assignedToId)
          : mockLeads;
        return filtered.map(l => ({ id: l.id }));
      }
      return mockLeads.filter(l => args.where?.id?.in?.includes(l.id));
    };

    const reqAdmin = { user: { id: 'admin-1', role: 'super_admin' } };
    const resAdmin = createMockRes();
    await getLeads(reqAdmin, resAdmin);
    recordTest(
      'Super Admin receives all organization leads (length = 2)',
      Array.isArray(resAdmin.responseData) && resAdmin.responseData.length === 2
    );

    // Test 2.2: Consultant receives ONLY assigned leads
    const reqConsultant1 = { user: { id: 'consultant-1', role: 'consultant' } };
    const resConsultant1 = createMockRes();
    await getLeads(reqConsultant1, resConsultant1);
    recordTest(
      'Consultant 1 receives only their assigned lead (length = 1, id = lead-1)',
      Array.isArray(resConsultant1.responseData) && resConsultant1.responseData.length === 1 && resConsultant1.responseData[0].id === 'lead-1'
    );

    // Test 2.3: Consultant attempting to view another agent\'s lead by ID is BLOCKED with 403
    prisma.lead.findUnique = async ({ where }) => mockLeads.find(l => l.id === where.id) || null;

    const reqIdorView = {
      params: { id: 'lead-2' }, // Belonging to consultant-2
      user: { id: 'consultant-1', role: 'consultant' }
    };
    const resIdorView = createMockRes();
    await getLeadById(reqIdorView, resIdorView);
    recordTest(
      'Consultant attempting to fetch unassigned lead-2 gets 403 Forbidden',
      resIdorView.statusCode === 403 && resIdorView.responseData.message.includes('Access denied')
    );

    // Test 2.4: Consultant authorized to view their own assigned lead gets 200
    const reqOwnView = {
      params: { id: 'lead-1' }, // Belonging to consultant-1
      user: { id: 'consultant-1', role: 'consultant' }
    };
    const resOwnView = createMockRes();
    await getLeadById(reqOwnView, resOwnView);
    recordTest(
      'Consultant authorized to view their own assigned lead gets 200 OK',
      resOwnView.statusCode === 200 && resOwnView.responseData.id === 'lead-1'
    );

    // Test 2.5: Consultant attempting to update unassigned lead gets 403 Forbidden
    const reqIdorUpdate = {
      params: { id: 'lead-2' },
      body: { notes: 'Tampered notes' },
      user: { id: 'consultant-1', role: 'consultant' }
    };
    const resIdorUpdate = createMockRes();
    await updateLead(reqIdorUpdate, resIdorUpdate);
    recordTest(
      'Consultant attempting to update unassigned lead gets 403 Forbidden',
      resIdorUpdate.statusCode === 403 && resIdorUpdate.responseData.message.includes('Access denied')
    );

    // Test 2.6: Consultant attempting to assign leads gets 403 Forbidden
    const reqAssignBlock = {
      body: { leadId: 'lead-1', agentId: 'consultant-2' },
      user: { id: 'consultant-1', role: 'consultant' }
    };
    const resAssignBlock = createMockRes();
    await assignLead(reqAssignBlock, resAssignBlock);
    recordTest(
      'Consultant attempting to assign/reassign leads is blocked with 403 Forbidden',
      resAssignBlock.statusCode === 403 && resAssignBlock.responseData.message.includes('Access denied')
    );

    // Test 2.7: Consultant attempting to update unassigned lead status gets 403 Forbidden
    const reqStatusIdor = {
      body: { leadId: 'lead-2', status: 'Lost' },
      user: { id: 'consultant-1', role: 'consultant' }
    };
    const resStatusIdor = createMockRes();
    await updateLeadStatus(reqStatusIdor, resStatusIdor);
    recordTest(
      'Consultant attempting to update status on unassigned lead gets 403 Forbidden',
      resStatusIdor.statusCode === 403 && resStatusIdor.responseData.message.includes('Access denied')
    );
  } finally {
    prisma.lead.findMany = originalLeadFindMany;
    prisma.lead.findUnique = originalLeadFindUnique;
    prisma.lead.update = originalLeadUpdate;
  }

  // --- PART 3: CONSULTATIONS CONTROLLER SERVER-SIDE SCOPING TESTS ---
  console.log('\n--- TEST GROUP 3: CONSULTATIONS SERVER-SIDE DATA ISOLATION ---');
  const { getConsultations, updateOutcome, respondToConsultation } = require('./src/controllers/consultationController');

  const mockConsultations = [
    { id: 'c-1', date: '2026-11-01', timeSlot: '10:00', consultantId: 'consultant-1', status: 'Scheduled', lead: { firstName: 'Alice', lastName: 'Smith' } },
    { id: 'c-2', date: '2026-11-01', timeSlot: '11:00', consultantId: 'consultant-2', status: 'Scheduled', lead: { firstName: 'Bob', lastName: 'Jones' } }
  ];

  const originalConsultFindMany = prisma.consultation.findMany;
  const originalConsultFindUnique = prisma.consultation.findUnique;
  const originalLeadFindManyG3 = prisma.lead.findMany;

  try {
    prisma.lead.findMany = async () => [];
    prisma.consultation.findMany = async ({ where }) => {
      if (where?.consultantId) {
        return mockConsultations.filter(c => c.consultantId === where.consultantId);
      }
      return mockConsultations;
    };

    prisma.consultation.findUnique = async ({ where }) => {
      return mockConsultations.find(c => c.id === where.id) || null;
    };

    // Test 3.1: Super Admin lists all consultations
    const reqConsultAdmin = { user: { id: 'admin-1', role: 'super_admin' }, app: {} };
    const resConsultAdmin = createMockRes();
    await getConsultations(reqConsultAdmin, resConsultAdmin);
    recordTest(
      'Super Admin receives all consultations (length = 2)',
      Array.isArray(resConsultAdmin.responseData) && resConsultAdmin.responseData.length === 2
    );

    // Test 3.2: Consultant lists only their assigned consultations
    const reqConsultAgent = { user: { id: 'consultant-1', role: 'consultant' }, app: {} };
    const resConsultAgent = createMockRes();
    await getConsultations(reqConsultAgent, resConsultAgent);
    recordTest(
      'Consultant 1 receives only their assigned consultation (length = 1, id = c-1)',
      Array.isArray(resConsultAgent.responseData) && resConsultAgent.responseData.length === 1 && resConsultAgent.responseData[0].id === 'c-1'
    );

    // Test 3.3: Consultant attempting to update outcome of unassigned consultation gets 403
    const reqOutcomeIdor = {
      params: { id: 'c-2' }, // Belonging to consultant-2
      body: { status: 'Completed', notes: 'Unauthorized tampering' },
      user: { id: 'consultant-1', role: 'consultant' }
    };
    const resOutcomeIdor = createMockRes();
    await updateOutcome(reqOutcomeIdor, resOutcomeIdor);
    recordTest(
      'Consultant attempting to update outcome for unassigned consultation gets 403 Forbidden',
      resOutcomeIdor.statusCode === 403 && resOutcomeIdor.responseData.message.includes('Access denied')
    );

    // Test 3.4: Consultant attempting to respond to unassigned consultation gets 403
    const reqRespondIdor = {
      params: { id: 'c-2' },
      body: { action: 'decline' },
      user: { id: 'consultant-1', role: 'consultant' }
    };
    const resRespondIdor = createMockRes();
    await respondToConsultation(reqRespondIdor, resRespondIdor);
    recordTest(
      'Consultant attempting to respond (accept/decline) to unassigned consultation gets 403 Forbidden',
      resRespondIdor.statusCode === 403 && resRespondIdor.responseData.message.includes('Access denied')
    );
  } finally {
    prisma.consultation.findMany = originalConsultFindMany;
    prisma.consultation.findUnique = originalConsultFindUnique;
    prisma.lead.findMany = originalLeadFindManyG3;
  }

  console.log('\n====================================================');
  console.log(`=== REGRESSION SUITE RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
