const fs = require('fs');
const path = require('path');

// ==========================================
// 1. UPDATE LEAD LISTS (Admin, Operations, Agent, LeadList)
// ==========================================
const leadListFiles = [
  'frontend/src/pages/leads/AdminLeadList.jsx',
  'frontend/src/pages/leads/OperationsLeadList.jsx',
  'frontend/src/pages/leads/AgentLeadList.jsx',
  'frontend/src/pages/leads/LeadList.jsx'
];

const followUpPickerCode = `const FollowUpDatePickerInput = ({ value, onChange, isDue, style = {} }) => {
  const displayStr = value ? dayjs(value).format('DD/MM/YYYY') : 'dd/mm/yyyy';
  const isoVal = value ? dayjs(value).format('YYYY-MM-DD') : '';

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', py: 0.25, px: 0.5, ...style }}>
      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.78rem', color: isDue ? '#B45309' : '#1E293B', pr: 0.5 }}>
        {displayStr}
      </Typography>
      <span style={{ fontSize: '0.8rem', opacity: 0.65 }}>📅</span>
      <input
        type="date"
        value={isoVal}
        onClick={(e) => e.stopPropagation()}
        onChange={(evt) => {
          evt.stopPropagation();
          onChange(evt.target.value);
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer'
        }}
      />
    </Box>
  );
};
`;

const nextFollowUpColumnCode = `    {
      id: 'nextFollowUpDate',
      label: 'Next Follow-Up',
      sortable: true,
      render: (row) => {
        const todayStr = dayjs().format('YYYY-MM-DD');
        const isFollowUpDue = row.nextFollowUpDate && (row.nextFollowUpDate.split('T')[0] <= todayStr);
        return (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: isFollowUpDue ? '#FEF3C7' : '#F1F5F9', p: '2px 6px', borderRadius: 1.5, border: '1px solid', borderColor: isFollowUpDue ? '#F59E0B' : '#CBD5E1' }}>
            <FollowUpDatePickerInput
              value={row.nextFollowUpDate}
              isDue={isFollowUpDue}
              onChange={(newDate) => {
                updateLeadMutation.mutate({ id: row.id, nextFollowUpDate: newDate });
              }}
            />
          </Box>
        );
      }
    },
`;

const updateLeadMutationSnippet = `  const updateLeadMutation = useMutation({
    mutationFn: ({ id, nextFollowUpDate }) => dbService.updateLead({ id, nextFollowUpDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      showAlert('Next follow-up date updated', 'success');
    },
    onError: (err) => {
      showAlert(err.response?.data?.message || 'Failed to update follow-up date', 'error');
    }
  });
`;

leadListFiles.forEach(relPath => {
  const filePath = path.join(__dirname, '../../', relPath);
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

  // Insert FollowUpDatePickerInput before component definition
  if (!content.includes('const FollowUpDatePickerInput')) {
    content = content.replace(/(export const \w+ = \(\) => \{)/, `${followUpPickerCode}\n$1`);
  }

  // Insert updateLeadMutation inside component
  if (!content.includes('const updateLeadMutation =')) {
    content = content.replace(/(const queryClient = useQueryClient\(\);[\s\S]*?const \{ showAlert \} = useAlert\(\);)/, `$1\n${updateLeadMutationSnippet}`);
  }

  // Insert nextFollowUpDate into columns if not present
  if (!content.includes("id: 'nextFollowUpDate'")) {
    content = content.replace(/(\{\s*id: 'assignedConsultant'[\s\S]*?\}\s*\,?\s*)\n\s*\];/, `$1,\n${nextFollowUpColumnCode}  ];`);
  }

  // Update standardStatuses to IT stages
  content = content.replace(
    /const standardStatuses = \[[^\]]*\];/,
    `const standardStatuses = [
    'New Inquiry',
    'Discovery Scheduled',
    'Requirement Analysis',
    'Proposal Sent',
    'Negotiation',
    'Deal Won',
    'Deal Lost',
    'Meeting Scheduled',
    'Meeting Completed',
    'No Show'
  ];`
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated LeadList file:', relPath);
});

// ==========================================
// 2. UPDATE CALENDAR VIEWS (5 files)
// ==========================================
const calendarFiles = [
  'frontend/src/pages/consultations/SuperAdminCalendarView.jsx',
  'frontend/src/pages/consultations/AdminCalendarView.jsx',
  'frontend/src/pages/consultations/OperationsCalendarView.jsx',
  'frontend/src/pages/consultations/AgentCalendarView.jsx',
  'frontend/src/pages/consultations/CalendarView.jsx'
];

