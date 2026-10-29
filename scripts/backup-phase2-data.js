require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/db');

async function backup() {
  console.log('--- BACKING UP PHASE 2 AFFECTED DATA ---');

  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `phase2_pre_backup_${timestamp}.json`);

  let companySettings = null;
  let visaServices = [];

  try {
    companySettings = await prisma.companySetting.findFirst();
  } catch (e) {
    console.warn('Could not read companySetting:', e.message);
  }

  try {
    visaServices = await prisma.visaService.findMany();
  } catch (e) {
    console.warn('Could not read visaServices:', e.message);
  }

  const payload = {
    timestamp: new Date().toISOString(),
    companySettings,
    visaServices
  };

  fs.writeFileSync(backupFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[BACKUP CREATED] ${backupFile}`);
  console.log(`CompanySetting found: ${Boolean(companySettings)}`);
  console.log(`VisaServices count: ${visaServices.length}`);
}

backup().catch(console.error).finally(() => prisma.$disconnect());

