const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const backendDir = path.join(__dirname, '..');
process.env.DATABASE_URL = 'mysql://root:@localhost:3306/aaa-db';

const clientDir = path.join(backendDir, 'node_modules/.prisma/client');
const engineDll = path.join(clientDir, 'query_engine-windows.dll.node');
const oldDll = path.join(clientDir, `query_engine-windows.dll.node.${Date.now()}.old`);

if (fs.existsSync(engineDll)) {
  try {
    fs.renameSync(engineDll, oldDll);
  } catch (e) {
    console.log('Could not rename active dll:', e.message);
  }
}

try {
  const output = execSync('npx prisma generate --schema=prisma/schema.prisma', {
    cwd: backendDir,
    encoding: 'utf8',
    env: process.env
  });
  console.log('PRISMA GENERATE SUCCESS:');
  console.log(output);
} catch (err) {
  console.error('PRISMA GENERATE FAILED:');
  console.error(err.stdout || err.message);
  process.exit(1);
}
