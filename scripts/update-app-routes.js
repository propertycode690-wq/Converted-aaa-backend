const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/routes/AppRoutes.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add import
if (!content.includes('ReviewsDashboard')) {
  content = content.replace(
    "import Integrations from '../pages/integrations/Integrations';",
    "import Integrations from '../pages/integrations/Integrations';\r\nimport ReviewsDashboard from '../pages/reviews/ReviewsDashboard';"
  );
  if (!content.includes('ReviewsDashboard')) {
    content = content.replace(
      "import Integrations from '../pages/integrations/Integrations';",
      "import Integrations from '../pages/integrations/Integrations';\nimport ReviewsDashboard from '../pages/reviews/ReviewsDashboard';"
    );
  }
}

// 2. getMenuLabelForPath
if (!content.includes("if (p.includes('/reviews')) return 'Reviews';")) {
  content = content.replace(
    "if (p.includes('/integrations')) return 'Integrations';",
    "if (p.includes('/integrations')) return 'Integrations';\r\n  if (p.includes('/reviews')) return 'Reviews';"
  );
  if (!content.includes("if (p.includes('/reviews')) return 'Reviews';")) {
    content = content.replace(
      "if (p.includes('/integrations')) return 'Integrations';",
      "if (p.includes('/integrations')) return 'Integrations';\n  if (p.includes('/reviews')) return 'Reviews';"
    );
  }
}

// 3. getDynamicRedirectPath
if (!content.includes("else if (label === 'Reviews') path = '/reviews';")) {
  content = content.replace(
    "else if (label === 'Integrations') path = '/integrations';",
    "else if (label === 'Integrations') path = '/integrations';\r\n  else if (label === 'Reviews') path = '/reviews';"
  );
  if (!content.includes("else if (label === 'Reviews') path = '/reviews';")) {
    content = content.replace(
      "else if (label === 'Integrations') path = '/integrations';",
      "else if (label === 'Integrations') path = '/integrations';\n  else if (label === 'Reviews') path = '/reviews';"
    );
  }
}

if (!content.includes("if (label === 'Reviews') return '/reviews';")) {
  content = content.replace(
    "if (label === 'Integrations') return '/integrations';",
    "if (label === 'Integrations') return '/integrations';\r\n  if (label === 'Reviews') return '/reviews';"
  );
  if (!content.includes("if (label === 'Reviews') return '/reviews';")) {
    content = content.replace(
      "if (label === 'Integrations') return '/integrations';",
      "if (label === 'Integrations') return '/integrations';\n  if (label === 'Reviews') return '/reviews';"
    );
  }
}

// 4. Routes
if (!content.includes('path="/reviews"')) {
  const targetRoute = `        {/* Integrations (Admin, Super Admin) */}
        <Route
          path="/integrations"
          element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin', 'operations', 'consultant', 'finance', 'marketing']}>
              <Integrations />
            </ProtectedRoute>
          }
        />`;

  const newRoutes = `        {/* Integrations (Admin, Super Admin) */}
        <Route
          path="/integrations"
          element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin', 'operations', 'consultant', 'finance', 'marketing']}>
              <Integrations />
            </ProtectedRoute>
          }
        />

        {/* Reviews & Reputation (Super Admin, Admin, Operations, Marketing) */}
        <Route
          path="/reviews"
          element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin', 'operations', 'marketing']}>
              <ReviewsDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reviews"
          element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
              <ReviewsDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super_admin/reviews"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <ReviewsDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/operations/reviews"
          element={
            <ProtectedRoute allowedRoles={['operations', 'super_admin']}>
              <ReviewsDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketing-manager/reviews"
          element={
            <ProtectedRoute allowedRoles={['marketing', 'super_admin']}>
              <ReviewsDashboard />
            </ProtectedRoute>
          }
        />`;

  if (content.includes(targetRoute)) {
    content = content.replace(targetRoute, newRoutes);
  } else {
    // Try with normalized newlines
    const normalizedTarget = targetRoute.replace(/\r\n/g, '\n');
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const normalizedNewRoutes = newRoutes.replace(/\r\n/g, '\n');
    if (normalizedContent.includes(normalizedTarget)) {
      content = normalizedContent.replace(normalizedTarget, normalizedNewRoutes);
    }
  }
}

// 5. Role prefix fallback route
if (!content.includes('path="/:rolePrefix/reviews"')) {
  content = content.replace(
    '<Route path="/:rolePrefix/social-inbox" element={<ProtectedRoute><OperationsSocialInbox /></ProtectedRoute>} />',
    '<Route path="/:rolePrefix/social-inbox" element={<ProtectedRoute><OperationsSocialInbox /></ProtectedRoute>} />\r\n        <Route path="/:rolePrefix/reviews" element={<ProtectedRoute allowedRoles={[\'admin\', \'super_admin\', \'operations\', \'marketing\']}><ReviewsDashboard /></ProtectedRoute>} />'
  );
  if (!content.includes('path="/:rolePrefix/reviews"')) {
    content = content.replace(
      '<Route path="/:rolePrefix/social-inbox" element={<ProtectedRoute><OperationsSocialInbox /></ProtectedRoute>} />',
      '<Route path="/:rolePrefix/social-inbox" element={<ProtectedRoute><OperationsSocialInbox /></ProtectedRoute>} />\n        <Route path="/:rolePrefix/reviews" element={<ProtectedRoute allowedRoles={[\'admin\', \'super_admin\', \'operations\', \'marketing\']}><ReviewsDashboard /></ProtectedRoute>} />'
    );
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('AppRoutes.jsx updated successfully!');

