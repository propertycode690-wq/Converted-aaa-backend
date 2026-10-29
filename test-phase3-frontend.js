const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

console.log('====================================================');
console.log('   PHASE 3.3 FRONTEND REVIEWS & REPUTATION SUITE     ');
console.log('====================================================\n');

// 1. Inspect dbService.js
console.log('--- Suite 1: dbService.js Reviews API Client ---');
const dbServiceContent = fs.readFileSync(path.join(__dirname, '../frontend/src/services/dbService.js'), 'utf8');

test('dbService exports getReviews method with query params handling', () => {
  assert(dbServiceContent.includes('getReviews: async (params = {})'), 'Missing getReviews');
  assert(dbServiceContent.includes("apiClient.get(`/reviews"), 'Missing apiClient.get(/reviews)');
  assert(dbServiceContent.includes('params.provider'), 'Missing provider filter param');
  assert(dbServiceContent.includes('params.rating'), 'Missing rating filter param');
  assert(dbServiceContent.includes('params.sentiment'), 'Missing sentiment filter param');
  assert(dbServiceContent.includes('params.responseStatus'), 'Missing responseStatus filter param');
});

test('dbService exports getReviewStats method with includeDemo support', () => {
  assert(dbServiceContent.includes('getReviewStats: async (includeDemo = false)'), 'Missing getReviewStats');
  assert(dbServiceContent.includes('/reviews/stats?includeDemo='), 'Missing includeDemo param in endpoint call');
});

test('dbService exports createReview, respondToReview, updateReviewStatus', () => {
  assert(dbServiceContent.includes('createReview: async (reviewData)'), 'Missing createReview');
  assert(dbServiceContent.includes('respondToReview: async (id, responseText)'), 'Missing respondToReview');
  assert(dbServiceContent.includes('updateReviewStatus: async (id, status)'), 'Missing updateReviewStatus');
});

test('dbService exports getReviewProviders, syncReviewProvider, updateReviewProviderConfig', () => {
  assert(dbServiceContent.includes('getReviewProviders: async ()'), 'Missing getReviewProviders');
  assert(dbServiceContent.includes('syncReviewProvider: async (provider)'), 'Missing syncReviewProvider');
  assert(dbServiceContent.includes('updateReviewProviderConfig: async (provider, config)'), 'Missing updateReviewProviderConfig');
});

// 2. Inspect DashboardLayout.jsx
console.log('\n--- Suite 2: DashboardLayout.jsx Navigation & RBAC ---');
const dashboardLayoutContent = fs.readFileSync(path.join(__dirname, '../frontend/src/layouts/DashboardLayout.jsx'), 'utf8');

test('DashboardLayout imports RateReviewIcon', () => {
  assert(dashboardLayoutContent.includes('RateReviewIcon'), 'Missing RateReviewIcon import');
});

test('DashboardLayout includes Reviews in translations (English, Arabic, Spanish, French, German)', () => {
  assert(dashboardLayoutContent.includes('Reviews: "Reviews"'), 'Missing English translation');
  assert(dashboardLayoutContent.includes('Reviews: "التقييمات"'), 'Missing Arabic translation');
  assert(dashboardLayoutContent.includes('Reviews: "Reseñas"'), 'Missing Spanish translation');
  assert(dashboardLayoutContent.includes('Reviews: "Avis"'), 'Missing French translation');
  assert(dashboardLayoutContent.includes('Reviews: "Bewertungen"'), 'Missing German translation');
});

test('DashboardLayout getDynamicPath maps /reviews without prefix', () => {
  assert(dashboardLayoutContent.includes("if (item.path === '/reviews') return '/reviews';"), 'Missing /reviews shared path rule');
});

test('DashboardLayout menuItems defines Reviews with correct role permissions', () => {
  assert(dashboardLayoutContent.includes("label: 'Reviews'"), 'Missing Reviews menu item');
  assert(dashboardLayoutContent.includes("path: '/reviews'"), 'Missing /reviews path in menu item');
  // Must allow super_admin, admin, operations, marketing
  const menuSegment = dashboardLayoutContent.slice(dashboardLayoutContent.indexOf("label: 'Reviews'"), dashboardLayoutContent.indexOf("label: 'Calendar'"));
  assert(menuSegment.includes("'super_admin'"), 'Reviews menu item missing super_admin role');
  assert(menuSegment.includes("'admin'"), 'Reviews menu item missing admin role');
  assert(menuSegment.includes("'operations'"), 'Reviews menu item missing operations role');
  assert(menuSegment.includes("'marketing'"), 'Reviews menu item missing marketing role');
  // Consultant should NOT have access
  assert(!menuSegment.includes("'consultant'"), 'Reviews menu item must NOT allow consultant role');
});

// 3. Inspect AppRoutes.jsx
console.log('\n--- Suite 3: AppRoutes.jsx Routing & Guards ---');
const appRoutesContent = fs.readFileSync(path.join(__dirname, '../frontend/src/routes/AppRoutes.jsx'), 'utf8');

test('AppRoutes imports ReviewsDashboard', () => {
  assert(appRoutesContent.includes("import ReviewsDashboard from '../pages/reviews/ReviewsDashboard';"), 'Missing ReviewsDashboard import');
});

