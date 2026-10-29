const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '../..');
const originalSchemaPath = path.join(rootDir, 'backend/prisma/schema.prisma');
const draftSchemaPath = path.join(rootDir, 'backend/prisma/draft-review-schema.prisma');

let schema = fs.readFileSync(originalSchemaPath, 'utf8');

// Add virtual back-relation to User
schema = schema.replace(
  'createdCoupons     DiscountCode[]     @relation("CouponCreator")',
  'createdCoupons     DiscountCode[]     @relation("CouponCreator")\n  respondedReviews  Review[]           @relation("ReviewResponder")'
);

const addition = `
// ==========================================
// REVIEWS & REPUTATION MANAGEMENT (PHASE 3)
// ==========================================

enum ReviewProvider {
  GOOGLE
  META
  CLUTCH
  TRUSTPILOT
  MANUAL
}

enum ReviewSentiment {
  POSITIVE
  NEUTRAL
  NEGATIVE
}

enum ReviewResponseStatus {
  UNRESPONDED
  RESPONDED
  NOT_REQUIRED
}

enum ReviewStatus {
  PUBLISHED
  HIDDEN
  FLAGGED
}

enum ProviderConnectionStatus {
  CONNECTED
  DISCONNECTED
  ERROR
  CONFIG_REQUIRED
  MANUAL_ONLY
}

model Review {
  id               String               @id @default(uuid())
  provider         ReviewProvider
  externalReviewId String?              @db.VarChar(191)
  authorName       String               @default("Anonymous") @db.VarChar(191)
  authorPhotoUrl   String?              @db.Text
  rating           Int
  reviewText       String?              @db.Text
  reviewDate       DateTime             @default(now())
  sentiment        ReviewSentiment      @default(POSITIVE)
  responseStatus   ReviewResponseStatus @default(UNRESPONDED)
  responseText     String?              @db.Text
  respondedAt      DateTime?
  respondedById    String?              @db.VarChar(191)
  respondedBy      User?                @relation("ReviewResponder", fields: [respondedById], references: [id], onDelete: SetNull)
  status           ReviewStatus         @default(PUBLISHED)
  isDemo           Boolean              @default(false)
  originalUrl      String?              @db.Text
  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt

  @@unique([provider, externalReviewId], name: "provider_external_id")
  @@index([provider])
  @@index([rating])
  @@index([sentiment])
  @@index([responseStatus])
  @@index([isDemo])
  @@map("reviews")
}

model ReviewProviderConfig {
  id                 String                   @id @default(uuid())
  provider           ReviewProvider           @unique
  status             ProviderConnectionStatus @default(CONFIG_REQUIRED)
  accountIdentifier  String?                  @db.VarChar(191)
  encryptedApiKey    String?                  @db.Text
  encryptedApiSecret String?                  @db.Text
  autoSyncEnabled    Boolean                  @default(false)
  lastSyncAt         DateTime?
  lastSyncStatus     String?                  @db.VarChar(191)
  lastErrorMessage   String?                  @db.Text
  createdAt          DateTime                 @default(now())
  updatedAt          DateTime                 @updatedAt

  @@map("review_provider_configs")
}
`;

fs.writeFileSync(draftSchemaPath, schema + addition, 'utf8');
console.log('✓ Draft schema generated at:', draftSchemaPath);

try {
  const result = execSync('npx prisma validate --schema prisma/draft-review-schema.prisma', {
    cwd: path.join(rootDir, 'backend'),
    encoding: 'utf8'
  });
  console.log('✓ Prisma Schema Validation Result:\n' + result.trim());
} catch (err) {
  console.error('Validation failed:', err.stdout || err.message);
  process.exit(1);
} finally {
  if (fs.existsSync(draftSchemaPath)) {
    fs.unlinkSync(draftSchemaPath);
    console.log('✓ Cleaned up draft schema scratch file.');
  }
}
