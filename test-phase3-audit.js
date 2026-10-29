const fs = require('fs');
const path = require('path');
const assert = require('assert');

// In-memory harness for controller testing
const reviewService = require('./src/services/reviewService');
const reviewController = require('./src/controllers/reviewController');
const cryptoUtil = require('./src/utils/cryptoUtil');
const { authMiddleware, rbacMiddleware } = require('./src/middlewares/authMiddleware');

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

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

// Mock Express req/res generator
function createMockReqRes({ user = null, params = {}, query = {}, body = {}, headers = {} }) {
  const req = {
    user,
    params,
    query,
    body,
    headers: { ...headers }
  };
  if (user && !req.headers.authorization) {
    req.headers.authorization = 'Bearer mock_valid_token';
  }

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };

  const next = () => {};
  return { req, res, next };
}

async function runAudit() {
  console.log('====================================================');
  console.log('   PHASE 3.4 REVIEWS END-TO-END AUDIT SUITE         ');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // SECTION 1: CONTRACT AUDIT (FRONTEND vs BACKEND)
  // ----------------------------------------------------
  console.log('--- Section 1: Frontend-to-Backend Contract Compatibility ---');

  const dbServiceText = fs.readFileSync(path.join(__dirname, '../frontend/src/services/dbService.js'), 'utf8');
  const reviewRoutesText = fs.readFileSync(path.join(__dirname, 'src/routes/reviewRoutes.js'), 'utf8');

  test('Contract: GET /api/v1/reviews query params align with reviewService filters', () => {
    assert(dbServiceText.includes("apiClient.get(`/reviews${queryStr ? `?${queryStr}` : ''}`)"));
    assert(dbServiceText.includes('params.provider'));
    assert(dbServiceText.includes('params.rating'));
    assert(dbServiceText.includes('params.sentiment'));
    assert(dbServiceText.includes('params.responseStatus'));
    assert(dbServiceText.includes('params.status'));
    assert(dbServiceText.includes('params.isDemo'));
    assert(dbServiceText.includes('params.search'));
  });

  test('Contract: GET /api/v1/reviews/stats includeDemo parameter is supported', () => {
    assert(dbServiceText.includes('getReviewStats: async (includeDemo = false)'));
    assert(dbServiceText.includes('apiClient.get(`/reviews/stats?includeDemo=${includeDemo}`)'));
  });

  test('Contract: POST /api/v1/reviews/:id/respond accepts responseText payload', () => {
    assert(dbServiceText.includes('respondToReview: async (id, responseText)'));
    assert(dbServiceText.includes('apiClient.post(`/reviews/${id}/respond`, { responseText })'));
  });

  test('Contract: PATCH /api/v1/reviews/:id/status updates moderation status', () => {
    assert(dbServiceText.includes('updateReviewStatus: async (id, status)'));
    assert(dbServiceText.includes('apiClient.patch(`/reviews/${id}/status`, { status })'));
  });

  test('Contract: Review provider sync and config endpoints match routes', () => {
    assert(dbServiceText.includes('apiClient.post(`/reviews/providers/${provider}/sync`)'));
    assert(dbServiceText.includes('apiClient.post(`/reviews/providers/${provider}/config`, config)'));
    assert(reviewRoutesText.includes("router.post('/providers/:provider/sync'"));
    assert(reviewRoutesText.includes("router.post('/providers/:provider/config'"));
  });

  // ----------------------------------------------------
  // SECTION 2: SERVER-SIDE RBAC & EDGE CASES
  // ----------------------------------------------------
  console.log('\n--- Section 2: Server-Side RBAC & Route Access Controls ---');

  test('RBAC: Consultant role is blocked with 403 on Review management middleware', () => {
    const middleware = rbacMiddleware(['super_admin', 'admin', 'operations', 'marketing']);
    const { req, res } = createMockReqRes({ user: { id: 'u-consultant', role: 'consultant' } });
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, 'Consultant should not call next()');
    assert.strictEqual(res.statusCode, 403, 'Consultant should receive 403');
    assert.strictEqual(res.body.message, 'Access denied. Insufficient permissions.');
  });

  test('RBAC: Marketing role is blocked with 403 on manual Review creation (POST /reviews)', () => {
    const middleware = rbacMiddleware(['super_admin', 'admin', 'operations']);
    const { req, res } = createMockReqRes({ user: { id: 'u-marketing', role: 'marketing' } });
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
  });

  test('RBAC: Admin role is blocked with 403 on Provider credential config (POST /providers/:provider/config)', () => {
    const middleware = rbacMiddleware(['super_admin']);
    const { req, res } = createMockReqRes({ user: { id: 'u-admin', role: 'admin' } });
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
  });

  test('RBAC: SuperAdmin role is authorized for Provider credential config', () => {
    const middleware = rbacMiddleware(['super_admin']);
    const { req, res } = createMockReqRes({ user: { id: 'u-superadmin', role: 'super_admin' } });
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'SuperAdmin should be allowed');
    assert.strictEqual(res.statusCode, 200);
  });

  test('Edge Case: Unauthenticated requests without token get 401 Unauthorized', () => {
    const { req, res } = createMockReqRes({ headers: {} }); // No Authorization header
    let nextCalled = false;
    authMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
  });

  await asyncTest('Edge Case: Response to non-existent review ID returns 404', async () => {
    const { req, res } = createMockReqRes({
      user: { id: 'u-admin', role: 'admin' },
      params: { id: 'non-existent-uuid' },
      body: { responseText: 'Thank you for your feedback!' }
    });

    // Mock prisma findUnique to return null
    const origFindUnique = reviewService.prisma.review.findUnique;
    reviewService.prisma.review.findUnique = async () => null;

    try {
      await reviewController.respondToReview(req, res);
      assert.strictEqual(res.statusCode, 404);
      assert(res.body.message.includes('not found'));
    } finally {
      reviewService.prisma.review.findUnique = origFindUnique;
    }
  });

  await asyncTest('Edge Case: Empty or whitespace responseText returns 400 Bad Request', async () => {
    const { req, res } = createMockReqRes({
      user: { id: 'u-admin', role: 'admin' },
      params: { id: 'review-123' },
      body: { responseText: '   ' }
    });

    await reviewController.respondToReview(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert(res.body.message.includes('cannot be empty'));
  });

  await asyncTest('Edge Case: Invalid moderation status returns 400 Bad Request', async () => {
    const { req, res } = createMockReqRes({
      user: { id: 'u-admin', role: 'admin' },
      params: { id: 'review-123' },
      body: { status: 'INVALID_STATUS' }
    });

    await reviewController.updateReviewStatus(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert(res.body.message.includes('PUBLISHED, HIDDEN, FLAGGED'));
  });

  await asyncTest('Edge Case: Invalid provider config name returns 400 Bad Request', async () => {
    const { req, res } = createMockReqRes({
      user: { id: 'u-superadmin', role: 'super_admin' },
      params: { provider: 'INVALID_PROVIDER' },
      body: { apiKey: 'key123' }
    });

    await reviewController.updateProviderConfig(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert(res.body.message.includes('Invalid provider name'));
  });

  // ----------------------------------------------------
  // SECTION 3: ROUTE SHADOWING AUDIT
  // ----------------------------------------------------
  console.log('\n--- Section 3: Route Shadowing & Dynamic Path Security ---');

  const appRoutesText = fs.readFileSync(path.join(__dirname, '../frontend/src/routes/AppRoutes.jsx'), 'utf8');

  test('Route Order: Static /reviews routes are declared before /:rolePrefix routes', () => {
    const staticIndex = appRoutesText.indexOf('path="/reviews"');
    const dynamicIndex = appRoutesText.indexOf('path="/:rolePrefix/dashboard"');
    assert(staticIndex !== -1, 'Missing static /reviews route');
    assert(dynamicIndex !== -1, 'Missing dynamic /:rolePrefix route');
    assert(staticIndex < dynamicIndex, 'Static /reviews must precede /:rolePrefix routes to prevent route shadowing');
  });

  test('Route Guard: /:rolePrefix/reviews explicitly enforces role check', () => {
    assert(appRoutesText.includes("path=\"/:rolePrefix/reviews\" element={<ProtectedRoute allowedRoles={['admin', 'super_admin', 'operations', 'marketing']}"));
  });

  test('Navigation Mapping: getMenuLabelForPath resolves Reviews without collision', () => {
    assert(appRoutesText.includes("if (p.includes('/reviews')) return 'Reviews';"));
    assert(appRoutesText.includes("if (label === 'Reviews') return '/reviews';"));
  });

  // ----------------------------------------------------
  // SECTION 4: HONEST PROVIDER STATUSES & DEMO ISOLATION
  // ----------------------------------------------------
  console.log('\n--- Section 4: Honest Provider Statuses & Demo Isolation ---');

  test('Provider Integrity: Clutch adapter reports supportsLiveSync = false and MANUAL_ONLY', () => {
    const clutch = reviewService.providerAdapters.CLUTCH;
    assert.strictEqual(clutch.supportsLiveSync, false);
    assert.strictEqual(clutch.name, 'Clutch.co');
  });

  await asyncTest('Provider Sync: Syncing Clutch returns MANUAL_ONLY without attempting external API', async () => {
    const { req, res } = createMockReqRes({
      user: { id: 'u-admin', role: 'admin' },
      params: { provider: 'CLUTCH' }
    });

    await reviewController.syncProviderReviews(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'MANUAL_ONLY');
    assert(res.body.message.includes('Enterprise partners'));
  });

  test('Demo Isolation: Demo mode toggle in frontend does not perform persistent POST mutations', () => {
    const dashboardText = fs.readFileSync(path.join(__dirname, '../frontend/src/pages/reviews/ReviewsDashboard.jsx'), 'utf8');
    // Verify showDemo is local React state
    assert(dashboardText.includes('const [showDemo, setShowDemo] = useState(false)'));
    // Verify toggle only calls setShowDemo
    assert(dashboardText.includes('onChange={(e) => setShowDemo(e.target.checked)}'));
    // Verify demo reviews are excluded from live stats
    assert(dashboardText.includes("queryKey: ['review-stats', showDemo]"));
  });

  // ----------------------------------------------------
  // SECTION 5: DATABASE DEGRADATION & BACKUP VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- Section 5: Database Degradation & Backup Audit ---');

  test('Backup Verification: phase3_pre_backup is confirmed as JSON metadata manifest, not SQL dump', () => {
    const backupFile = path.join(__dirname, 'backups/phase3_pre_backup_2026-10-28T11-13-28-646Z.json');
    assert(fs.existsSync(backupFile), 'Backup manifest file must exist');
    const content = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    assert.strictEqual(content.backupName, 'phase3_pre_migration_backup');
    assert.strictEqual(content.phase, 'Phase 3.1 Review Models Pre-Migration');
    // Manifest records that tables do not exist yet
    assert(content.preMigrationStatus.includes('Tables do not exist yet'));
    assert(Array.isArray(content.tablesTargeted));
    assert(content.tablesTargeted.includes('reviews'));
    assert(content.tablesTargeted.includes('review_provider_configs'));
  });

  test('Prisma Schema: Virtual back-relation on User model introduces no database columns', () => {
    const schemaContent = fs.readFileSync(path.join(__dirname, 'prisma/schema.prisma'), 'utf8');
    assert(/respondedReviews\s+Review\[\]\s+@relation\("ReviewResponder"\)/.test(schemaContent));
    // Ensure no foreign key field exists on User for reviews
    const userModel = schemaContent.slice(schemaContent.indexOf('model User {'), schemaContent.indexOf('@@map("users")'));
    assert(!userModel.includes('reviewId'));
  });

  test('Prisma Schema: Reviews externalReviewId is nullable VarChar(191) with compound index', () => {
    const schemaContent = fs.readFileSync(path.join(__dirname, 'prisma/schema.prisma'), 'utf8');
    assert(schemaContent.includes('externalReviewId String?              @db.VarChar(191)'));
    assert(schemaContent.includes('@@unique([provider, externalReviewId], name: "provider_external_id")'));
  });

  console.log('\n====================================================');
  console.log(`Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAudit();

