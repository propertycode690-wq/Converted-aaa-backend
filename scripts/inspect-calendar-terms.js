const fs = require('fs');
const files = [
  'frontend/src/pages/consultations/SuperAdminCalendarView.jsx',
  'frontend/src/pages/consultations/AdminCalendarView.jsx',
  'frontend/src/pages/consultations/OperationsCalendarView.jsx',
  'frontend/src/pages/consultations/AgentCalendarView.jsx',
  'frontend/src/pages/consultations/CalendarView.jsx'
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

