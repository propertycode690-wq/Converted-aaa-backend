require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/config/db');

const IT_LEAD_STAGES = [
  { id: 'stage_new_lead', name: 'New Lead', type: 'lead', color: '#2196F3', emoji: '🆕' },
  { id: 'stage_contacted', name: 'Contacted', type: 'lead', color: '#00BCD4', emoji: '📞' },
  { id: 'stage_discovery_scheduled', name: 'Discovery Scheduled', type: 'lead', color: '#3F51B5', emoji: '📅' },
  { id: 'stage_proposal_sent', name: 'Proposal Sent', type: 'lead', color: '#9C27B0', emoji: '📑' },
  { id: 'stage_negotiation', name: 'Negotiation', type: 'lead', color: '#FF9800', emoji: '🤝' },
  { id: 'stage_won', name: 'Won', type: 'client', color: '#4CAF50', emoji: '🏆' },
  { id: 'stage_lost', name: 'Lost', type: 'lead', color: '#F44336', emoji: '❌' }
];

const IT_SERVICES = [
  { id: 'srv_web_dev', name: 'Web Development', category: 'Engineering', basePrice: 3000, active: true },
  { id: 'srv_mobile_dev', name: 'Mobile App Development', category: 'Engineering', basePrice: 5000, active: true },
  { id: 'srv_saas_dev', name: 'SaaS Development', category: 'Engineering', basePrice: 8000, active: true },
  { id: 'srv_ai_automation', name: 'AI & Workflow Automation', category: 'AI / ML', basePrice: 2500, active: true },
  { id: 'srv_crm_erp', name: 'CRM / ERP Development', category: 'Enterprise', basePrice: 6000, active: true },
  { id: 'srv_ui_ux', name: 'UI/UX Design', category: 'Design', basePrice: 1500, active: true },
  { id: 'srv_api_integration', name: 'API Integration', category: 'Engineering', basePrice: 2000, active: true },
  { id: 'srv_maintenance', name: 'Maintenance & Support', category: 'Support', basePrice: 1000, active: true }
];

async function syncITPipeline() {
  console.log('--- SYNCING IT SALES PIPELINE & SERVICE CATALOG TO DATABASE ---');

  // 1. Sync Lead Stages
  let setting = await prisma.companySetting.findFirst();
  if (!setting) {
    setting = await prisma.companySetting.create({
      data: { leadStages: IT_LEAD_STAGES }
    });
    console.log('[DB] Created CompanySetting with IT leadStages');
  } else {
    await prisma.companySetting.update({
      where: { id: setting.id },
      data: { leadStages: IT_LEAD_STAGES }
    });
    console.log('[DB] Updated CompanySetting with IT leadStages');
  }

  // 2. Sync IT Services in visa_services table
  for (const s of IT_SERVICES) {
    const exists = await prisma.visaService.findUnique({ where: { id: s.id } });
    if (!exists) {
      await prisma.visaService.create({ data: s });
      console.log(`[DB] Created Service: ${s.name}`);
    } else {
      await prisma.visaService.update({
        where: { id: s.id },
        data: {
          name: s.name,
          category: s.category,
          basePrice: s.basePrice,
          active: s.active
        }
      });
      console.log(`[DB] Updated Service: ${s.name}`);
    }
  }

  console.log('--- IT PIPELINE & SERVICE CATALOG DATABASE SYNC COMPLETE ---');
}

syncITPipeline().catch(console.error).finally(() => prisma.$disconnect());

