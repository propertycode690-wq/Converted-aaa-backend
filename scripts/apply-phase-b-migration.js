const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runMigration() {
  console.log('=== PHASE B: APPLYING TARGETED DATABASE MIGRATION ===\n');

  // 1. Preflight safety check on database identity
  const [dbResult] = await prisma.$queryRawUnsafe('SELECT DATABASE() as db, VERSION() as version');
  console.log(`Target Database: ${dbResult.db}`);
  console.log(`Server Version: ${dbResult.version}`);

  if (dbResult.db !== 'aaa-db') {
    throw new Error(`Safety stop: expected database 'aaa-db', but connected to '${dbResult.db}'`);
  }

  // 2. Check existing columns
  const existingCols = await prisma.$queryRawUnsafe(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME IN ('companyName', 'dealValue', 'currency')"
  );
  const colNames = existingCols.map(c => c.COLUMN_NAME);
  console.log('Existing target columns:', colNames);

  // 3. Apply ALTER TABLE if columns missing
  if (!colNames.includes('companyName') || !colNames.includes('dealValue') || !colNames.includes('currency')) {
    console.log('\nApplying ALTER TABLE to add commercial fields...');
    const alterSql = `
      ALTER TABLE \`leads\`
        ADD COLUMN \`companyName\` VARCHAR(191) NULL AFTER \`budget\`,
        ADD COLUMN \`dealValue\` DECIMAL(12, 2) NULL AFTER \`companyName\`,
        ADD COLUMN \`currency\` VARCHAR(10) NOT NULL DEFAULT 'USD' AFTER \`dealValue\`
    `;
    await prisma.$executeRawUnsafe(alterSql);
    console.log('✓ Successfully added companyName, dealValue, and currency columns.');
  } else {
    console.log('Target columns already present. Skipping column additions.');
  }

  // 4. Check existing index
  const existingIdx = await prisma.$queryRawUnsafe(
    "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'leads_companyName_idx'"
  );
  if (existingIdx.length === 0) {
    console.log('\nCreating index `leads_companyName_idx`...');
    await prisma.$executeRawUnsafe('CREATE INDEX `leads_companyName_idx` ON `leads` (`companyName`)');
    console.log('✓ Successfully created index `leads_companyName_idx`.');
  } else {
    console.log('Index `leads_companyName_idx` already exists.');
  }

  // 5. Backfill companyName from qualificationData if applicable
  const [leadCountResult] = await prisma.$queryRawUnsafe('SELECT COUNT(*) as count FROM `leads`');
  const leadCount = Number(leadCountResult.count);
  console.log(`\nCurrent total leads in table: ${leadCount}`);

  if (leadCount > 0) {
    console.log('Executing backfill for qualificationData.companyName...');
    const backfillSql = `
      UPDATE \`leads\`
      SET \`companyName\` = JSON_UNQUOTE(JSON_EXTRACT(\`qualificationData\`, '$.companyName'))
      WHERE \`companyName\` IS NULL
        AND \`qualificationData\` IS NOT NULL
        AND JSON_EXTRACT(\`qualificationData\`, '$.companyName') IS NOT NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(\`qualificationData\`, '$.companyName')) != ''
    `;
    const backfilled = await prisma.$executeRawUnsafe(backfillSql);
    console.log(`✓ Backfill complete: ${backfilled} record(s) updated.`);
  } else {
    console.log('Table has 0 records. No backfill needed.');
  }

  // 6. Verification
  console.log('\n--- VERIFYING LIVE TABLE STRUCTURE ---');
  const finalCols = await prisma.$queryRawUnsafe(
    "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME IN ('companyName', 'dealValue', 'currency') ORDER BY ORDINAL_POSITION"
  );
  console.log('Live commercial columns in `leads`:');
  console.log(JSON.stringify(finalCols, null, 2));

  const finalIdx = await prisma.$queryRawUnsafe(
    "SELECT INDEX_NAME, COLUMN_NAME, CAST(NON_UNIQUE AS CHAR) as NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'leads_companyName_idx'"
  );
  console.log('Live index `leads_companyName_idx`:');
  console.log(JSON.stringify(finalIdx, null, 2));

  console.log('\n=== PHASE B MIGRATION APPLIED AND VERIFIED IN DATABASE ===\n');
}

runMigration()
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
