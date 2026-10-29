const { execSync } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, '..');
process.env.DATABASE_URL = 'mysql://root:@localhost:3306/aaa-db';

try {
  const output = execSync('npx prisma validate --schema=prisma/schema.prisma', {
    cwd: backendDir,
    encoding: 'utf8',
    env: process.env
  });
  console.log('PRISMA VALIDATE SUCCESS:');
  console.log(output);
} catch (err) {
  console.error('PRISMA VALIDATE FAILED:');
  console.error(err.stdout || err.message);
  process.exit(1);
}

