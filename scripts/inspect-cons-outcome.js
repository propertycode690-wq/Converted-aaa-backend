const fs = require('fs');
const files = [
  'frontend/src/pages/consultations/SuperAdminConsultationDetails.jsx',
  'frontend/src/pages/consultations/AdminConsultationDetails.jsx',
  'frontend/src/pages/consultations/OperationsConsultationDetails.jsx',
  'frontend/src/pages/consultations/AgentConsultationDetails.jsx',
  'frontend/src/pages/consultations/ConsultationDetails.jsx'
];
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  console.log(f, {
    hasVisaPathway: content.includes('Recommended Spain Visa Pathway'),
    hasRelocationPackage: content.includes('Recommended Relocation Package'),
    hasPassportStatus: content.includes('passport status')
  });
});

