const fs = require('fs');
const path = require('path');

const dir = 'frontend/src/pages/consultations';
const files = fs.readdirSync(dir).map(f => path.join(dir, f));
const regex = /(spain|visa|relocation|residency|passport|golden\s*visa|passive income)/i;

files.forEach(f => {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (regex.test(l)) {
      console.log(f + ':' + (i+1) + ': ' + l.trim());
    }
  });
});

