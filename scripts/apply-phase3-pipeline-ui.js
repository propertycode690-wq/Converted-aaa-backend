const fs = require('fs');
const path = require('path');

const files = [
  'frontend/src/pages/leads/SuperAdminLeadDetails.jsx',
  'frontend/src/pages/leads/AdminLeadDetails.jsx',
  'frontend/src/pages/leads/OperationsLeadDetails.jsx',
  'frontend/src/pages/leads/AgentLeadDetails.jsx',
  'frontend/src/pages/leads/LeadDetails.jsx'
];

files.forEach(relPath => {
  const filePath = path.join(__dirname, '../../', relPath);
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

  // 1. Add imports if not present
  if (!content.includes('SalesPipelineStepper')) {
    content = content.replace(
      "import PageHeader from '../../components/PageHeader';",
      "import PageHeader from '../../components/PageHeader';\nimport SalesPipelineStepper from '../../components/SalesPipelineStepper';\nimport DealCommercialsCard from '../../components/DealCommercialsCard';"
    );
  }

  // 2. Add SalesPipelineStepper after PageHeader
  const pageHeaderEnd = '</Stack>\n        }\n      />';
  const newPipelineSection = `</Stack>
        }
      />

      {/* IT Sales Pipeline Stage Stepper */}
      <SalesPipelineStepper
        currentStatus={lead.status}
        onStageClick={(newStage) => {
          if (window.confirm(\`Update sales pipeline stage to "\${newStage}"?\`)) {
            updateStatusMutation.mutate({ leadId: lead.id, status: newStage });
          }
        }}
      />`;

  if (content.includes(pageHeaderEnd) && !content.includes('<SalesPipelineStepper')) {
    content = content.replace(pageHeaderEnd, newPipelineSection);
  }

  // 3. Add Company Name chip to Left Profile Card
  const emailAnchor = `<Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', wordBreak: 'break-all' }}>\n                {lead.email}\n              </Typography>`;
  const newEmailWithCompany = `<Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', wordBreak: 'break-all' }}>
                {lead.email}
              </Typography>
              {(lead.qualificationData?.companyName || lead.companyName) && (
                <Chip
                  icon={<span style={{ fontSize: '13px' }}>🏢</span>}
                  label={lead.qualificationData?.companyName || lead.companyName}
                  size="small"
                  sx={{ mb: 1, fontWeight: 700, bgcolor: 'rgba(99, 102, 241, 0.1)', color: '#4F46E5' }}
                />
              )}`;

  if (content.includes(emailAnchor) && !content.includes('🏢')) {
    content = content.replace(emailAnchor, newEmailWithCompany);
  }

  // 4. Add Estimated Budget Range in sidebar under Target Service
  const targetServiceAnchor = `<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>\n                    {serviceObj ? serviceObj.name : lead.serviceId}\n                  </Typography>\n                </Box>`;
  const newTargetServiceWithBudget = `<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {serviceObj ? serviceObj.name : lead.serviceId}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Estimated Budget Range
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#16A34A' }}>
                    {lead.budget || lead.qualificationData?.budget || 'Not specified'}
                  </Typography>
                </Box>`;

  if (content.includes(targetServiceAnchor) && !content.includes('Estimated Budget Range')) {
    content = content.replace(targetServiceAnchor, newTargetServiceWithBudget);
  }

  // 5. Add DealCommercialsCard at the top of Tab 0
  const tab0Anchor = `<Box sx={{ p: 2.5, flex: 1 }}>\n                    {/* TAB 0: Overview & Qualifications */}\n                    {activeTab === 0 && (\n                      <Box className="grid grid-cols-12 gap-4">`;
  const tab0AltAnchor = `<Box sx={{ p: 2.5, flex: 1 }}>\n              {/* TAB 0: Overview & Qualifications */}\n              {activeTab === 0 && (\n                <Box className="grid grid-cols-12 gap-4">`;

  const newTab0Section = `\n                  {/* IT Deal & Commercials Overview Card */}\n                  <Box className="col-span-12">\n                    <DealCommercialsCard lead={lead} serviceName={serviceObj?.name} />\n                  </Box>`;

  if (content.includes(tab0Anchor) && !content.includes('<DealCommercialsCard')) {
    content = content.replace(tab0Anchor, tab0Anchor + newTab0Section);
  } else if (content.includes(tab0AltAnchor) && !content.includes('<DealCommercialsCard')) {
    content = content.replace(tab0AltAnchor, tab0AltAnchor + newTab0Section);
  }

  // 6. Update Convert to Client modal to IT client onboarding
  content = content.replace('title="Convert Lead to Client Portal"', 'title="Onboard Lead as Active IT Client"');
  content = content.replace(
    'You are converting <strong>{lead.firstName} {lead.lastName}</strong> into a Client.\n            This creates a profile, schedules local registration checklists, and generates initial billing invoice details.',
    'You are onboarding <strong>{lead.firstName} {lead.lastName}</strong> into the active IT Client Portal.\n            This initializes project milestone tracking, development workspace setup, and initial billing invoicing.'
  );
  content = content.replace('label="Select Relocation Package"', 'label="Select Service Package / Engagement Tier"');
  content = content.replace('<InputLabel id="package-select-label">Select Relocation Package</InputLabel>', '<InputLabel id="package-select-label">Select Service Package / Engagement Tier</InputLabel>');
  content = content.replace(
    '{pkg.name} - {pkg.id === \'premium\' ? \'Residency + Full Relocation Assistance\' : \'Residency Processing Only\'}',
    '{pkg.name} - {pkg.id === \'premium\' ? \'Enterprise Dedicated Team + Full Support\' : \'Standard Development Retainer\'}'
  );
  content = content.replace('label="Total Applicants (Main + Dependents)"', 'label="Project Team Size / Engineering Seats"');
  content = content.replace(
    "selectedPackageId === 'premium'\n                    ? 'Premium Package discount calculates €500 for Main applicant and €250 for each dependent automatically.'\n                    : ''",
    "selectedPackageId === 'premium'\n                    ? 'Enterprise tier calculates team allocation and dedicated SLA automatically.'\n                    : ''"
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated', relPath);
});