test('AppRoutes maps /reviews to Reviews menu label and redirect path', () => {
  assert(appRoutesContent.includes("if (p.includes('/reviews')) return 'Reviews';"), 'Missing menu label mapping');
  assert(appRoutesContent.includes("else if (label === 'Reviews') path = '/reviews';"), 'Missing dynamic redirect path');
});

test('AppRoutes defines protected routes for /reviews and role prefixes', () => {
  assert(appRoutesContent.includes('path="/reviews"'), 'Missing /reviews route');
  assert(appRoutesContent.includes('path="/admin/reviews"'), 'Missing /admin/reviews route');
  assert(appRoutesContent.includes('path="/super_admin/reviews"'), 'Missing /super_admin/reviews route');
  assert(appRoutesContent.includes('path="/operations/reviews"'), 'Missing /operations/reviews route');
  assert(appRoutesContent.includes('path="/marketing-manager/reviews"'), 'Missing /marketing-manager/reviews route');
  assert(appRoutesContent.includes('path="/:rolePrefix/reviews"'), 'Missing /:rolePrefix/reviews route');
});

// 4. Inspect ReviewsDashboard.jsx
console.log('\n--- Suite 4: ReviewsDashboard.jsx Component UI & Features ---');
const reviewsDashboardContent = fs.readFileSync(path.join(__dirname, '../frontend/src/pages/reviews/ReviewsDashboard.jsx'), 'utf8');

test('ReviewsDashboard defines KPI cards (Total Reviews, Rating, Positive Sentiment, Response Rate, Needs Attention)', () => {
  assert(reviewsDashboardContent.includes('Total Reviews'), 'Missing Total Reviews KPI');
  assert(reviewsDashboardContent.includes('Average Star Rating'), 'Missing Average Rating KPI');
  assert(reviewsDashboardContent.includes('Positive Sentiment'), 'Missing Positive Sentiment KPI');
  assert(reviewsDashboardContent.includes('Official Response Rate'), 'Missing Response Rate KPI');
  assert(reviewsDashboardContent.includes('Needs Response'), 'Missing Needs Response KPI');
});

test('ReviewsDashboard configures honest provider metadata (Google, Meta, Clutch, Trustpilot)', () => {
  assert(reviewsDashboardContent.includes('Google Business Profile'), 'Missing Google provider');
  assert(reviewsDashboardContent.includes('Meta / Facebook'), 'Missing Meta provider');
  assert(reviewsDashboardContent.includes('Clutch.co'), 'Missing Clutch provider');
  assert(reviewsDashboardContent.includes('Trustpilot'), 'Missing Trustpilot provider');
  // Clutch must be MANUAL_ONLY
  assert(reviewsDashboardContent.includes('MANUAL ONLY'), 'Missing Clutch MANUAL ONLY chip');
  assert(reviewsDashboardContent.includes('+ Add Clutch Review'), 'Missing Add Clutch Review action');
});

test('ReviewsDashboard protects SuperAdmin credential configuration dialog', () => {
  assert(reviewsDashboardContent.includes('isSuperAdmin'), 'Missing isSuperAdmin guard');
  assert(reviewsDashboardContent.includes('Configure {activeProviderForConfig?.name} Credentials'), 'Missing Config Dialog title');
  assert(reviewsDashboardContent.includes('AES-256-GCM'), 'Missing AES-256-GCM security notice');
});

test('ReviewsDashboard supports Demo Mode toggle with persistent warning banner and badges', () => {
  assert(reviewsDashboardContent.includes('Demo Mode'), 'Missing Demo Mode switch');
  assert(reviewsDashboardContent.includes('Demonstration Mode Active:'), 'Missing Demo Mode banner');
  assert(reviewsDashboardContent.includes('label="DEMO"'), 'Missing DEMO chip badge');
});

test('ReviewsDashboard includes review filters (Search, Provider, Rating, Sentiment, Response, Visibility)', () => {
  assert(reviewsDashboardContent.includes('Search author or text...'), 'Missing search input');
  assert(reviewsDashboardContent.includes('label="Provider"'), 'Missing provider filter');
  assert(reviewsDashboardContent.includes('label="Rating"'), 'Missing rating filter');
  assert(reviewsDashboardContent.includes('label="Sentiment"'), 'Missing sentiment filter');
  assert(reviewsDashboardContent.includes('label="Response"'), 'Missing response filter');
  assert(reviewsDashboardContent.includes('label="Visibility"'), 'Missing visibility/moderation filter');
});

test('ReviewsDashboard handles official reply dialog and audit logging', () => {
  assert(reviewsDashboardContent.includes('Official Company Response'), 'Missing reply dialog input');
  assert(reviewsDashboardContent.includes('Official Response from AAA Consultancy'), 'Missing official response header');
  assert(reviewsDashboardContent.includes('replyMutation.mutate'), 'Missing reply mutation trigger');
});

test('ReviewsDashboard gracefully handles unmigrated live database state without crashing', () => {
  assert(reviewsDashboardContent.includes('Live Database Notice:'), 'Missing unmigrated database fallback alert');
  assert(reviewsDashboardContent.includes('FALLBACK_DEMO_REVIEWS'), 'Missing fallback demo reviews');
});

console.log('\n====================================================');
console.log(`Results: ${passedTests} passed, ${failedTests} failed`);
console.log('====================================================\n');

if (failedTests > 0) {
  process.exit(1);
}

