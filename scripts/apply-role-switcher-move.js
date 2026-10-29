const fs = require('fs');
const path = require('path');

// 1. Update DashboardLayout.jsx
const layoutPath = path.join(__dirname, '../../frontend/src/layouts/DashboardLayout.jsx');
let layoutContent = fs.readFileSync(layoutPath, 'utf8');

// Target the Quick Role Switcher FormControl in DashboardLayout
const switcherRegex = /\{\/\*\s*Quick Role Switcher Dropdown[\s\S]*?<\/FormControl>/;
if (switcherRegex.test(layoutContent)) {
  layoutContent = layoutContent.replace(switcherRegex, '{/* Quick Role Switcher removed from header - available on Login page */}');
  fs.writeFileSync(layoutPath, layoutContent, 'utf8');
  console.log('✓ Successfully removed Quick Role Switcher from DashboardLayout.jsx');
} else {
  console.log('⚠ Quick Role Switcher not found in DashboardLayout.jsx (already removed?)');
}

// 2. Update Login.jsx
const loginPath = path.join(__dirname, '../../frontend/src/pages/auth/Login.jsx');
let loginContent = fs.readFileSync(loginPath, 'utf8');

// Check if QUICK_ROLES is already defined
if (!loginContent.includes('QUICK_ROLES')) {
  // Add loadingRole state & QUICK_ROLES definition
  const stateTarget = 'const [showPassword, setShowPassword] = React.useState(false);';
  const stateReplacement = `const [showPassword, setShowPassword] = React.useState(false);
  const [loadingRole, setLoadingRole] = React.useState(null);

  const QUICK_ROLES = [
    { id: 'super_admin', label: 'CEO 👑', email: 'superadmin@aaaconsultancy.com' },
    { id: 'admin', label: 'Manager 💼', email: 'admin@aaaconsultancy.com' },
    { id: 'operations', label: 'Ops ⚙️', email: 'operations@aaaconsultancy.com' },
    { id: 'marketing', label: 'Marketing 📣', email: 'marketing@aaaconsultancy.com' },
    { id: 'consultant', label: 'Agent 🧑‍💼', email: 'agent@aaaconsultancy.com' }
  ];`;
  loginContent = loginContent.replace(stateTarget, stateReplacement);

  // Update handleQuickLogin to manage loading state
  const oldQuickLoginRegex = /const handleQuickLogin = async \(role\) => \{[\s\S]*?showAlert\(msg, 'error'\);\s*\}\s*\};/;
  const newQuickLogin = `const handleQuickLogin = async (role) => {
    let email = 'admin@aaaconsultancy.com';
    if (role === 'super_admin') email = 'superadmin@aaaconsultancy.com';
    else if (role === 'marketing') email = 'marketing@aaaconsultancy.com';
    else if (role === 'consultant') email = 'agent@aaaconsultancy.com';
    else if (role === 'finance') email = 'finance@aaaconsultancy.com';
    else if (role === 'operations') email = 'operations@aaaconsultancy.com';

    setLoadingRole(role);
    try {
      const res = await dbService.authLogin(email, 'password123');
      if (res && res.token) {
        login(res.user, res.token);
        showAlert(\`Logged in successfully as \${res.user.role}\`, 'success');
        navigate('/dashboard');
        return;
      }
      showAlert('Login failed: unexpected server response.', 'error');
    } catch (err) {
      console.error('Quick login failed:', err);
      const msg = err?.response?.data?.message || 'Cannot connect to server. Please ensure the backend is running.';
      showAlert(msg, 'error');
    } finally {
      setLoadingRole(null);
    }
  };`;
  loginContent = loginContent.replace(oldQuickLoginRegex, newQuickLogin);

  // Add the Quick Role UI below the submit button
  const submitButtonTarget = `<Button type="submit" variant="contained" color="secondary" size="large" fullWidth disabled={isSubmitting}>
            {isSubmitting ? 'Logging in...' : 'Log In'}
          </Button>`;
  const submitButtonReplacement = `<Button type="submit" variant="contained" color="secondary" size="large" fullWidth disabled={isSubmitting || loadingRole !== null}>
            {isSubmitting ? 'Logging in...' : 'Log In'}
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
  loginContent = loginContent.replace(submitButtonTarget, submitButtonReplacement);

  fs.writeFileSync(loginPath, loginContent, 'utf8');
  console.log('✓ Successfully added Quick Demo Role Access chips to Login.jsx');
} else {
  console.log('⚠ Login.jsx already contains QUICK_ROLES');
}

