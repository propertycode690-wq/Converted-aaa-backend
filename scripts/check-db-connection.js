const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('STATUS: CONNECTED');
    
    // Check if review tables exist in database schema
    try {
      const reviewCount = await prisma.review.count();
      console.log('REVIEWS_TABLE: EXISTS, count =', reviewCount);
    } catch (err) {
      console.log('REVIEWS_TABLE: NOT_FOUND (code:', err.code, 'message:', err.message, ')');
    }

    try {
      const configCount = await prisma.reviewProviderConfig.count();
      console.log('CONFIG_TABLE: EXISTS, count =', configCount);
    } catch (err) {
      console.log('CONFIG_TABLE: NOT_FOUND (code:', err.code, 'message:', err.message, ')');
    }

    await prisma.$disconnect();
  } catch (err) {
    console.log('STATUS: UNREACHABLE');
    console.log('ERROR:', err.message);
  }
}

main();
