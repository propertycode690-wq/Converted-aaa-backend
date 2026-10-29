const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/public/LeadSelfFillForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace('AAA Consultancy Services', 'AAA Technologies LLC');
content = content.replace('Free Eligibility Consultation Booking', 'IT Project Discovery & Consultation Booking');
content = content.replace('Are you sure you want to cancel your scheduled Spain Visa Eligibility Assessment?', 'Are you sure you want to cancel your scheduled IT Project Discovery Call?');
content = content.replace('with your assigned Case Officer.', 'with your assigned Technical Account Manager.');

content = content.replace(/placeholder=\{\s*serviceCategory === "property"[\s\S]*?family\.\.\.'"\s*\}/, 'placeholder="Briefly describe your product goals, key features, target platform, or required tech stack (e.g. React, Node.js, Python, AWS)..."');

content = content.replace(/<li>\s*\{serviceCategory === "property"[\s\S]*?profile"\}\s*<\/li>/, `<li>
                    ✅ A dedicated IT Solutions Consultant has been assigned to your project
                  </li>`);

content = content.replace('© 2026 AAA Visa Consultancy · All rights reserved', '© 2026 AAA Technologies LLC · All rights reserved');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully cleaned remaining LeadSelfFillForm phrases.');

