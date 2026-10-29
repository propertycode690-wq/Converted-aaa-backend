const fs = require('fs');
const path = require('path');

const leadListFiles = [
  'frontend/src/pages/leads/SuperAdminLeadList.jsx',
  'frontend/src/pages/leads/AdminLeadList.jsx',
  'frontend/src/pages/leads/OperationsLeadList.jsx',
  'frontend/src/pages/leads/AgentLeadList.jsx',
  'frontend/src/pages/leads/LeadList.jsx'
];

leadListFiles.forEach(relPath => {
  const filePath = path.join(__dirname, '../../', relPath);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Validation error message
  content = content.replace("serviceId: yup.string().required('Visa service is required')", "serviceId: yup.string().required('IT service is required')");

  // 2. Form label
  content = content.replace('label="Visa Service"', 'label="IT Service / Project Type"');

  // 3. Assign Agent modal title & text
  content = content.replace('title="Assign Spain Visa Agent"', 'title="Assign Solutions Consultant"');
  content = content.replace('Select the Spain Visa agent to handle the case for', 'Select the Solutions Consultant to handle the project for');

  // 4. Update Category Tab filter logic if present
  if (content.includes('activeCategoryTab === \'visa\'')) {
    const oldFilter = `if (activeCategoryTab === 'visa') {
        const isTranslation = (lead.serviceId || '').toLowerCase().includes('translation') || (lead.serviceType || '').toLowerCase().includes('translation');
        const isProperty = (lead.serviceId || '').toLowerCase().includes('property') || (lead.serviceType || '').toLowerCase().includes('property');
        if (isTranslation || isProperty) return false;
      } else if (activeCategoryTab === 'property') {
        const isProperty = (lead.serviceId || '').toLowerCase().includes('property') || (lead.serviceType || '').toLowerCase().includes('property');
        if (!isProperty) return false;
      } else if (activeCategoryTab === 'translation') {
        const isTranslation = (lead.serviceId || '').toLowerCase().includes('translation') || (lead.serviceType || '').toLowerCase().includes('translation');
        if (!isTranslation) return false;
      }`;

    const newFilter = `if (activeCategoryTab === 'software') {
        const s = ((lead.serviceId || '') + ' ' + (lead.serviceType || '')).toLowerCase();
        if (!s.includes('software') && !s.includes('saas') && !s.includes('crm') && !s.includes('erp')) return false;
      } else if (activeCategoryTab === 'mobile_web') {
        const s = ((lead.serviceId || '') + ' ' + (lead.serviceType || '')).toLowerCase();
        if (!s.includes('web') && !s.includes('mobile') && !s.includes('app') && !s.includes('ui_ux')) return false;
      } else if (activeCategoryTab === 'ai_cloud') {
        const s = ((lead.serviceId || '') + ' ' + (lead.serviceType || '')).toLowerCase();
        if (!s.includes('ai') && !s.includes('cloud') && !s.includes('devops') && !s.includes('automation')) return false;
      }`;

    // Normalize CRLF
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const normalizedOldFilter = oldFilter.replace(/\r\n/g, '\n');
    if (normalizedContent.includes(normalizedOldFilter)) {
      content = normalizedContent.replace(normalizedOldFilter, newFilter);
    } else {
      console.log('Warning: direct match failed for filter in', relPath);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Processed', relPath);
});

