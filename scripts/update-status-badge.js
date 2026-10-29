const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/components/StatusBadge.jsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const target = `    const s = sStr.toLowerCase();
    switch (s) {`;

const replacement = `    const s = sStr.toLowerCase();
    switch (s) {
      // IT Sales Pipeline Stages
      case 'new inquiry':
      case 'new lead':
      case 'new':
        return { label: statusStr, color: 'info', icon: <span style={{ fontSize: '11px' }}>🆕</span>, bg: '#E0F2FE', text: '#0369A1' };
      case 'discovery scheduled':
        return { label: statusStr, color: 'primary', icon: <span style={{ fontSize: '11px' }}>📅</span>, bg: '#E0E7FF', text: '#3730A3' };
      case 'requirement analysis':
      case 'technical scoping':
        return { label: statusStr, color: 'secondary', icon: <span style={{ fontSize: '11px' }}>🔍</span>, bg: '#CFFAFE', text: '#0E7490' };
      case 'proposal sent':
      case 'proposal / sow sent':
        return { label: statusStr, color: 'primary', icon: <span style={{ fontSize: '11px' }}>📑</span>, bg: '#F3E8FF', text: '#7E22CE' };
      case 'negotiation':
      case 'in negotiation':
        return { label: statusStr, color: 'warning', icon: <span style={{ fontSize: '11px' }}>🤝</span>, bg: '#FEF3C7', text: '#B45309' };
      case 'deal won':
      case 'won':
        return { label: statusStr, color: 'success', icon: <span style={{ fontSize: '11px' }}>🏆</span>, bg: '#DCFCE7', text: '#15803D' };
      case 'deal lost':
      case 'lost':
        return { label: statusStr, color: 'error', icon: <span style={{ fontSize: '11px' }}>❌</span>, bg: '#FEE2E2', text: '#B91C1C' };`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('StatusBadge.jsx updated with IT sales pipeline stages.');
} else {
  console.log('Target still not found in StatusBadge.jsx');
}
