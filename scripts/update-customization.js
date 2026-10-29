const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/settings/SuperAdminCustomization.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes("'Reviews'")) {
  content = content.replace(
    "  'Integrations'\r\n];",
    "  'Integrations',\r\n  'Reviews'\r\n];"
  );
  if (!content.includes("'Reviews'")) {
    content = content.replace(
      "  'Integrations'\n];",
      "  'Integrations',\n  'Reviews'\n];"
    );
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('SuperAdminCustomization.jsx updated successfully!');
} else {
  console.log('Reviews already present in AVAILABLE_MENUS!');
}

