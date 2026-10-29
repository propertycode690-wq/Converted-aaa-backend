const fs = require('fs');
const path = require('path');

const appPath = path.resolve(__dirname, '../src/app.js');
let content = fs.readFileSync(appPath, 'utf8');

if (!content.includes('/api/v1/reviews')) {
  const target = "app.use('/api/v1/coupons', require('./routes/couponRoutes'));";
  content = content.replace(target, `${target}\napp.use('/api/v1/reviews', require('./routes/reviewRoutes'));`);
  fs.writeFileSync(appPath, content, 'utf8');
  console.log('✓ Mounted /api/v1/reviews in app.js');
} else {
  console.log('Already mounted');
}

