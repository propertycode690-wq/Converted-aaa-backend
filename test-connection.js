require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  console.log('Testing DATABASE_URL:', process.env.DATABASE_URL);
  try {
    await prisma.$connect();
    console.log('>>> DB CONNECTION SUCCESSFUL! <<<');
    const userCount = await prisma.user.count();
    console.log('Total Users in DB:', userCount);
    const leadCount = await prisma.lead.count();
    console.log('Total Leads in DB:', leadCount);
    const clientCount = await prisma.client.count();
    console.log('Total Clients in DB:', clientCount);
    const projectCount = await prisma.project.count();
    console.log('Total Projects in DB:', projectCount);
    const aiAgents = await prisma.aiAgent.count();
    console.log('Total AI Agents in DB:', aiAgents);

    const users = await prisma.user.findMany({
      select: { id: true, email: true, fullName: true, role: true },
      take: 5
    });
    console.log('Sample Users in DB:', users);
  } catch (err) {
    console.error('>>> DB CONNECTION FAILED! <<<', err.message);
  } finally {
    await prisma.$disconnect();
  }
}
test();

