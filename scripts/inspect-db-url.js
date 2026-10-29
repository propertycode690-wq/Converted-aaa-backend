const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  console.log('backend/.env does not exist');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split(/\r?\n/);
let dbUrl = null;

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('DATABASE_URL=')) {
    dbUrl = trimmed.substring('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
    break;
  }
}

if (!dbUrl) {
  console.log('DATABASE_URL is not set in backend/.env');
  process.exit(0);
}

try {
  // Parse without printing sensitive secrets
  const url = new URL(dbUrl);
  console.log('DATABASE CONFIGURATION INSPECTION:');
  console.log('  Protocol:    ', url.protocol.replace(':', ''));
  console.log('  Host:        ', url.hostname);
  console.log('  Port:        ', url.port || '3306 (default)');
  console.log('  User:        ', url.username || '(not set)');
  console.log('  Password:    ', url.password ? 'Configured [REDACTED]' : '(none)');
  console.log('  Database:    ', url.pathname.replace(/^\//, ''));
  console.log('  Query Params:', url.search || '(none)');
} catch (e) {
  console.log('Could not parse DATABASE_URL as URL:', e.message);
}

