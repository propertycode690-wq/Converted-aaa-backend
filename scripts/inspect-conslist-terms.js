const fs = require('fs');
const files = [
  'frontend/src/pages/consultations/SuperAdminConsultationList.jsx',
  'frontend/src/pages/consultations/AdminConsultationList.jsx',
  'frontend/src/pages/consultations/OperationsConsultationList.jsx',
  'frontend/src/pages/consultations/AgentConsultationList.jsx',
  'frontend/src/pages/consultations/ConsultationList.jsx'
];
const regex = /(visa|passport|assessment consultation|passive income|relocation)/i;
files.forEach(f => {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, idx) => {
    if (regex.test(l)) {
      console.log(f + ':' + (idx + 1) + ': ' + l.trim());
    }
  });
});