calendarFiles.forEach(relPath => {
  const filePath = path.join(__dirname, '../../', relPath);
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/Book Assessment Consultation for/g, 'Schedule IT Discovery / Technical Consultation for');
  content = content.replace(/Select Agent Host/g, 'Select Solutions Architect / Host');
  content = content.replace(/Inquire passive income proofs or check remote work details\.\.\./g, 'Discussion topics: technical stack, product scope, milestone timeline, or discovery agenda...');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated Calendar file:', relPath);
});

// ==========================================
// 3. UPDATE CONSULTATION LISTS (5 files)
// ==========================================
const consListFiles = [
  'frontend/src/pages/consultations/SuperAdminConsultationList.jsx',
  'frontend/src/pages/consultations/AdminConsultationList.jsx',
  'frontend/src/pages/consultations/OperationsConsultationList.jsx',
  'frontend/src/pages/consultations/AgentConsultationList.jsx',
  'frontend/src/pages/consultations/ConsultationList.jsx'
];

consListFiles.forEach(relPath => {
  const filePath = path.join(__dirname, '../../', relPath);
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/label: 'Visa Type'/g, "label: 'IT Service / Project Scope'");
  content = content.replace(/'Spain Visa'/g, "'IT Discovery'");
  content = content.replace(/Track Spain Visa assessments, eligibility consultations, and virtual meeting links\./g, 'Track IT project discovery calls, architecture reviews, and technical consultations.');

  // Meeting Link pending display
  content = content.replace(
    /\) : '-';/g,
    `) : <Chip label="URL Pending" size="small" variant="outlined" sx={{ fontSize: '11px', color: '#64748B' }} />;`
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated ConsultationList file:', relPath);
});

// ==========================================
// 4. UPDATE CONSULTATION DETAILS (5 files)
// ==========================================
const consDetailsFiles = [
  'frontend/src/pages/consultations/SuperAdminConsultationDetails.jsx',
  'frontend/src/pages/consultations/AdminConsultationDetails.jsx',
  'frontend/src/pages/consultations/OperationsConsultationDetails.jsx',
  'frontend/src/pages/consultations/AgentConsultationDetails.jsx',
  'frontend/src/pages/consultations/ConsultationDetails.jsx'
];

consDetailsFiles.forEach(relPath => {
  const filePath = path.join(__dirname, '../../', relPath);
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/Assigned Spain Visa Expert/g, 'Assigned Solutions Consultant');
  content = content.replace(/AAA Recommended Visa Pathway/g, 'Recommended IT Solution / Architecture');
  content = content.replace(/Recommended Spain Visa Pathway/g, 'Recommended IT Solution / Architecture');
  content = content.replace(/Recommended Relocation Package \*/g, 'Recommended Engagement Model *');
  content = content.replace(/Eligibility Notes & Relocation Recommendations/g, 'Discovery Outcome & Technical Recommendations');

  content = content.replace(/Option A: Professional Case Assessment \(€250\)/g, 'Option A: Technical Architecture Discovery & Scoping');
  content = content.replace(/Option B: Full Processing Package \(€3,500\)/g, 'Option B: Full-Cycle Custom Software Development');
  content = content.replace(/Option C: Administrative Relocation Package \(€1,750\)/g, 'Option C: Cloud Infrastructure & DevOps Setup');
  content = content.replace(/Option D: Premium Package \(€4,750\)/g, 'Option D: Enterprise Dedicated Engineering Team Retainer');
  content = content.replace(/Schengen Tourist Visa \(€500\)/g, 'Dedicated UI/UX Design Sprint');

  content = content.replace(
    /placeholder="Document client's passport status, income statements audited, and recommended translations checklist\."/g,
    'placeholder="Document project architecture, recommended tech stack (e.g. React/Node/AWS), estimated timeline, and agreed next steps for proposal dispatch."'
  );

  content = content.replace(
    /placeholder="Enter details discussed during the follow-up meeting \(e\.g\. document preparation status, visa appointment updates\)\."/g,
    'placeholder="Enter details discussed during the follow-up session (e.g. sprint deliverables, architecture reviews, client feedback)."'
  );

  content = content.replace(
    /Log the final results of the visa consultation\. This updates the Lead qualification state and enables package invoice generation\./g,
    'Log the final results of the discovery session. This updates the Lead qualification state and enables proposal dispatch.'
  );

  content = content.replace(/'Digital Nomad Visa \(DNV\)'/g, "'Custom Software Development'");

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated ConsultationDetails file:', relPath);
});
console.log('All Phase 4 UI files successfully adapted.');

