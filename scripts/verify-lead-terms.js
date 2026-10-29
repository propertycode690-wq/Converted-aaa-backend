const fs = require('fs');
const path = require('path');

const files = [
  'frontend/src/pages/public/LeadSelfFillForm.jsx',
  'frontend/src/pages/leads/AdminLeadList.jsx',
  'frontend/src/pages/leads/SuperAdminLeadList.jsx',
  'frontend/src/pages/leads/OperationsLeadList.jsx',
  'frontend/src/pages/leads/AgentLeadList.jsx',
  'frontend/src/pages/leads/LeadList.jsx'
];

const regex = /(spain|visa|residency|golden\s*visa|nomad)/i;

files.forEach(f => {
  const fullPath = path.join(__dirname, '../../', f);
  const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
  let matches = 0;
  lines.forEach((line, idx) => {
    // ignore countryCode Spain in phone country list, API url, or legacy db field preferableAreaInSpain
    if (regex.test(line) && !line.includes('🇪🇸') && !line.includes('+34') && !line.includes('api/v1') && !line.includes('preferableAreaInSpain')) {
      console.log(f + ':' + (idx+1) + ': ' + line.trim());
      matches++;
    }
  });
  if (matches === 0) console.log(f + ': CLEAN (0 visible immigration terms)');
});

