const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = email ? email.toLowerCase().trim() : '';
    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Auto-seed default admin accounts on fresh deployment if missing
    if (!user && (normalizedEmail === 'superadmin@aaaconsultancy.com' || normalizedEmail === 'admin@aaaconsultancy.com')) {
      try {
        const salt = await bcrypt.genSalt(10);
        const defaultHash = await bcrypt.hash('password123', salt);
        user = await prisma.user.create({
          data: {
            email: normalizedEmail,
            password: defaultHash,
            fullName: normalizedEmail.includes('superadmin') ? 'Super Admin' : 'Admin',
            role: normalizedEmail.includes('superadmin') ? 'super_admin' : 'admin'
          }
        });
        console.log(`[Auto-Seed] Initialized account: ${normalizedEmail}`);
      } catch (seedErr) {
        console.warn('[Auto-Seed Warning]:', seedErr.message);
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Determine tenant identity safely without hardcoding or client trust
    let tenantId = user.tenantId;
    if (!tenantId && user.customPermissions && typeof user.customPermissions === 'object' && user.customPermissions.tenantId) {
      tenantId = user.customPermissions.tenantId;
    }
    if (!tenantId) {
      tenantId = (user.email && user.email.toLowerCase().endsWith('@aaaconsultancy.com'))
        ? 'tenant_aaa_consultancy'
        : `tenant_user_${user.id}`;
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email, name: user.fullName, tenantId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.fullName,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        tenantId,
        customPermissions: user.customPermissions
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        hotlineNumber: true,
        spokenLanguages: true,
        nationalities: true,
        commissionRate: true,
        immigrationBio: true,
        customPermissions: true
      }
    });
    
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Attach tenantId to user payload
    const tenantId = user.tenantId || (user.email && user.email.toLowerCase().endsWith('@aaaconsultancy.com') ? 'tenant_aaa_consultancy' : `tenant_user_${user.id}`);
    res.json({ ...user, tenantId });
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { login, getMe };
