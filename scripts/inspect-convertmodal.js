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
    hasSchengenTourism: content.includes("lead.serviceId === 'tourism'"),
    hasSelectRelocation: content.includes('Select Relocation Package'),
    hasTotalApplicants: content.includes('Total Applicants (Main + Dependents)')
  });
});

