const fs = require('fs');
const path = require('path');

const loginPath = path.join(__dirname, '../../frontend/src/pages/auth/Login.jsx');
let loginContent = fs.readFileSync(loginPath, 'utf8');

const target = `{isSubmitting ? 'Logging in...' : 'Log In'}
          </Button>`;

const replacement = `{isSubmitting ? 'Logging in...' : 'Log In'}
          </Button>

          {/* Quick Demo Role Access */}
          <Divider sx={{ my: 1.5, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5 }}>
            QUICK ROLE ACCESS (DEMO)
          </Divider>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
            {QUICK_ROLES.map((r) => {
              const isLoading = loadingRole === r.id;
              return (
                <Chip
                  key={r.id}
                  label={isLoading ? 'Logging in...' : r.label}
                  onClick={() => !loadingRole && handleQuickLogin(r.id)}
                  clickable={!loadingRole}
                  disabled={loadingRole !== null && !isLoading}
                  variant="outlined"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    py: 2,
                    px: 0.5,
                    borderRadius: '16px',
                    cursor: loadingRole ? 'not-allowed' : 'pointer',
                    borderColor: 'secondary.main',
                    color: 'text.primary',
                    bgcolor: isLoading ? 'secondary.light' : 'background.paper',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: 'secondary.main',
                      color: '#ffffff',
                      borderColor: 'secondary.main',
                      transform: 'translateY(-1px)',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                    }
                  }}
                />
              );
            })}
          </Box>`;

if (loginContent.includes(target)) {
  loginContent = loginContent.replace(target, replacement);
  fs.writeFileSync(loginPath, loginContent, 'utf8');
  console.log('✓ Successfully injected Quick Demo Role Chips below Log In button in Login.jsx');
} else {
  console.log('Target not found, checking line endings...');
  const targetCRLF = target.replace(/\n/g, '\r\n');
  if (loginContent.includes(targetCRLF)) {
    const replacementCRLF = replacement.replace(/\n/g, '\r\n');
    loginContent = loginContent.replace(targetCRLF, replacementCRLF);
    fs.writeFileSync(loginPath, loginContent, 'utf8');
    console.log('✓ Successfully injected Quick Demo Role Chips (CRLF) in Login.jsx');
  } else {
    console.error('Target STILL not found');
  }
}

