const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('=== 1. SERVER & DATABASE INFO ===');
    const dbInfo = await prisma.$queryRawUnsafe('SELECT VERSION() as version, DATABASE() as currentDb, @@character_set_database as charset, @@collation_database as collation');
    console.log(JSON.stringify(dbInfo, null, 2));

    console.log('\n=== 2. SHOW CREATE TABLE users ===');
    const createUsers = await prisma.$queryRawUnsafe('SHOW CREATE TABLE `users`');
    console.log(createUsers[0]['Create Table']);

    console.log('\n=== 3. MIGRATION HISTORY TABLE ===');
    try {
      const migrations = await prisma.$queryRawUnsafe('SELECT * FROM `_prisma_migrations` ORDER BY finished_at ASC');
      console.log('Found _prisma_migrations records:', migrations.length);
      console.log(JSON.stringify(migrations, null, 2));
    } catch (e) {
      console.log('No _prisma_migrations table found:', e.message);
    }

    console.log('\n=== 4. EXISTING TABLES LIST ===');
    const tables = await prisma.$queryRawUnsafe('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
    console.log(JSON.stringify(tables, null, 2));

    await prisma.$disconnect();
  } catch (err) {
    console.error('Inspection failed:', err.message);
    process.exit(1);
  }
}

main();

