const fs = require('fs');
const files = [
  'frontend/src/pages/settings/SuperAdminCustomization.jsx',
  'frontend/src/pages/team/AdminAgents.jsx',
  'frontend/src/pages/team/OperationsAgents.jsx',
  'frontend/src/pages/team/SuperAdminAgents.jsx'
];
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const match = content.match(/const AVAILABLE_MENUS = \[([\s\S]*?)\];/);
  if (match) {
    console.log(`=== ${f} AVAILABLE_MENUS ===`);
    console.log(match[1].trim());
  }
}

