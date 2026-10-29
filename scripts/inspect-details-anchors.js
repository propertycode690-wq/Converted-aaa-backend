const fs = require('fs');
const files = [
  'frontend/src/pages/leads/SuperAdminLeadDetails.jsx',
  'frontend/src/pages/leads/AdminLeadDetails.jsx',
  'frontend/src/pages/leads/OperationsLeadDetails.jsx',
  'frontend/src/pages/leads/AgentLeadDetails.jsx',
  'frontend/src/pages/leads/LeadDetails.jsx'
];
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  console.log(f, {
    hasPageHeader: content.includes('<PageHeader'),
    hasActiveTab0: content.includes('{activeTab === 0 && ('),
    hasConvertModal: content.includes('Convert Lead to Client Portal'),
    hasTargetService: content.includes('Target Service')
  });
});

