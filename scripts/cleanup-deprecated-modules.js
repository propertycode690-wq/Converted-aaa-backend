const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../..');

function updateSuperAdminCustomization() {
  const filePath = path.join(rootDir, 'frontend/src/pages/settings/SuperAdminCustomization.jsx');
  let content = fs.readFileSync(filePath, 'utf8');

  // Normalize CRLF to search safely or match exact
  // 1. AVAILABLE_MENUS
  content = content.replace(
    /'Doc Verification',\r?\n\s*'Finance',\r?\n\s*'Refunds & Commissions',\r?\n/g,
    ''
  );

  // 2. DEFAULT_CUSTOMIZATION
  content = content.replace(
    "'Doc Verification', 'Finance', 'Refunds & Commissions', ",
    ''
  );
  content = content.replace(
    "'Doc Verification', ",
    ''
  );
  content = content.replace(
    "menus: ['Dashboard', 'Finance', 'Refunds & Commissions', 'General Settings'],",
    "menus: ['Dashboard', 'General Settings'],"
  );

  // 3. roleMenus legacy sanitizer
  content = content.replace(
    "const roleMenus = localSettings[currentTargetKey]?.menus || [];",
    "const roleMenus = (localSettings[currentTargetKey]?.menus || []).filter(m => !['Doc Verification', 'Finance', 'Refunds & Commissions'].includes(m));"
  );

  // 4. hasSubsettings
  content = content.replaceAll(
    "['Dashboard', 'Leads', 'Clients', 'Calendar', 'Finance', 'Refunds & Commissions', 'Marketing', 'Agents']",
    "['Dashboard', 'Leads', 'Clients', 'Calendar', 'Marketing', 'Agents']"
  );

  // 5. Remove case 'Finance': and case 'Refunds & Commissions':
  const financeMarker = "case 'Finance':";
  const marketingMarker = "case 'Marketing':";
  const fIdx = content.indexOf(financeMarker);
  const mIdx = content.indexOf(marketingMarker);
  if (fIdx !== -1 && mIdx !== -1 && fIdx < mIdx) {
    content = content.substring(0, fIdx) + content.substring(mIdx);
  } else {
    console.warn('Warning: case Finance/Marketing not found or index mismatch');
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓ Updated SuperAdminCustomization.jsx');
}

function updateAgentPermissionFiles() {
  const files = [
    'frontend/src/pages/team/AdminAgents.jsx',
    'frontend/src/pages/team/OperationsAgents.jsx',
    'frontend/src/pages/team/SuperAdminAgents.jsx'
  ];

  for (const relPath of files) {
    const filePath = path.join(rootDir, relPath);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Remove from AVAILABLE_MENUS
    content = content.replace(
      /'Doc Verification',\r?\n\s*'Finance',\r?\n/g,
      ''
    );

    // 2. Remove from ROLE_DEFAULTS.admin
    content = content.replace(
      "'Doc Verification', 'Finance', ",
      ''
    );

    // 3. Remove from ROLE_DEFAULTS.operations
    content = content.replace(
      "'Doc Verification', ",
      ''
    );

    // 4. Update ROLE_DEFAULTS.finance
    content = content.replace(
      "menus: ['Dashboard', 'Finance'],",
      "menus: ['Dashboard'],"
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Updated ${relPath}`);
  }
}

function updateDashboardLayout() {
  const filePath = path.join(rootDir, 'frontend/src/layouts/DashboardLayout.jsx');
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Remove translations for Doc Verification and Finance
  content = content.replace(
    /\s*"Doc Verification":\s*"[^"]*",\r?\n\s*Finance:\s*"[^"]*",\r?\n/g,
    '\r\n'
  );

  // 2. Remove 5-second documents polling query and pendingDocsCount
  const queryStart = "const { data: allDocuments = [] } = useQuery({";
  const queryEnd = "}, [allDocuments]);";
  const qIdx = content.indexOf(queryStart);
  const eIdx = content.indexOf(queryEnd);
  if (qIdx !== -1 && eIdx !== -1) {
    content = content.substring(0, qIdx) + content.substring(eIdx + queryEnd.length);
  } else {
    console.warn('Warning: allDocuments query block not found');
  }

  // 3. Update badge check in renderNavItem
  content = content.replace(
    /const isDocVerification = item\.label === 'Doc Verification';\r?\n\s*const showBadgeCount = isDocVerification \? pendingDocsCount : 0;/g,
    'const showBadgeCount = item.badgeCount || 0;'
  );

  // 4. Remove Finance role from the quick role switcher menu
  content = content.replace(
    /\s*<MenuItem value="finance">Finance\s*[^<]*<\/MenuItem>\r?\n/g,
    '\r\n'
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓ Updated DashboardLayout.jsx');
}

function updateAppRoutes() {
  const filePath = path.join(rootDir, 'frontend/src/routes/AppRoutes.jsx');
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Remove unused imports for deprecated dashboards
  content = content.replace(
    /import AdminPaymentDashboard from '\.\.\/pages\/payments\/AdminPaymentDashboard';\r?\n/g,
    ''
  );
  content = content.replace(
    /import FinancePaymentDashboard from '\.\.\/pages\/payments\/FinancePaymentDashboard';\r?\n/g,
    ''
  );
  content = content.replace(
    /import InvoiceList from '\.\.\/pages\/payments\/InvoiceList';\r?\n/g,
    ''
  );
  content = content.replace(
    /import InvoiceDetails from '\.\.\/pages\/payments\/InvoiceDetails';\r?\n/g,
    ''
  );
  content = content.replace(
    /import AdminDocumentVerificationDashboard from '\.\.\/pages\/documents\/AdminDocumentVerificationDashboard';\r?\n/g,
    ''
  );
  content = content.replace(
    /import OperationsDocumentVerificationDashboard from '\.\.\/pages\/documents\/OperationsDocumentVerificationDashboard';\r?\n/g,
    ''
  );
  content = content.replace(
    /import SuperAdminDocumentVerificationDashboard from '\.\.\/pages\/documents\/SuperAdminDocumentVerificationDashboard';\r?\n/g,
    ''
  );
  content = content.replace(
    /import SuperAdminPaymentDashboard from '\.\.\/pages\/payments\/SuperAdminPaymentDashboard';\r?\n/g,
    ''
  );
  content = content.replace(
    /import SuperAdminRefundCommissionHub from '\.\.\/pages\/payments\/SuperAdminRefundCommissionHub';\r?\n/g,
    ''
  );

  // 2. Remove obsolete label mapping in getMenuLabelForPath
  content = content.replace(
    /\s*if \(p\.includes\('\/documents\/verify'\)\) return 'Doc Verification';\r?\n/g,
    '\r\n'
  );
  content = content.replace(
    /\s*if \(p\.includes\('\/payments\/refund-commission'\)\) return 'Refunds & Commissions';\r?\n/g,
    '\r\n'
  );
  content = content.replace(
    /\s*if \(p\.includes\('\/payments'\) \|\| p\.includes\('\/finance'\) \|\| p\.includes\('\/invoice'\)\) return 'Finance';\r?\n/g,
    '\r\n'
  );

  // 3. Remove obsolete label mapping in getDynamicRedirectPath
  content = content.replace(
    /\s*else if \(label === 'Doc Verification'\) path = '\/documents\/verify';\r?\n/g,
    '\r\n'
  );
  content = content.replace(
    /\s*else if \(label === 'Finance'\) path = '\/payments';\r?\n/g,
    '\r\n'
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓ Updated AppRoutes.jsx');
}

function updateLogin() {
  const filePath = path.join(rootDir, 'frontend/src/pages/auth/Login.jsx');
  let content = fs.readFileSync(filePath, 'utf8');

  // Filter finance from demo role selector cards
  content = content.replace(
    /const dynamicRoles = customizationSettings\?\.rolesDefinition \|\| \[/g,
    "const dynamicRoles = (customizationSettings?.rolesDefinition || ["
  );
  content = content.replace(
    /\{ id: 'marketing', label: 'Marketing', icon: 'CampaignIcon' \}\r?\n\s*\];/g,
    "{ id: 'marketing', label: 'Marketing', icon: 'CampaignIcon' }\r\n  ]).filter(r => r.id !== 'finance');"
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓ Updated Login.jsx');
}

console.log('Starting Cleanup of Deprecated Modules...');
updateSuperAdminCustomization();
updateAgentPermissionFiles();
updateDashboardLayout();
updateAppRoutes();
updateLogin();
console.log('Cleanup script finished.');

function filterFinanceInSuperAdminCustomization() {
  const filePath = path.join(rootDir, 'frontend/src/pages/settings/SuperAdminCustomization.jsx');
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    'const dynamicRoles = localSettings?.rolesDefinition || customizationSettings?.rolesDefinition || [',
    'const dynamicRoles = (localSettings?.rolesDefinition || customizationSettings?.rolesDefinition || ['
  );
  content = content.replace(
    /\{ id: 'marketing', label: 'Marketing Executive' \}\r?\n\s*\];/g,
    "{ id: 'marketing', label: 'Marketing Executive' }\r\n  ]).filter(r => r.id !== 'finance');"
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓ Filtered finance in dynamicRoles in SuperAdminCustomization.jsx');
}
filterFinanceInSuperAdminCustomization();

function fixIndentation() {
  const files = [
    'frontend/src/pages/settings/SuperAdminCustomization.jsx',
    'frontend/src/pages/team/AdminAgents.jsx',
    'frontend/src/pages/team/OperationsAgents.jsx',
    'frontend/src/pages/team/SuperAdminAgents.jsx'
  ];
  for (const relPath of files) {
    const filePath = path.join(rootDir, relPath);
    let c = fs.readFileSync(filePath, 'utf8');
    c = c.replace(/ {4}'Closed Cases',/g, "  'Closed Cases',");
    fs.writeFileSync(filePath, c, 'utf8');
  }
  console.log('✓ Fixed indentation for Closed Cases in all files');
}
fixIndentation();

function updateSanitizerAllThree() {
  const f = path.join(rootDir, 'frontend/src/pages/settings/SuperAdminCustomization.jsx');
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(
    "!['Finance', 'Refunds & Commissions'].includes(m)",
    "!['Doc Verification', 'Finance', 'Refunds & Commissions'].includes(m)"
  );
  fs.writeFileSync(f, c, 'utf8');
  console.log('✓ Sanitizer updated for all 3 modules');
}
updateSanitizerAllThree();
