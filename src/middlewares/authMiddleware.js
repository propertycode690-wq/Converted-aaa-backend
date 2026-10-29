const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Authentication failed. No token provided.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.tenantId) {
      decoded.tenantId = (decoded.email && decoded.email.toLowerCase().endsWith('@aaaconsultancy.com'))
        ? 'tenant_aaa_consultancy'
        : `tenant_user_${decoded.id}`;
    }
    req.user = decoded; // { id, role, email, tenantId }
    
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Authentication failed. Invalid token.' });
  }
};

const rbacMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { authMiddleware, rbacMiddleware };
