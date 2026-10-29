const fs = require('fs');
const content = fs.readFileSync('frontend/src/routes/AppRoutes.jsx', 'utf8');

const testPaths = [
  '/payments',
  '/documents/verify',
  '/payments/refund-commission',
  '/super_admin/documents/verify',
  '/super_admin/payments',
  '/:role/payments/refund-commission',
  '/admin/documents/verify',
  '/operations/documents/verify',
  '/agent/documents/verify',
  '/finance/documents/verify',
  '/marketing-manager/documents/verify',
  '/admin/payments',
  '/finance/payments',
  '/operations/payments',
  '/agent/payments',
  '/marketing-manager/payments',
  '/payments/invoices',
  '/payments/invoice-details/:id',
  '/:rolePrefix/documents/verify',
  '/:rolePrefix/payments'
];

let allSafe = true;
for (const p of testPaths) {
  const routeRegex = new RegExp(`<Route\\s+path=["']${p.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}["']\\s+element={<Navigate\\s+to=["']/dashboard["']\\s+replace\\s*/>}\\s*/>`);
  if (!routeRegex.test(content)) {
    console.error(`Missing safe redirect for: ${p}`);
    allSafe = false;
  } else {
    console.log(`[SAFE REDIRECT] ${p} -> /dashboard`);
  }
}

if (allSafe) {
  console.log('\n✓ ALL 20 obsolete routes are safely redirected to /dashboard!');
} else {
  process.exit(1);
}

