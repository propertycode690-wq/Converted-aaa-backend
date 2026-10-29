const fs = require('fs');
const files = [
  'frontend/src/pages/leads/SuperAdminLeadDetails.jsx',
  'frontend/src/pages/leads/AdminLeadDetails.jsx',
  'frontend/src/pages/leads/OperationsLeadDetails.jsx',
  'frontend/src/pages/leads/AgentLeadDetails.jsx',
  'frontend/src/pages/leads/LeadDetails.jsx'
];
files.forEach(f => {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const idx = lines.findIndex(l => l.includes('<PageHeader'));
  console.log('===', f, '===');
  console.log(lines.slice(idx, idx + 15).join('\n'));
});

