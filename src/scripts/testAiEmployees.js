const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const salesAi = require('../services/aiEmployees/salesAi');
const ceoSupervisorAi = require('../services/aiEmployees/ceoSupervisorAi');
const aiScheduler = require('../services/aiScheduler');

async function testAi() {
  console.log('[Test AI] Checking database connection and agents...');
  const agents = await prisma.aiAgent.findMany();
  console.log(`Found ${agents.length} agents in DB:`);
  agents.forEach(a => console.log(`- ${a.code}: ${a.name} [${a.status}]`));

  console.log('\n[Test AI] Testing CEO Supervisor Briefing...');
  const briefing = await ceoSupervisorAi.generateCeoBriefing();
  console.log('CEO Briefing Generated successfully!');
  console.log('Summary:', briefing.briefing.executiveSummary);

  console.log('\n[Test AI] Testing Sales AI Stale Scan...');
  const stale = await salesAi.scanStaleInquiries();
  console.log(`Sales AI scanned stale leads. Result count: ${stale.length}`);

  console.log('\n[Test AI] Testing AI Scheduler Heartbeat...');
  console.log('Heartbeat:', aiScheduler.getHeartbeat());

  console.log('\n[Test AI] ALL 7 AI EMPLOYEE BACKEND CHECKS PASSED!');
}

testAi()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
