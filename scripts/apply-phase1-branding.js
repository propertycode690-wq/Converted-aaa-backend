const fs = require('fs');
const path = require('path');

console.log('--- Applying Phase 1 Branding & Terminology ---');

// 1. Update frontend/src/layouts/DashboardLayout.jsx
const dashboardPath = path.join(__dirname, '../../frontend/src/layouts/DashboardLayout.jsx');
let dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

const oldBrandRegex = /<Typography variant="h6" sx=\{\{ fontWeight: 800, lineHeight: 1\.1, letterSpacing: '-0\.02em' \}\}>\s*AAA CONSULTANCY\s*<\/Typography>\s*<Typography variant="caption" color="text\.secondary" sx=\{\{ fontSize: '0\.65rem', fontWeight: 600 \}\}>\s*SPAIN IMMIGRATION\s*<\/Typography>/;

const newBrand = `<Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                AAA TECHNOLOGIES
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.04em' }}>
                IT SERVICES & SOFTWARE
              </Typography>`;

if (oldBrandRegex.test(dashboardContent)) {
  dashboardContent = dashboardContent.replace(oldBrandRegex, newBrand);
  fs.writeFileSync(dashboardPath, dashboardContent, 'utf8');
  console.log('✓ Updated brand logo and subtitle in DashboardLayout.jsx');
} else {
  console.log('⚠ Brand text regex did not match in DashboardLayout.jsx, checking literal string...');
  const literalOld = `AAA CONSULTANCY
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>
                SPAIN IMMIGRATION`;
  const literalNew = `AAA TECHNOLOGIES
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.04em' }}>
                IT SERVICES & SOFTWARE`;
  if (dashboardContent.includes(literalOld)) {
    dashboardContent = dashboardContent.replace(literalOld, literalNew);
    fs.writeFileSync(dashboardPath, dashboardContent, 'utf8');
    console.log('✓ Updated brand logo (literal) in DashboardLayout.jsx');
  } else {
    console.warn('Could not find brand text in DashboardLayout.jsx');
  }
}

// 2. Update frontend/src/pages/auth/Login.jsx
const loginPath = path.join(__dirname, '../../frontend/src/pages/auth/Login.jsx');
let loginContent = fs.readFileSync(loginPath, 'utf8');

const oldSubhead = 'Enter your credentials to access the CRM portal.';
const newSubhead = 'Enter your credentials to access the IT Services CRM portal.';

if (loginContent.includes(oldSubhead)) {
  loginContent = loginContent.replace(oldSubhead, newSubhead);
  fs.writeFileSync(loginPath, loginContent, 'utf8');
  console.log('✓ Updated portal subtitle in Login.jsx');
} else {
  console.log('Subhead already updated or not found in Login.jsx');
}

// 3. Update frontend/src/constants/countryServices.js
const servicesPath = path.join(__dirname, '../../frontend/src/constants/countryServices.js');
let servicesContent = fs.readFileSync(servicesPath, 'utf8');

// Replace ALL_VISA_SERVICES with IT offerings
const oldServicesBlockRegex = /\/\*\*[\s\S]*?export const ALL_VISA_SERVICES = \[[\s\S]*?\];/;
const newServicesBlock = `/**
 * Centralized mapping of available IT company services and development offerings.
 * AAA Technologies & IT Solutions.
 */

export const ALL_IT_SERVICES = [
  { id: 'custom_software', name: 'Custom Software & SaaS Development', category: 'software' },
  { id: 'web_mobile', name: 'Web & Mobile App Development', category: 'development' },
  { id: 'ai_automation', name: 'AI & Automation Solutions', category: 'ai' },
  { id: 'cloud_devops', name: 'Cloud, DevOps & Infrastructure', category: 'cloud' },
  { id: 'ui_ux_design', name: 'UI/UX Design & Prototyping', category: 'design' },
  { id: 'dedicated_team', name: 'Dedicated Engineering Teams', category: 'staffing' }
];

// Backwards-compatible alias for existing imports across the application
export const ALL_VISA_SERVICES = ALL_IT_SERVICES;`;

if (oldServicesBlockRegex.test(servicesContent)) {
  servicesContent = servicesContent.replace(oldServicesBlockRegex, newServicesBlock);
} else {
  console.warn('Could not match oldServicesBlockRegex');
}

// Replace COUNTRY_SERVICES_MAPPING block
const oldMappingRegex = /export const COUNTRY_SERVICES_MAPPING = \{[\s\S]*?\};/;
const newMapping = `export const COUNTRY_SERVICES_MAPPING = {
  'Bahrain': ALL_IT_SERVICES,
  'Egypt': ALL_IT_SERVICES,
  'India': ALL_IT_SERVICES,
  'Kuwait': ALL_IT_SERVICES,
  'Oman': ALL_IT_SERVICES,
  'Pakistan': ALL_IT_SERVICES,
  'Philippines': ALL_IT_SERVICES,
  'Qatar': ALL_IT_SERVICES,
  'Saudi Arabia': ALL_IT_SERVICES,
  'United Arab Emirates': ALL_IT_SERVICES,
  'UAE': ALL_IT_SERVICES,
  'United States': ALL_IT_SERVICES,
  'United Kingdom': ALL_IT_SERVICES,
  'Canada': ALL_IT_SERVICES,
  'Spain': ALL_IT_SERVICES,
  'Germany': ALL_IT_SERVICES
};`;

if (oldMappingRegex.test(servicesContent)) {
  servicesContent = servicesContent.replace(oldMappingRegex, newMapping);
} else {
  console.warn('Could not match oldMappingRegex');
}

// Replace getServicesForCountry implementation
const oldFunctionRegex = /export function getServicesForCountry[\s\S]*?\}/;
const newFunction = `export function getServicesForCountry(countryName) {
  if (!countryName) return ALL_IT_SERVICES;
  
  const normalizedCountry = Object.keys(COUNTRY_SERVICES_MAPPING).find(
    c => c.toLowerCase() === countryName.trim().toLowerCase()
  );

  return normalizedCountry ? COUNTRY_SERVICES_MAPPING[normalizedCountry] : ALL_IT_SERVICES;
}`;

if (oldFunctionRegex.test(servicesContent)) {
  servicesContent = servicesContent.replace(oldFunctionRegex, newFunction);
} else {
  console.warn('Could not match oldFunctionRegex');
}

fs.writeFileSync(servicesPath, servicesContent, 'utf8');
console.log('✓ Successfully updated countryServices.js to export IT Service Catalog');

