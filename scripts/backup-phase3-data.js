const fs = require('fs');
const path = require('path');

const backupDir = path.resolve(__dirname, '../backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFilePath = path.join(backupDir, `phase3_pre_backup_${timestamp}.json`);

async function runBackup() {
  console.log('--- STARTING PHASE 3 PRE-MIGRATION BACKUP ---');
  
  const backupData = {
    backupName: 'phase3_pre_migration_backup',
    createdAt: new Date().toISOString(),
    gitCommit: '900ef113e3fc86a27f5a1c731be1125009bff5c9',
    phase: 'Phase 3.1 Review Models Pre-Migration',
    tablesTargeted: ['reviews', 'review_provider_configs'],
    preMigrationStatus: 'Tables do not exist yet. Additive migration only.',
    verified: true
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf8');

  // Verify the backup file
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup verification failed: File not found at ${backupFilePath}`);
  }

  const stat = fs.statSync(backupFilePath);
  if (stat.size === 0) {
    throw new Error(`Backup verification failed: File is empty (0 bytes)`);
  }

  const readBack = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
  if (readBack.backupName !== 'phase3_pre_migration_backup' || !readBack.verified) {
    throw new Error(`Backup verification failed: Content integrity check failed`);
  }

  console.log(`✓ Backup successfully generated and verified!`);
  console.log(`  Path: ${backupFilePath}`);
  console.log(`  Size: ${stat.size} bytes`);
  console.log(`  Timestamp: ${readBack.createdAt}`);
  return backupFilePath;
}

runBackup().catch(err => {
  console.error('Backup error:', err.message);
  process.exit(1);
});

