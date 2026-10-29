const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const assert = require('assert');
const prisma = require('../src/config/db');
const { getLeads, createLead, getLeadById, updateLead } = require('../src/controllers/leadController');
const { getDashboardMetrics } = require('../src/controllers/dashboardController');

function createMockReqRes(body = {}, params = {}, query = {}, user = { id: 'admin-user', role: 'super_admin' }) {
  let statusCode = 200;
  let jsonResult = null;

  const req = {
    body,
    params,
    query,
    user,
    app: { get: () => null }
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResult = data;
      return this;
    }
  };

  return { req, res, getStatus: () => statusCode, getJson: () => jsonResult };
}

async function runEndpointTests() {
  console.log('=== TESTING PHASE B API ENDPOINTS AGAINST LIVE MIGRATED DB ===\n');
  let createdLeadId = null;

  try {
    // 1. CREATE LEAD TEST
    console.log('1. Testing createLead with commercial fields...');
    const createReqRes = createMockReqRes({
      firstName: 'Integration',
      lastName: 'Tester',
      email: 'integration.tester@acme-corp.com',
      phone: '+15550192834',
      companyName: 'Acme Cloud Dynamics',
      dealValue: '25000.50',
      currency: 'USD',
      serviceType: 'Web Development',
      status: 'New Lead'
    });

    await createLead(createReqRes.req, createReqRes.res);
    // Notice createLead in controller doesn't explicitly return json response or returns notification, let's query DB for the created lead
    const createdLead = await prisma.lead.findFirst({
      where: { email: 'integration.tester@acme-corp.com' }
    });

    assert(createdLead, 'Lead was not found in database after createLead');
    createdLeadId = createdLead.id;
    assert.strictEqual(createdLead.companyName, 'Acme Cloud Dynamics', 'companyName does not match');
    assert.strictEqual(Number(createdLead.dealValue), 25000.5, 'dealValue does not match');
    assert.strictEqual(createdLead.currency, 'USD', 'currency does not match');
    console.log(`  ✓ PASS: Lead created (ID: ${createdLeadId}) with companyName: "${createdLead.companyName}", dealValue: ${createdLead.dealValue}, currency: "${createdLead.currency}"`);

    // Allow asynchronous notification & auto-inquiry background tasks to settle
    await new Promise(r => setTimeout(r, 800));

    // 2. GET LEAD BY ID (DETAIL) TEST
    console.log('\n2. Testing getLeadById (Detail endpoint)...');
    const detailReqRes = createMockReqRes({}, { id: createdLeadId });
    await getLeadById(detailReqRes.req, detailReqRes.res);
    const detailData = detailReqRes.getJson();

    assert(detailData, 'getLeadById did not return data');
    assert.strictEqual(detailData.id, createdLeadId);
    assert.strictEqual(detailData.companyName, 'Acme Cloud Dynamics', 'companyName missing from detail response');
    assert.strictEqual(Number(detailData.dealValue), 25000.5, 'dealValue missing from detail response');
    assert.strictEqual(detailData.currency, 'USD', 'currency missing from detail response');
    console.log(`  ✓ PASS: getLeadById returns commercial fields correctly.`);

    // 3. UPDATE LEAD TEST
    console.log('\n3. Testing updateLead with updated commercial fields...');
    const updateReqRes = createMockReqRes({
      companyName: 'Acme Enterprise Global',
      dealValue: 35000,
      currency: 'EUR',
      status: 'Proposal Sent'
    }, { id: createdLeadId });

    await updateLead(updateReqRes.req, updateReqRes.res);
    const updatedLead = await prisma.lead.findUnique({ where: { id: createdLeadId } });
    assert.strictEqual(updatedLead.companyName, 'Acme Enterprise Global');
    assert.strictEqual(Number(updatedLead.dealValue), 35000);
    assert.strictEqual(updatedLead.currency, 'EUR');
    assert.strictEqual(updatedLead.status, 'Proposal Sent');
    console.log(`  ✓ PASS: updateLead updated companyName: "${updatedLead.companyName}", dealValue: ${updatedLead.dealValue}, currency: "${updatedLead.currency}"`);

    // 4. UPDATE LEAD OMISSION TEST (PRESERVES EXISTING DB VALUES)
    console.log('\n4. Testing updateLead with omitted commercial fields (non-destructive update)...');
    const omitReqRes = createMockReqRes({
      status: 'Negotiation'
    }, { id: createdLeadId });

    await updateLead(omitReqRes.req, omitReqRes.res);
    const untouchedLead = await prisma.lead.findUnique({ where: { id: createdLeadId } });
    assert.strictEqual(untouchedLead.companyName, 'Acme Enterprise Global', 'Omitted companyName was overwritten!');
    assert.strictEqual(Number(untouchedLead.dealValue), 35000, 'Omitted dealValue was overwritten!');
    assert.strictEqual(untouchedLead.currency, 'EUR', 'Omitted currency was overwritten!');
    assert.strictEqual(untouchedLead.status, 'Negotiation');
    console.log(`  ✓ PASS: updateLead preserves existing commercial values when omitted.`);

    // 5. GET LEADS (LIST) TEST
    console.log('\n5. Testing getLeads (List endpoint)...');
    const listReqRes = createMockReqRes();
    await getLeads(listReqRes.req, listReqRes.res);
    const listData = listReqRes.getJson();

    assert(Array.isArray(listData), 'getLeads did not return an array');
    const foundInList = listData.find(l => l.id === createdLeadId);
    assert(foundInList, 'Created lead not found in getLeads output');
    assert.strictEqual(foundInList.companyName, 'Acme Enterprise Global');
    assert.strictEqual(Number(foundInList.dealValue), 35000);
    assert.strictEqual(foundInList.currency, 'EUR');
    console.log(`  ✓ PASS: getLeads returns array containing commercial fields for all leads.`);

    // 6. DASHBOARD METRICS TEST
    console.log('\n6. Testing getDashboardMetrics...');
    const dashReqRes = createMockReqRes({}, {}, {}, { id: 'admin-user', role: 'super_admin' });
    await getDashboardMetrics(dashReqRes.req, dashReqRes.res);
    const dashData = dashReqRes.getJson();

    assert(dashData && dashData.success, 'getDashboardMetrics did not return success');
    assert(dashData.data && dashData.data.leads && dashData.data.leads.counts, 'leads.counts missing from dashboard');
    const counts = dashData.data.leads.counts;
    assert(typeof counts.openPipelineValue === 'number', 'openPipelineValue is not a number');
    assert(typeof counts.wonContractValue === 'number', 'wonContractValue is not a number');
    assert(typeof counts.averageDealSize === 'number', 'averageDealSize is not a number');
    assert(counts.openPipelineValue >= 35000, `Expected openPipelineValue >= 35000, got ${counts.openPipelineValue}`);
    console.log(`  ✓ PASS: getDashboardMetrics calculated openPipelineValue: $${counts.openPipelineValue}, wonContractValue: $${counts.wonContractValue}, averageDealSize: $${counts.averageDealSize}`);

    console.log('\n=== ALL 6 ENDPOINT TESTS PASSED WITH 0 ERRORS ===\n');
  } finally {
    // 7. CLEANUP
    if (createdLeadId) {
      await prisma.lead.delete({ where: { id: createdLeadId } }).catch(() => null);
      console.log(`Cleaned up test lead (ID: ${createdLeadId}) from database.`);
    }
    await prisma.$disconnect();
  }
}

runEndpointTests().catch(err => {
  console.error('\n❌ Endpoint Test Failed:', err);
  process.exit(1);
});
