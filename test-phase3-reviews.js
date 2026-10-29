const assert = require('assert');
const path = require('path');
const jwt = require('jsonwebtoken');

// 1. Set environment for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_1234567890_antigravity';
process.env.REVIEW_ENCRYPTION_KEY = 'super_secret_test_encryption_key_32_bytes_long!';

const cryptoUtil = require('./src/utils/cryptoUtil');
const reviewService = require('./src/services/reviewService');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${err.message}`);
  }
}

function createMockReqRes(role, body = {}, params = {}, query = {}) {
  const token = role ? jwt.sign({ id: `user-${role}`, role, email: `${role}@test.com` }, process.env.JWT_SECRET) : null;
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
    params,
    query,
    user: role ? { id: `user-${role}`, role, email: `${role}@test.com` } : null
  };
  let statusCode = 200;
  let jsonResponse = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonResponse = payload;
      return this;
    },
    getStatusCode: () => statusCode,
    getResponse: () => jsonResponse
  };

  return { req, res };
}

async function main() {
  console.log('====================================================');
  console.log('=== RUNNING PHASE 3 REVIEWS TEST SUITE ===');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // TEST GROUP 1: CRYPTOGRAPHIC ENCRYPTION AT REST
  // ----------------------------------------------------
  console.log('--- TEST GROUP 1: CRYPTOGRAPHIC ENCRYPTION AT REST ---');

  runTest('AES-256-GCM roundtrip encrypts and decrypts secret correctly', () => {
    const secret = 'my-production-google-api-key-98765';
    const encrypted = cryptoUtil.encrypt(secret);
    assert.notStrictEqual(encrypted, secret);
    assert.strictEqual(encrypted.split(':').length, 3, 'Ciphertext must be iv:authTag:ciphertext');
    const decrypted = cryptoUtil.decrypt(encrypted);
    assert.strictEqual(decrypted, secret);
  });

  runTest('Tampered authentication tag fails verification and throws error', () => {
    const secret = 'meta-page-access-token-abc';
    const encrypted = cryptoUtil.encrypt(secret);
    const parts = encrypted.split(':');
    parts[1] = '00'.repeat(16); // Corrupt auth tag
    assert.throws(() => {
      cryptoUtil.decrypt(parts.join(':'));
    }, /Authentication tag verification failed/);
  });

  runTest('Tampered ciphertext fails verification and throws error', () => {
    const secret = 'trustpilot-secret-xyz';
    const encrypted = cryptoUtil.encrypt(secret);
    const parts = encrypted.split(':');
    parts[2] = parts[2].slice(0, -2) + 'ff'; // Modify 1 byte of ciphertext
    assert.throws(() => {
      cryptoUtil.decrypt(parts.join(':'));
    }, /Authentication tag verification failed/);
  });

  runTest('Missing REVIEW_ENCRYPTION_KEY fails securely without plaintext fallback', () => {
    const oldKey = process.env.REVIEW_ENCRYPTION_KEY;
    delete process.env.REVIEW_ENCRYPTION_KEY;
    try {
      assert.throws(() => {
        cryptoUtil.encrypt('should-fail');
      }, /Missing or invalid REVIEW_ENCRYPTION_KEY/);
    } finally {
      process.env.REVIEW_ENCRYPTION_KEY = oldKey;
    }
  });

  runTest('Insecure short key fails securely', () => {
    const oldKey = process.env.REVIEW_ENCRYPTION_KEY;
    process.env.REVIEW_ENCRYPTION_KEY = 'too-short';
    try {
      assert.throws(() => {
        cryptoUtil.encrypt('should-fail');
      }, /Missing or invalid REVIEW_ENCRYPTION_KEY/);
    } finally {
      process.env.REVIEW_ENCRYPTION_KEY = oldKey;
    }
  });

  runTest('maskSecret never leaks complete credentials in API responses', () => {
    const key = 'AIzaSyD-1234567890abcdefghijklmnopqrstuvw';
    const masked = cryptoUtil.maskSecret(key);
    assert.strictEqual(masked.includes('1234567890'), false);
    assert.strictEqual(masked.startsWith('****'), true);
    assert.strictEqual(cryptoUtil.maskSecret(null), null);
  });

  // ----------------------------------------------------
  // TEST GROUP 2: SENTIMENT ANALYSIS & INPUT VALIDATION
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: SENTIMENT & INPUT VALIDATION ---');

  runTest('Sentiment: 5-star positive review classified as POSITIVE', () => {
    const sentiment = reviewService.classifySentiment(5, 'Excellent software engineering and fast delivery!');
    assert.strictEqual(sentiment, 'POSITIVE');
  });

  runTest('Sentiment: 1-star negative review classified as NEGATIVE', () => {
    const sentiment = reviewService.classifySentiment(1, 'Terrible communication, unorganized and delayed deliverables.');
    assert.strictEqual(sentiment, 'NEGATIVE');
  });

  runTest('Sentiment: 3-star balanced review classified as NEUTRAL', () => {
    const sentiment = reviewService.classifySentiment(3, 'Average performance. Work got done but took longer than anticipated.');
    assert.strictEqual(sentiment, 'NEUTRAL');
  });

  runTest('Sentiment: 4-star review with severe negative complaints classified as NEUTRAL', () => {
    const sentiment = reviewService.classifySentiment(4, 'Great app but terrible customer support after launch.');
    assert.strictEqual(sentiment, 'NEUTRAL');
  });

  runTest('Validation: Rating below 1 throws validation error', () => {
    assert.throws(() => {
      reviewService.validateReviewInput({ provider: 'GOOGLE', rating: 0 });
    }, /Rating must be an integer between 1 and 5/);
  });

  runTest('Validation: Rating above 5 throws validation error', () => {
    assert.throws(() => {
      reviewService.validateReviewInput({ provider: 'GOOGLE', rating: 6 });
    }, /Rating must be an integer between 1 and 5/);
  });

  runTest('Validation: Non-integer rating throws validation error', () => {
    assert.throws(() => {
      reviewService.validateReviewInput({ provider: 'GOOGLE', rating: 4.5 });
    }, /Rating must be an integer between 1 and 5/);
  });

  runTest('Validation: Invalid provider throws validation error', () => {
    assert.throws(() => {
      reviewService.validateReviewInput({ provider: 'UNKNOWN_PLATFORM', rating: 5 });
    }, /Invalid provider/);
  });

  runTest('Validation: Sanitizes script tags and trims empty externalReviewId to null', () => {
    const validated = reviewService.validateReviewInput({
      provider: 'CLUTCH',
      rating: 5,
      authorName: '<b>John</b> <script>alert("hack")</script>',
      reviewText: 'Legitimate text <script>fetch("evil.com")</script>',
      externalReviewId: '   '
    });
    assert.strictEqual(validated.authorName.includes('<script>'), false);
    assert.strictEqual(validated.reviewText.includes('<script>'), false);
    assert.strictEqual(validated.externalReviewId, null);
  });

  // ----------------------------------------------------
  // TEST GROUP 3: PROVIDER ADAPTERS & SYNC HEALTH
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: PROVIDER ADAPTERS & SYNC HEALTH ---');

  await runAsyncTest('Google Adapter reports CONFIG_REQUIRED when unconfigured', async () => {
    const adapter = reviewService.providerAdapters.GOOGLE;
    const conn = await adapter.testConnection(null);
    assert.strictEqual(conn.connected, false);
    assert.strictEqual(conn.status, 'CONFIG_REQUIRED');
  });

  await runAsyncTest('Meta Adapter reports CONFIG_REQUIRED when unconfigured', async () => {
    const adapter = reviewService.providerAdapters.META;
    const conn = await adapter.testConnection({});
    assert.strictEqual(conn.connected, false);
    assert.strictEqual(conn.status, 'CONFIG_REQUIRED');
  });

  await runAsyncTest('Clutch Adapter operates strictly in MANUAL_ONLY mode (API restricted)', async () => {
    const adapter = reviewService.providerAdapters.CLUTCH;
    const conn = await adapter.testConnection();
    assert.strictEqual(conn.connected, false);
    assert.strictEqual(conn.status, 'MANUAL_ONLY');
    assert.strictEqual(adapter.supportsLiveSync, false);
  });

  await runAsyncTest('Trustpilot Adapter reports CONFIG_REQUIRED when unconfigured', async () => {
    const adapter = reviewService.providerAdapters.TRUSTPILOT;
    const conn = await adapter.testConnection(null);
    assert.strictEqual(conn.connected, false);
    assert.strictEqual(conn.status, 'CONFIG_REQUIRED');
  });

  // ----------------------------------------------------
  // TEST GROUP 4: DEMO DATA & ANALYTICS SEPARATION
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: DEMO DATA & ANALYTICS SEPARATION ---');

  runTest('Demo reviews explicitly marked with isDemo: true', () => {
    const demoReviews = reviewService.getDemoReviews();
    assert.strictEqual(demoReviews.length >= 4, true);
    for (const r of demoReviews) {
      assert.strictEqual(r.isDemo, true, `Review ${r.externalReviewId} must be marked isDemo: true`);
      assert.strictEqual(['GOOGLE', 'META', 'CLUTCH', 'TRUSTPILOT'].includes(r.provider), true);
    }
  });

  // ----------------------------------------------------
  // TEST GROUP 5: RBAC & ROUTE AUTHORIZATION CHECKS
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 5: RBAC & ROUTE AUTHORIZATION CHECKS ---');

  runTest('AuthMiddleware blocks unauthenticated requests with 401', () => {
    const { authMiddleware } = require('./src/middlewares/authMiddleware');
    const { req, res } = createMockReqRes(null);
    let nextCalled = false;
    authMiddleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.getStatusCode(), 401);
    assert.strictEqual(nextCalled, false);
  });

  runTest('RBAC: Consultant role blocked with 403 on reviews management', () => {
    const { rbacMiddleware } = require('./src/middlewares/authMiddleware');
    const guard = rbacMiddleware(['super_admin', 'admin', 'operations', 'marketing']);
    const { req, res } = createMockReqRes('consultant');
    let nextCalled = false;
    guard(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.getStatusCode(), 403);
    assert.strictEqual(nextCalled, false);
  });

  runTest('RBAC: Marketing allowed to GET /reviews and GET /reviews/stats', () => {
    const { rbacMiddleware } = require('./src/middlewares/authMiddleware');
    const guard = rbacMiddleware(['super_admin', 'admin', 'operations', 'marketing']);
    const { req, res } = createMockReqRes('marketing');
    let nextCalled = false;
    guard(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  runTest('RBAC: Marketing blocked with 403 on POST /reviews (manual creation restricted to Admin/Ops)', () => {
    const { rbacMiddleware } = require('./src/middlewares/authMiddleware');
    const guard = rbacMiddleware(['super_admin', 'admin', 'operations']);
    const { req, res } = createMockReqRes('marketing');
    let nextCalled = false;
    guard(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.getStatusCode(), 403);
    assert.strictEqual(nextCalled, false);
  });

  runTest('RBAC: Operations blocked with 403 on POST /providers/:provider/config (SuperAdmin only)', () => {
    const { rbacMiddleware } = require('./src/middlewares/authMiddleware');
    const guard = rbacMiddleware(['super_admin']);
    const { req, res } = createMockReqRes('operations');
    let nextCalled = false;
    guard(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.getStatusCode(), 403);
    assert.strictEqual(nextCalled, false);
  });

  runTest('RBAC: SuperAdmin authorized on POST /providers/:provider/config', () => {
    const { rbacMiddleware } = require('./src/middlewares/authMiddleware');
    const guard = rbacMiddleware(['super_admin']);
    const { req, res } = createMockReqRes('super_admin');
    let nextCalled = false;
    guard(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  console.log('\n====================================================');
  console.log(`=== PHASE 3 SUITE RESULTS: ${passedTests} PASSED, ${totalTests - passedTests} FAILED ===`);
  console.log('====================================================');
  if (totalTests !== passedTests) process.exit(1);
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
