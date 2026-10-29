const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/constants/mockData.js');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const oldCode = `export const getLeadStatusOptions = (leadOrRow, leadStages = []) => {
  const service = leadOrRow?.serviceType || leadOrRow?.serviceId || leadOrRow?.service?.name || leadOrRow?.service || '';
  const currentStatus = leadOrRow?.status;
  
  const isTranslation = isSwornTranslationService(service) || 
    Boolean(leadOrRow?.wordCount) || 
    Boolean(leadOrRow?.sourceLanguage) || 
    Boolean(leadOrRow?.targetLanguage);

  if (isTranslation) {
    return Array.from(new Set([
      ...SWORN_TRANSLATION_STATUSES,
      ...(currentStatus ? [currentStatus] : [])
    ]));
  }
  
  const standardList = Array.from(new Set([...leadStages.map(s => s.name || s), 'No Show']));
  return currentStatus && !standardList.includes(currentStatus)
    ? [...standardList, currentStatus]
    : standardList;
};`;

const newCode = `export const IT_SALES_PIPELINE_STAGES = [
  'New Inquiry',
  'Discovery Scheduled',
  'Requirement Analysis',
  'Proposal Sent',
  'Negotiation',
  'Deal Won',
  'Deal Lost'
];

export const getLeadStatusOptions = (leadOrRow, leadStages = []) => {
  const service = leadOrRow?.serviceType || leadOrRow?.serviceId || leadOrRow?.service?.name || leadOrRow?.service || '';
  const currentStatus = leadOrRow?.status;
  
  const isTranslation = isSwornTranslationService(service) || 
    Boolean(leadOrRow?.wordCount) || 
    Boolean(leadOrRow?.sourceLanguage) || 
    Boolean(leadOrRow?.targetLanguage);

  if (isTranslation) {
    return Array.from(new Set([
      ...SWORN_TRANSLATION_STATUSES,
      ...(currentStatus ? [currentStatus] : [])
    ]));
  }
  
  const standardList = Array.from(new Set([
    ...IT_SALES_PIPELINE_STAGES,
    ...leadStages.map(s => s.name || s),
    'No Show'
  ]));
  return currentStatus && !standardList.includes(currentStatus)
    ? [...standardList, currentStatus]
    : standardList;
};`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('mockData.js updated with IT_SALES_PIPELINE_STAGES.');
} else {
  console.log('Target not found in mockData.js');
}

