const fs = require('fs');
const path = require('path');

const files = [
  'frontend/src/pages/leads/AdminLeadList.jsx',
  'frontend/src/pages/leads/SuperAdminLeadList.jsx'
];

files.forEach(relPath => {
  const filePath = path.join(__dirname, '../../', relPath);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Schema update
  content = content.replace(
    "applicantsCount: yup.number().typeError('Must be a number').min(1, 'At least 1 applicant').required(),",
    "applicantsCount: yup.number().default(1),\n  companyName: yup.string(),\n  budget: yup.string(),"
  );

  // 2. handleCreateLead mapping
  content = content.replace(
    "createLeadMutation.mutate({\n      ...data,\n      status: defaultStatus,\n      assignedConsultantId: ''\n    });",
    `createLeadMutation.mutate({
      ...data,
      applicantsCount: Number(data.applicantsCount) || 1,
      qualificationData: {
        ...(data.qualificationData || {}),
        companyName: data.companyName || '',
        budget: data.budget || '$10,000 - $25,000'
      },
      status: defaultStatus,
      assignedConsultantId: ''
    });`
  );

  // 3. Add Company Name field after First & Last name box
  const oldNameBox = `<Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>\n                <TextField {...register('firstName')} label="First Name" error={!!errors.firstName} helperText={errors.firstName?.message} sx={{ flex: 1 }} />\n                <TextField {...register('lastName')} label="Last Name" error={!!errors.lastName} helperText={errors.lastName?.message} sx={{ flex: 1 }} />\n              </Box>`;
  const newNameBox = `<Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>\n                <TextField {...register('firstName')} label="First Name" error={!!errors.firstName} helperText={errors.firstName?.message} sx={{ flex: 1 }} />\n                <TextField {...register('lastName')} label="Last Name" error={!!errors.lastName} helperText={errors.lastName?.message} sx={{ flex: 1 }} />\n              </Box>\n\n              <TextField {...register('companyName')} label="Company / Organization Name" fullWidth placeholder="e.g. Acme Innovations Inc." />`;

  const normContent = content.replace(/\r\n/g, '\n');
  const normOldBox = oldNameBox.replace(/\r\n/g, '\n');
  if (normContent.includes(normOldBox)) {
    content = normContent.replace(normOldBox, newNameBox);
  }

  // 4. Remove {watchServiceId === 'property' && ( ... )}
  content = content.replace(/\{watchServiceId === 'property' && \([\s\S]*?<\/[bB]ox>\s*\)\}/, '');

  // 5. Replace applicantsCount TextField with Project Budget Range select
  const oldApplicantsFieldRegex = /<TextField\s+\{\.\.\.register\('applicantsCount'\)\}[\s\S]*?label="Number of Applicants"[\s\S]*?\/>/;
  const newBudgetField = `<FormControl sx={{ flex: 1 }} size="small">
                  <InputLabel id="budget-select-label">Project Budget Range</InputLabel>
                  <Select
                    labelId="budget-select-label"
                    {...register('budget')}
                    defaultValue="$10,000 - $25,000"
                    label="Project Budget Range"
                  >
                    <MenuItem value="$5,000 - $10,000">$5,000 - $10,000</MenuItem>
                    <MenuItem value="$10,000 - $25,000">$10,000 - $25,000</MenuItem>
                    <MenuItem value="$25,000 - $50,000">$25,000 - $50,000</MenuItem>
                    <MenuItem value="$50,000 - $100,000">$50,000 - $100,000</MenuItem>
                    <MenuItem value="$100,000+">$100,000+</MenuItem>
                  </Select>
                </FormControl>`;

  content = content.replace(oldApplicantsFieldRegex, newBudgetField);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Adapted modal in', relPath);
});

