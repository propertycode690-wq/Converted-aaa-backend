const fs = require('fs');
const files = [
  'frontend/src/pages/settings/SuperAdminCustomization.jsx',
  'frontend/src/pages/team/AdminAgents.jsx',
  'frontend/src/pages/team/OperationsAgents.jsx',
  'frontend/src/pages/team/SuperAdminAgents.jsx'
];
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  ['admin:', 'operations:', 'finance:'].forEach(role => {
    const rIdx = content.indexOf(role);
    if (rIdx !== -1) {
      const chunk = content.substring(rIdx, rIdx + 200).split('\n')[1] || '';
      console.log(`${f} [${role}] -> ${chunk.trim()}`);
    }
  });
}

