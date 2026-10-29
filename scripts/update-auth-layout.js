const fs = require('fs');
const path = require('path');

const authLayoutPath = path.join(__dirname, '../../frontend/src/layouts/AuthLayout.jsx');
let content = fs.readFileSync(authLayoutPath, 'utf8');

// 1. Update Left Pane Brand Title
content = content.replace(
  `<Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: 'white' }}>\r\n              AAA Business Consultancy\r\n            </Typography>`,
  `<Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: 'white' }}>\r\n              AAA Technologies\r\n            </Typography>`
);
// Fallback with \n if CRLF wasn't exact
content = content.replace(
  `<Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: 'white' }}>\n              AAA Business Consultancy\n            </Typography>`,
  `<Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: 'white' }}>\n              AAA Technologies\n            </Typography>`
);

// 2. Update Left Pane Hero Heading & Description
const oldHeroRegex = /<Typography variant="h2" sx=\{\{ fontWeight: 800, color: 'white', mb: 2, lineHeight: 1\.2 \}\}>\s*Your Trusted Partner for a Better Future in Spain\.\s*<\/Typography>\s*<Typography variant="body1" sx=\{\{ color: 'rgba\(255, 255, 255, 0\.85\)', maxWidth: 520 \}\}>\s*Specializing in Digital Nomad Visas[\s\S]*?<\/Typography>/;

const newHero = `<Typography variant="h2" sx={{ fontWeight: 800, color: 'white', mb: 2, lineHeight: 1.2 }}>
            Your Trusted Technology Partner
          </Typography>
          <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.85)', maxWidth: 520 }}>
            We build custom software, web and mobile applications, AI-powered solutions, and scalable cloud infrastructure to help businesses grow.
          </Typography>`;

if (oldHeroRegex.test(content)) {
  content = content.replace(oldHeroRegex, newHero);
  console.log('✓ Replaced Hero Heading & Description with IT Agency copy');
} else {
  console.warn('⚠ Could not match oldHeroRegex');
}

// 3. Update Left Pane Footer Copyright
content = content.replace(
  '© {new Date().getFullYear()} AAA Business Consultancy LLC. Advise • Assist • Achieve.',
  '© {new Date().getFullYear()} AAA Technologies LLC. Innovate • Build • Scale.'
);

// 4. Update Mobile Header (Lines 146-151)
content = content.replace(
  `AAA Business Consultancy\r\n              </Typography>\r\n              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>\r\n                Spain Visa, Residency & Relocation Portal`,
  `AAA Technologies\r\n              </Typography>\r\n              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>\r\n                IT Services & Enterprise Software Portal`
);
content = content.replace(
  `AAA Business Consultancy\n              </Typography>\n              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>\n                Spain Visa, Residency & Relocation Portal`,
  `AAA Technologies\n              </Typography>\n              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>\n                IT Services & Enterprise Software Portal`
);

fs.writeFileSync(authLayoutPath, content, 'utf8');
console.log('✓ Successfully written updated AuthLayout.jsx');

