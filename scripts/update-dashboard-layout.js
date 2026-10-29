const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/layouts/DashboardLayout.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes("path: '/reviews'")) {
  const target = "roles: ['admin', 'super_admin'],\r\n    },\r\n    {\r\n      label: 'Calendar',";
  const replacement = "roles: ['admin', 'super_admin'],\r\n    },\r\n    {\r\n      label: 'Reviews',\r\n      icon: <RateReviewIcon />,\r\n      path: '/reviews',\r\n      roles: ['admin', 'operations', 'super_admin', 'marketing'],\r\n    },\r\n    {\r\n      label: 'Calendar',";

  if (content.includes(target)) {
    content = content.replace(target, replacement);
  } else {
    const targetLF = "roles: ['admin', 'super_admin'],\n    },\n    {\n      label: 'Calendar',";
    const replacementLF = "roles: ['admin', 'super_admin'],\n    },\n    {\n      label: 'Reviews',\n      icon: <RateReviewIcon />,\n      path: '/reviews',\n      roles: ['admin', 'operations', 'super_admin', 'marketing'],\n    },\n    {\n      label: 'Calendar',";
    content = content.replace(targetLF, replacementLF);
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Added Reviews to menuItems!');
} else {
  console.log('Reviews already present in menuItems!');
}
