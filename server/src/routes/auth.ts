import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { sendOTPEmail } from '../services/emailService.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Normalize phone number to international format
 * Handles Egyptian numbers specially: +2001032560826 -> +201032560826 (removes leading 0 after +20)
 * @param phone - Phone number in any format
 * @returns Normalized phone number in E.164 format or null if invalid
 */
function normalizePhoneNumber(phone: string): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Remove all spaces, dashes, and parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // If already in international format with +
  if (cleaned.startsWith('+')) {
    // Special handling for Egypt: +2001032560826 -> +201032560826
    if (cleaned.startsWith('+20')) {
      const afterCode = cleaned.substring(3); // Get number after +20
      // If starts with 0, remove it (Egyptian numbers: +2001032560826 -> +201032560826)
      if (afterCode.startsWith('0') && afterCode.length >= 10) {
        const withoutZero = afterCode.substring(1);
        // Validate it's a valid Egyptian mobile number (starts with 1, 2, or 5)
        if (withoutZero.startsWith('1') || withoutZero.startsWith('2') || withoutZero.startsWith('5')) {
          return `+20${withoutZero}`;
        }
      }
      // If already correct format (+201032560826), return as is
      return cleaned;
    }
    // For other countries, return as is
    return cleaned;
  }

  // If starts with 00, replace with +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
    // Apply Egypt normalization if needed
    if (cleaned.startsWith('+20')) {
      const afterCode = cleaned.substring(3);
      if (afterCode.startsWith('0') && afterCode.length >= 10) {
        const withoutZero = afterCode.substring(1);
        if (withoutZero.startsWith('1') || withoutZero.startsWith('2') || withoutZero.startsWith('5')) {
          return `+20${withoutZero}`;
        }
      }
    }
    return cleaned;
  }

  // Egyptian numbers: 01XXXXXXXX (11 digits) -> +201XXXXXXXX
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    const withoutZero = cleaned.substring(1);
    if (withoutZero.startsWith('1') || withoutZero.startsWith('2') || withoutZero.startsWith('5')) {
      return `+20${withoutZero}`;
    }
  }

  // If starts with 20 (country code without +), add +
  if (cleaned.startsWith('20') && cleaned.length >= 12) {
    // Check if it has leading 0 after 20 (2001032560826 -> 201032560826)
    const afterCode = cleaned.substring(2);
    if (afterCode.startsWith('0') && afterCode.length >= 10) {
      const withoutZero = afterCode.substring(1);
      if (withoutZero.startsWith('1') || withoutZero.startsWith('2') || withoutZero.startsWith('5')) {
        return `+20${withoutZero}`;
      }
    }
    return `+${cleaned}`;
  }

  // If it's 10 digits starting with 1, 2, or 5 (Egyptian mobile without 0), add +20
  if (cleaned.length === 10 && (cleaned.startsWith('1') || cleaned.startsWith('2') || cleaned.startsWith('5'))) {
    return `+20${cleaned}`;
  }

  // Return null if we can't determine the format
  return null;
}

// Sign in
router.post('/signin', async (req, res) => {
  try {
    const { email, password, username, forCustomer } = req.body;

    if (!email && !username) {
      return res.status(400).json({ error: 'Email or username is required' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Find user by email or username
    let sql = 'SELECT * FROM users WHERE ';
    const params: any[] = [];
    
    if (email) {
      sql += '(email = $1 OR username = $1)';
      params.push(email);
    } else {
      sql += 'username = $1';
      params.push(username);
    }

    const userResult = await query(sql, params);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Check if user account is active
    if (user.is_active === false) {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact support.' });
    }

    // SECURITY: Validate role-based access BEFORE password check
    // This prevents information leakage about valid user accounts
    if (forCustomer === true) {
      // Customer login - only allow customers
      if (user.role !== 'customer') {
        console.warn('[Auth] Security: Non-customer attempted customer login', { email: email || username, role: user.role, userId: user.id });
        return res.status(403).json({ error: 'Access denied. This login page is for customers only.' });
      }
    } else {
      // Admin/Service Provider/Employee login - block customers
      if (user.role === 'customer') {
        console.warn('[Auth] Security: Customer attempted admin/employee login', { email: email || username, role: user.role, userId: user.id });
        return res.status(403).json({ error: 'Access denied. Customers cannot login through this page. Please use the customer login page.' });
      }
    }

    // Check password - first check if there's a password_hash column
    // If not, we'll need to add it to the users table
    let passwordMatch = false;
    
    if (user.password_hash) {
      passwordMatch = await bcrypt.compare(password, user.password_hash);
    } else if (user.password) {
      // Fallback for existing passwords (should be migrated)
      passwordMatch = await bcrypt.compare(password, user.password);
    } else {
      // If no password field exists, we need to add it
      return res.status(401).json({ error: 'Password authentication not configured' });
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get tenant if exists
    let tenant = null;
    if (user.tenant_id) {
      const tenantResult = await query('SELECT * FROM tenants WHERE id = $1', [user.tenant_id]);
      tenant = tenantResult.rows[0] || null;
      
      // Check if tenant account is active (for tenant-based roles)
      if (tenant && (user.role === 'tenant_admin' || user.role === 'receptionist' || user.role === 'cashier')) {
        if (tenant.is_active === false) {
          return res.status(403).json({ error: 'This service provider account has been deactivated. Please contact support.' });
        }
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        tenant_id: user.tenant_id 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return full user object (excluding password_hash)
    const { password_hash, ...userWithoutPassword } = user;
    
    res.json({
      user: userWithoutPassword,
      tenant,
      session: {
        access_token: token,
        user: {
          id: user.id,
          email: user.email,
        },
      },
    });
  } catch (error: any) {
    console.error('Sign in error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, username, full_name, role, tenant_id, phone } = req.body;

    if (!email && !username) {
      return res.status(400).json({ error: 'Email or username is required' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // full_name is required by the database schema
    if (!full_name || full_name.trim() === '') {
      return res.status(400).json({ error: 'Full name is required' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user - use gen_random_uuid() from PostgreSQL
    const sql = `
      INSERT INTO users (id, email, username, full_name, role, tenant_id, password_hash, phone, is_active)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const result = await query(sql, [
      email || null,
      username || null,
      full_name.trim(), // Ensure it's not empty
      role || 'employee',
      tenant_id || null,
      hashedPassword,
      phone || null,
      true, // is_active
    ]);

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        tenant_id: user.tenant_id 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
      },
      session: {
        access_token: token,
        user: {
          id: user.id,
          email: user.email,
        },
      },
    });
  } catch (error: any) {
    console.error('Sign up error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sign out
router.post('/signout', async (req, res) => {
  res.json({ message: 'Signed out successfully' });
});

// Get current user
router.get('/user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const result = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify token (even if expired, we can refresh it)
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (error: any) {
      // If token is expired, try to decode without verification to get user info
      if (error.name === 'TokenExpiredError') {
        decoded = jwt.decode(token) as any;
        if (!decoded) {
          return res.status(401).json({ error: 'Invalid token' });
        }
      } else {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    // Verify user still exists and is active
    const userResult = await query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.id]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    const user = userResult.rows[0];

    // Generate new token
    const newToken = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        tenant_id: user.tenant_id 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      access_token: newToken,
      expires_in: 7 * 24 * 60 * 60, // 7 days in seconds
    });
  } catch (error: any) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Validate session endpoint
router.get('/validate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ valid: false, error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      // Verify user still exists and is active
      const userResult = await query('SELECT id, email, role, tenant_id, is_active FROM users WHERE id = $1', [decoded.id]);
      
      if (userResult.rows.length === 0) {
        return res.status(401).json({ valid: false, error: 'User not found' });
      }

      const user = userResult.rows[0];
      
      if (!user.is_active) {
        return res.status(401).json({ valid: false, error: 'User is inactive' });
      }

      res.json({ 
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenant_id: user.tenant_id,
        }
      });
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ valid: false, error: 'Token expired', expired: true });
      }
      return res.status(401).json({ valid: false, error: 'Invalid token' });
    }
  } catch (error: any) {
    console.error('Validate session error:', error);
    res.status(500).json({ valid: false, error: error.message || 'Internal server error' });
  }
});

// Update user
router.post('/update', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { password } = req.body;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, decoded.id]);
    }

    res.json({ message: 'User updated successfully' });
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper functions for masking
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function maskPhone(phone: string): string {
  if (!phone) return phone;
  const clean = phone.replace(/\s/g, '');
  if (clean.startsWith('+')) {
    if (clean.length <= 12) {
      return `${clean.substring(0, 3)}***${clean.substring(clean.length - 4)}`;
    }
    return `${clean.substring(0, 4)}***${clean.substring(clean.length - 5)}`;
  }
  if (clean.length <= 8) {
    return `${clean.substring(0, 2)}***${clean.substring(clean.length - 2)}`;
  }
  return `${clean.substring(0, 3)}***${clean.substring(clean.length - 4)}`;
}

// Lookup user by username, email, or phone and return masked contact info
router.post('/forgot-password/lookup', async (req, res) => {
  try {
    const { identifier, tenant_id } = req.body;

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ error: 'Username, email, or phone number is required' });
    }

    const trimmedIdentifier = identifier.trim();
    
    // Detect identifier type
    let identifierType: 'email' | 'phone' | 'username' = 'username';
    if (trimmedIdentifier.includes('@')) {
      identifierType = 'email';
    } else if (/^\+?[\d\s-]+$/.test(trimmedIdentifier.replace(/\s/g, ''))) {
      identifierType = 'phone';
    }

    // Find user by detected identifier type
    let userResult;
    if (tenant_id) {
      if (identifierType === 'email') {
        userResult = await query(
          `SELECT id, email, phone, full_name, tenant_id, username 
           FROM users 
           WHERE email = $1 AND tenant_id = $2 AND is_active = true`,
          [trimmedIdentifier, tenant_id]
        );
      } else if (identifierType === 'phone') {
        // Normalize phone number for search
        const normalizedPhone = trimmedIdentifier.replace(/^\+/, '').replace(/\s/g, '');
        const phoneWithPlus = `+${normalizedPhone}`;
        userResult = await query(
          `SELECT id, email, phone, full_name, tenant_id, username 
           FROM users 
           WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
           AND tenant_id = $4 AND is_active = true`,
          [trimmedIdentifier, phoneWithPlus, normalizedPhone, tenant_id]
        );
      } else {
        // Username
        userResult = await query(
          `SELECT id, email, phone, full_name, tenant_id, username 
           FROM users 
           WHERE username = $1 AND tenant_id = $2 AND is_active = true`,
          [trimmedIdentifier, tenant_id]
        );
      }
    } else {
      if (identifierType === 'email') {
        userResult = await query(
          `SELECT id, email, phone, full_name, tenant_id, username 
           FROM users 
           WHERE email = $1 AND is_active = true`,
          [trimmedIdentifier]
        );
      } else if (identifierType === 'phone') {
        // Normalize phone number for search
        const normalizedPhone = trimmedIdentifier.replace(/^\+/, '').replace(/\s/g, '');
        const phoneWithPlus = `+${normalizedPhone}`;
        userResult = await query(
          `SELECT id, email, phone, full_name, tenant_id, username 
           FROM users 
           WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
           AND is_active = true`,
          [trimmedIdentifier, phoneWithPlus, normalizedPhone]
        );
      } else {
        // Username
        userResult = await query(
          `SELECT id, email, phone, full_name, tenant_id, username 
           FROM users 
           WHERE username = $1 AND is_active = true`,
          [trimmedIdentifier]
        );
      }
    }

    // Always return success (security: don't reveal if user exists)
    if (userResult.rows.length === 0) {
      return res.json({ 
        success: true,
        found: false,
        message: 'If the account exists, you will see your contact information.' 
      });
    }

    const user = userResult.rows[0];

    // Determine display order based on search type
    // If searched by email, show email first; if by phone, show phone first
    const displayOrder = identifierType === 'email' ? ['email', 'phone'] : 
                        identifierType === 'phone' ? ['phone', 'email'] : 
                        ['email', 'phone']; // Default: email first for username

    // Return masked data
    return res.json({
      success: true,
      found: true,
      data: {
        maskedEmail: user.email ? maskEmail(user.email) : null,
        maskedPhone: user.phone ? maskPhone(user.phone) : null,
        hasEmail: !!user.email,
        hasPhone: !!user.phone,
        displayOrder, // Order to display options
        searchType: identifierType, // Type of identifier used for search
        // Include actual values for backend use (will be used internally)
        _email: user.email,
        _phone: user.phone,
        _userId: user.id,
        _tenantId: user.tenant_id,
        _username: user.username,
      }
    });
  } catch (error: any) {
    console.error('Lookup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request OTP for password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { identifier, username, email, phone, method = 'email', tenant_id, language = 'en' } = req.body;
    
    console.log('\n📧 ============================================');
    console.log('📧 Forgot Password Request Received');
    console.log('📧 ============================================');
    console.log('   Method:', method);
    console.log('   Identifier:', identifier || username || email || phone);
    console.log('   Tenant ID:', tenant_id);
    console.log('   Language:', language);
    console.log('============================================\n');

    // New flow: support identifier-based lookup (username, email, or phone)
    let userEmail: string | null = email || null;
    let userPhone: string | null = phone || null;
    let userId: string | null = null;
    let userTenantId: string | null = null;
    let searchIdentifier = identifier || username || email || phone;

    // If identifier is provided, lookup user and get their contact info
    if (searchIdentifier) {
      const trimmedIdentifier = searchIdentifier.trim();
      
      // Detect identifier type
      let identifierType: 'email' | 'phone' | 'username' = 'username';
      if (trimmedIdentifier.includes('@')) {
        identifierType = 'email';
      } else if (/^\+?[\d\s-]+$/.test(trimmedIdentifier.replace(/\s/g, ''))) {
        identifierType = 'phone';
      }

      let userResult;
      if (tenant_id) {
        if (identifierType === 'email') {
          userResult = await query(
            `SELECT id, email, phone, tenant_id 
             FROM users 
             WHERE email = $1 AND tenant_id = $2 AND is_active = true`,
            [trimmedIdentifier, tenant_id]
          );
        } else if (identifierType === 'phone') {
          const normalizedPhone = trimmedIdentifier.replace(/^\+/, '').replace(/\s/g, '');
          const phoneWithPlus = `+${normalizedPhone}`;
          userResult = await query(
            `SELECT id, email, phone, tenant_id 
             FROM users 
             WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
             AND tenant_id = $4 AND is_active = true`,
            [trimmedIdentifier, phoneWithPlus, normalizedPhone, tenant_id]
          );
        } else {
          userResult = await query(
            `SELECT id, email, phone, tenant_id 
             FROM users 
             WHERE username = $1 AND tenant_id = $2 AND is_active = true`,
            [trimmedIdentifier, tenant_id]
          );
        }
      } else {
        if (identifierType === 'email') {
          userResult = await query(
            `SELECT id, email, phone, tenant_id 
             FROM users 
             WHERE email = $1 AND is_active = true`,
            [trimmedIdentifier]
          );
        } else if (identifierType === 'phone') {
          const normalizedPhone = trimmedIdentifier.replace(/^\+/, '').replace(/\s/g, '');
          const phoneWithPlus = `+${normalizedPhone}`;
          userResult = await query(
            `SELECT id, email, phone, tenant_id 
             FROM users 
             WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
             AND is_active = true`,
            [trimmedIdentifier, phoneWithPlus, normalizedPhone]
          );
        } else {
          userResult = await query(
            `SELECT id, email, phone, tenant_id 
             FROM users 
             WHERE username = $1 AND is_active = true`,
            [trimmedIdentifier]
          );
        }
      }

      if (userResult.rows.length === 0) {
        // Always return success (security: don't reveal if user exists)
        return res.json({ 
          success: true, 
          message: 'If the account exists, an OTP has been sent.' 
        });
      }

      const user = userResult.rows[0];
      userEmail = user.email;
      userPhone = user.phone;
      userId = user.id;
      userTenantId = user.tenant_id;

      console.log(`\n👤 User found: ${user.id}`);
      console.log(`   Email: ${userEmail || 'not set'}`);
      console.log(`   Phone: ${userPhone || 'not set'}`);
      console.log(`   User tenant_id: ${userTenantId || 'NOT SET ❌'}`);
      console.log(`   Request tenant_id: ${tenant_id || 'not provided'}`);

      // Priority: 1. User's tenant_id, 2. Request tenant_id, 3. Find tenant with SMTP
      if (!userTenantId && tenant_id) {
        console.log(`⚠️  User ${user.id} doesn't have tenant_id, using tenant_id from request: ${tenant_id}`);
        userTenantId = tenant_id;
      }

      // If still no tenant_id, try to find any tenant with SMTP configured (as a fallback)
      if (!userTenantId) {
        console.log(`⚠️  No tenant_id found for user ${user.id}, attempting to find tenant with SMTP configured...`);
        // Try to find any tenant that has SMTP configured (as a fallback)
        const tenantWithSmtp = await query(
          `SELECT id, name FROM tenants 
           WHERE smtp_settings IS NOT NULL 
           AND smtp_settings->>'smtp_user' IS NOT NULL 
           AND smtp_settings->>'smtp_password' IS NOT NULL 
           AND is_active = true 
           ORDER BY created_at ASC 
           LIMIT 1`
        );
        
        if (tenantWithSmtp.rows.length > 0) {
          userTenantId = tenantWithSmtp.rows[0].id;
          console.log(`✅ Using fallback tenant: ${tenantWithSmtp.rows[0].name} (${userTenantId}) with SMTP configured`);
        } else {
          console.error(`❌ No tenant with SMTP configured found as fallback`);
        }
      }

      console.log(`   Final tenant_id: ${userTenantId || 'STILL MISSING ❌'}\n`);

      // Validate that the requested method is available
      if (method === 'email' && !userEmail) {
        return res.status(400).json({ 
          error: 'Email not found for this account. Please use WhatsApp method instead.' 
        });
      }
      if (method === 'whatsapp' && !userPhone) {
        return res.status(400).json({ 
          error: 'Phone number not found for this account. Please use email method instead.' 
        });
      }
    }

    // Validate input (for backward compatibility with direct email/phone)
    if (!searchIdentifier && !userEmail && !userPhone) {
      return res.status(400).json({ error: 'Username, email, or phone number is required' });
    }

    if (method && !['email', 'whatsapp'].includes(method)) {
      return res.status(400).json({ error: 'Method must be either "email" or "whatsapp"' });
    }

    const contactIdentifier = userEmail || userPhone;
    const isEmail = !!userEmail;

    // Find user by email or phone (if not already found via username)
    let userResult;
    if (userId) {
      // User already found via username lookup
      userResult = await query(
        'SELECT id, email, phone, full_name, tenant_id FROM users WHERE id = $1 AND is_active = true',
        [userId]
      );
    } else if (isEmail) {
      userResult = await query(
        'SELECT id, email, phone, full_name, tenant_id FROM users WHERE email = $1 AND is_active = true',
        [userEmail]
      );
    } else {
      // Normalize phone number for search (remove + and spaces)
      const normalizedPhone = userPhone.replace(/^\+/, '').replace(/\s/g, '');
      const phoneWithPlus = `+${normalizedPhone}`;
      
      // Search with both formats (with + and without +)
      userResult = await query(
        `SELECT id, email, phone, full_name, tenant_id 
         FROM users 
         WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
         AND is_active = true`,
        [userPhone, phoneWithPlus, normalizedPhone]
      );
    }

    // Always return success (security: don't reveal if user exists)
    if (userResult.rows.length === 0) {
      console.log(`⚠️  User not found for ${searchIdentifier ? 'identifier' : (isEmail ? 'email' : 'phone')}: ${searchIdentifier || contactIdentifier}`);
      return res.json({ 
        success: true, 
        message: 'If the ' + (username ? 'username' : (isEmail ? 'email' : 'phone number')) + ' exists, an OTP has been sent.' 
      });
    }

    const user = userResult.rows[0];
    console.log(`✅ User found: ${user.email || user.phone}, Method: ${method}`);
    
    // Use tenant_id from user if not provided
    const finalTenantId = userTenantId || tenant_id || user.tenant_id;

    // For WhatsApp, we need phone number
    if (method === 'whatsapp' && !user.phone && !phone) {
      console.error(`❌ WhatsApp method selected but no phone number available. User phone: ${user.phone}, Request phone: ${phone}`);
      return res.status(400).json({ 
        error: 'Phone number not found for this account. Please use email method instead.' 
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Get tenant WhatsApp settings if method is WhatsApp
    let whatsappConfig: any = null;
    if (method === 'whatsapp') {
      const tenantId = finalTenantId;
      if (tenantId) {
        try {
          const tenantResult = await query(
            'SELECT whatsapp_settings FROM tenants WHERE id = $1',
            [tenantId]
          );
          if (tenantResult.rows.length > 0 && tenantResult.rows[0].whatsapp_settings) {
            const settings = tenantResult.rows[0].whatsapp_settings;
            console.log(`\n📱 ============================================`);
            console.log(`📱 Loading WhatsApp Config from Database`);
            console.log(`📱 ============================================`);
            console.log(`   Raw settings:`, JSON.stringify(settings, null, 2));
            
            // Convert snake_case from database to camelCase for whatsappService
            whatsappConfig = {
              provider: settings.provider,
              apiUrl: settings.api_url,
              apiKey: settings.api_key,
              phoneNumberId: settings.phone_number_id,
              accessToken: settings.access_token,
              accountSid: settings.account_sid,
              authToken: settings.auth_token,
              from: settings.from,
            };
            
            console.log(`   Converted config:`, {
              provider: whatsappConfig.provider,
              phoneNumberId: whatsappConfig.phoneNumberId ? 'SET ✅' : 'NOT SET ❌',
              accessToken: whatsappConfig.accessToken ? 'SET ✅' : 'NOT SET ❌',
            });
            console.log(`============================================\n`);
            
            // Ensure provider is set
            if (!whatsappConfig.provider) {
              console.warn('⚠️  WhatsApp settings found but provider not set');
              whatsappConfig = null;
            } else if (!whatsappConfig.accessToken && whatsappConfig.provider === 'meta') {
              console.warn('⚠️  WhatsApp settings found but access_token not set for Meta provider');
              whatsappConfig = null;
            } else {
              console.log(`✅ Using tenant WhatsApp config from database: provider=${whatsappConfig.provider}`);
            }
          }
        } catch (err: any) {
          // If column doesn't exist, that's okay - we'll use default config or fallback to email
          if (err.message?.includes('column') && err.message?.includes('whatsapp_settings')) {
            console.warn('⚠️  whatsapp_settings column may not exist. Please run migration: 20251201000000_add_whatsapp_settings_to_tenants.sql');
          } else {
            console.warn('Could not fetch tenant WhatsApp settings:', err.message);
          }
        }
      }
    }

    // Delete any existing OTPs
    try {
      if (isEmail) {
        // Try with purpose column first, fallback if it doesn't exist
        try {
          await query(
            'DELETE FROM otp_requests WHERE email = $1 AND purpose = $2',
            [userEmail, 'password_reset']
          );
        } catch (purposeErr: any) {
          if (purposeErr.message?.includes('column') && purposeErr.message?.includes('purpose')) {
            console.warn('⚠️  purpose column does not exist. Deleting without purpose filter.');
            await query(
              'DELETE FROM otp_requests WHERE email = $1',
              [userEmail]
            );
          } else {
            throw purposeErr;
          }
        }
      } else {
        // Try with purpose column first, fallback if it doesn't exist
        try {
          await query(
            'DELETE FROM otp_requests WHERE phone = $1 AND purpose = $2',
            [userPhone, 'password_reset']
          );
        } catch (purposeErr: any) {
          if (purposeErr.message?.includes('column') && purposeErr.message?.includes('purpose')) {
            console.warn('⚠️  purpose column does not exist. Deleting without purpose filter.');
            await query(
              'DELETE FROM otp_requests WHERE phone = $1',
              [userPhone]
            );
          } else {
            throw purposeErr;
          }
        }
      }
    } catch (deleteErr: any) {
      // If email column doesn't exist yet, try without email filter
      if (deleteErr.message?.includes('column') && deleteErr.message?.includes('email')) {
        console.warn('⚠️  email column may not exist in otp_requests. Please run migration: 20251203000000_add_email_otp_support.sql');
        try {
          await query(
            'DELETE FROM otp_requests WHERE phone = $1',
            [identifier]
          );
        } catch (phoneErr) {
          // Ignore - continue anyway
        }
      } else {
        throw deleteErr;
      }
    }

    // Store OTP in database
    try {
      if (isEmail) {
        await query(
          `INSERT INTO otp_requests (email, otp_code, expires_at, purpose, verified)
           VALUES ($1, $2, $3, $4, false)`,
          [userEmail, otp, expiresAt, 'password_reset']
        );
      } else {
        // Normalize phone number before saving (ensure consistent format)
        // Remove spaces and ensure it starts with +
        const normalizedPhoneForSave = userPhone.trim().replace(/\s/g, '');
        const phoneToSave = normalizedPhoneForSave.startsWith('+') 
          ? normalizedPhoneForSave 
          : `+${normalizedPhoneForSave}`;
        
        await query(
          `INSERT INTO otp_requests (phone, otp_code, expires_at, purpose, verified)
           VALUES ($1, $2, $3, $4, false)`,
          [phoneToSave, otp, expiresAt, 'password_reset']
        );
      }
    } catch (insertErr: any) {
      // If email column doesn't exist, log error and suggest migration
      if (insertErr.message?.includes('column') && insertErr.message?.includes('email')) {
        console.error('❌ email column does not exist in otp_requests table');
        console.error('   Please run migration: 20251201000002_add_email_to_otp_requests.sql');
        console.error('   This migration adds the email column to support email-based OTPs');
        throw new Error('Database schema error: email column missing. Please run the migration.');
      } else {
        throw insertErr;
      }
    }

    // Log OTP in development mode
    if (process.env.NODE_ENV !== 'production') {
      const logIdentifier = contactIdentifier || searchIdentifier || userEmail || userPhone || 'unknown';
      console.log('\n📧 ============================================');
      console.log(`📧 OTP FOR ${logIdentifier.toUpperCase()} (${method.toUpperCase()})`);
      console.log(`📧 CODE: ${otp}`);
      console.log(`📧 Expires at: ${expiresAt.toISOString()}`);
      console.log('📧 ============================================\n');
    }

    // Send OTP via selected method
    if (method === 'whatsapp') {
      try {
        const { sendOTPWhatsApp } = await import('../services/whatsappService.js');
        
        // If no tenant config, sendOTPWhatsApp will use default config or return error
        // Use language from request, default to 'en'
        const otpLanguage = (language === 'ar' ? 'ar' : 'en') as 'en' | 'ar';
        
        // Use the phone number from user record
        // If username was used, user.phone is already set correctly
        let phoneToUse = userPhone || user.phone;
        
        if (!phoneToUse) {
          console.error(`❌ No phone number available for WhatsApp. Request phone: ${phone}, User phone: ${user.phone}`);
          throw new Error('Phone number is required for WhatsApp method');
        }
        
        // If phone is already in international format (+20...), use it directly from DB
        if (phoneToUse.startsWith('+')) {
          console.log(`   ✅ Using phone number directly from DB (international format): ${phoneToUse}`);
        } else {
          // Phone is not in international format, try to convert it
          // This is a fallback - ideally all phones should be stored with + and country code
          console.log(`   ⚠️  Phone number not in international format: ${phoneToUse}`);
          console.log(`   ⚠️  Converting to international format...`);
          
          // Egyptian numbers: 01XXXXXXXX (11 digits) -> +201XXXXXXXX
          if (phoneToUse.startsWith('0') && phoneToUse.length === 11) {
            const withoutZero = phoneToUse.substring(1);
            if (withoutZero.startsWith('1') || withoutZero.startsWith('2') || withoutZero.startsWith('5')) {
              phoneToUse = `+20${withoutZero}`;
              console.log(`   ✅ Converted to international format: ${phoneToUse}`);
            } else {
              phoneToUse = `+20${withoutZero}`;
              console.log(`   ⚠️  Using +20 as default country code: ${phoneToUse}`);
            }
          } else if (phoneToUse.startsWith('20') && phoneToUse.length >= 12) {
            // Starts with 20 but no +
            phoneToUse = `+${phoneToUse}`;
            console.log(`   ✅ Added + prefix: ${phoneToUse}`);
          } else if (phoneToUse.length === 10 && (phoneToUse.startsWith('1') || phoneToUse.startsWith('2') || phoneToUse.startsWith('5'))) {
            // 10 digits starting with 1, 2, or 5 (Egyptian mobile without 0)
            phoneToUse = `+20${phoneToUse}`;
            console.log(`   ✅ Added +20 country code: ${phoneToUse}`);
          } else {
            console.error(`   ❌ Cannot convert phone number format: ${phoneToUse}`);
            console.error(`   Please update phone number in database to international format (+20XXXXXXXXXX)`);
            throw new Error(`Invalid phone number format: ${phoneToUse}. Phone must be in international format (+20XXXXXXXXXX)`);
          }
        }
        
        console.log(`\n📱 ============================================`);
        console.log(`📱 Sending WhatsApp OTP`);
        console.log(`📱 ============================================`);
        console.log(`   Phone to use: ${phoneToUse}`);
        console.log(`   OTP: ${otp}`);
        console.log(`   Language: ${otpLanguage}`);
        console.log(`   WhatsApp Config: ${whatsappConfig ? 'Tenant-specific ✅' : 'Default (from .env)'}`);
        if (whatsappConfig) {
          console.log(`   Provider: ${whatsappConfig.provider}`);
          console.log(`   Phone Number ID: ${whatsappConfig.phoneNumberId || 'NOT SET'}`);
          console.log(`   Access Token: ${whatsappConfig.accessToken ? 'SET ✅' : 'NOT SET ❌'}`);
        } else {
          console.log(`   ⚠️  WhatsApp config not found in database`);
          console.log(`   Please configure WhatsApp settings in tenant settings page`);
        }
        console.log(`============================================\n`);
        
        if (!whatsappConfig) {
          throw new Error('WhatsApp settings not configured in database. Please configure WhatsApp settings in tenant settings.');
        }
        const result = await sendOTPWhatsApp(phoneToUse, otp, otpLanguage, whatsappConfig);
        
        if (result.success) {
          console.log(`✅ OTP WhatsApp sent successfully to ${phoneToUse}`);
          // Continue to send success response at the end
        } else {
          console.error(`❌ Failed to send OTP WhatsApp to ${phoneToUse}:`, result.error);
          
          // Check if it's an access token error
          const isTokenError = result.error?.includes('access token') || 
                              result.error?.includes('invalid') || 
                              result.error?.includes('expired') ||
                              result.error?.includes('session is invalid') ||
                              result.error?.includes('user logged out');
          
          if (isTokenError) {
            console.error(`\n⚠️  WhatsApp Access Token Issue Detected`);
            console.error(`   The access token needs to be refreshed.`);
            console.error(`   Falling back to email automatically...\n`);
            
            // Fallback to email if WhatsApp fails due to token error
            if (user.email) {
              console.log(`📧 Falling back to email for ${user.email}`);
              const emailOtpLanguage = (language === 'ar' ? 'ar' : 'en') as 'en' | 'ar';
              const emailResult = await sendOTPEmail(user.email, otp, user.tenant_id || tenant_id || '', emailOtpLanguage).catch(() => ({ success: false }));
              if (emailResult.success) {
                console.log(`✅ OTP email sent successfully as fallback`);
                // Continue to send success response at the end (OTP was sent via email)
              } else {
                // If email also fails, return error
                return res.status(500).json({ 
                  error: 'Failed to send OTP. Please try again later or contact support.',
                  details: 'Both WhatsApp and email delivery failed.'
                });
              }
            } else {
              // No email available, return error
              return res.status(500).json({ 
                error: 'WhatsApp service is currently unavailable and no email is available. Please contact support.',
                details: 'WhatsApp access token needs to be refreshed.'
              });
            }
          } else {
            // For other errors (not token-related), try email fallback
            console.error(`   WhatsApp sending failed. Trying email fallback...`);
            if (user.email) {
              console.log(`📧 Falling back to email for ${user.email}`);
              const emailOtpLanguage = (language === 'ar' ? 'ar' : 'en') as 'en' | 'ar';
              const emailResult = await sendOTPEmail(user.email, otp, user.tenant_id || tenant_id || '', emailOtpLanguage).catch(() => ({ success: false }));
              if (emailResult.success) {
                console.log(`✅ OTP email sent successfully as fallback`);
                // Continue to send success response at the end (OTP was sent via email)
              } else {
                return res.status(500).json({ 
                  error: 'Failed to send OTP. Please try again later or contact support.',
                  details: result.error
                });
              }
            } else {
              return res.status(500).json({ 
                error: 'Failed to send OTP via WhatsApp. Please try again later or contact support.',
                details: result.error
              });
            }
          }
        }
      } catch (importErr: any) {
        console.error('❌ Failed to import or send WhatsApp OTP:', importErr);
        console.error('   Error details:', importErr.message);
        console.error('   Stack:', importErr.stack);
        
        // Try email fallback if WhatsApp import fails
        if (user.email) {
          console.log(`📧 Falling back to email for ${user.email}`);
          const emailOtpLanguage = (language === 'ar' ? 'ar' : 'en') as 'en' | 'ar';
          const emailResult = await sendOTPEmail(user.email, otp, emailOtpLanguage).catch(() => ({ success: false }));
          if (emailResult.success) {
            console.log(`✅ OTP email sent successfully as fallback`);
            // Continue to send success response at the end (OTP was sent via email)
          } else {
            return res.status(500).json({ 
              error: 'Failed to send OTP. Please try again later or contact support.',
              details: 'Both WhatsApp and email delivery failed.'
            });
          }
        } else {
          return res.status(500).json({ 
            error: 'WhatsApp service is currently unavailable and no email is available. Please contact support.',
            details: 'Failed to initialize WhatsApp service.'
          });
        }
      }
    } else {
      // Send email (don't await - send in background)
      const otpLanguage = (language === 'ar' ? 'ar' : 'en') as 'en' | 'ar';
      const finalTenantId = userTenantId || tenant_id;
      
      if (!finalTenantId) {
        console.error(`❌ Cannot send OTP email: tenant_id is missing`);
        console.error(`   User tenant_id: ${userTenantId || 'not set'}`);
        console.error(`   Request tenant_id: ${tenant_id || 'not set'}`);
        console.error(`   Email: ${user.email || email}`);
        console.error(`   OTP: ${otp} (stored in database)`);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`⚠️  OTP is still stored in database. Check console above for the code.`);
        }
      } else {
        console.log(`📧 Sending OTP email to ${user.email || email} for tenant ${finalTenantId}`);
        sendOTPEmail(user.email || email, otp, finalTenantId, otpLanguage).then(result => {
        if (result.success) {
          console.log(`✅ OTP email sent to ${user.email || email}`);
        } else {
          console.error(`❌ Failed to send OTP email to ${user.email || email}:`, result.error);
          if (process.env.NODE_ENV !== 'production') {
            console.log(`⚠️  OTP is still stored in database. Check console above for the code.`);
          }
        }
      }).catch(err => {
        console.error('❌ Failed to send OTP email:', err);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`⚠️  OTP is still stored in database. Check console above for the code.`);
        }
      });
      }
    }

    res.json({ 
      success: true, 
      message: `If the ${isEmail ? 'email' : 'phone number'} exists, an OTP has been sent via ${method}.` 
    });
  } catch (error: any) {
    console.error('❌ Forgot password error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    // Provide more helpful error messages
    let errorMessage = 'Internal server error';
    if (error.message?.includes('column') && error.message?.includes('email')) {
      errorMessage = 'Database migration not applied. Please run: 20251203000000_add_email_otp_support.sql';
    } else if (error.message?.includes('column') && error.message?.includes('whatsapp_settings')) {
      errorMessage = 'Database migration not applied. Please run: 20251201000000_add_whatsapp_settings_to_tenants.sql';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { username, email, phone, identifier, otp, method, tenant_id } = req.body;

    console.log('\n🔐 ============================================');
    console.log('🔐 Verify OTP Request Received');
    console.log('🔐 ============================================');
    console.log('   OTP:', otp);
    console.log('   Method:', method);
    console.log('   Identifier:', identifier || username || email || phone);
    console.log('   Tenant ID:', tenant_id);
    console.log('============================================\n');

    if (!otp) {
      console.error('❌ OTP verification failed: OTP is required');
      return res.status(400).json({ error: 'OTP is required' });
    }

    // Support identifier-based lookup (username, email, or phone)
    let userEmail = email;
    let userPhone = phone;
    let isEmail = !!email;
    let searchIdentifier = identifier || username || email || phone;
    
    if (!searchIdentifier && !email && !phone) {
      console.error('❌ OTP verification failed: No identifier provided');
      return res.status(400).json({ error: 'Identifier, email, or phone number is required' });
    }

    if (searchIdentifier && !email && !phone) {
      // Need to lookup user by identifier
      let userResult;
      
      // Detect identifier type
      const isEmailIdentifier = searchIdentifier.includes('@');
      const isPhoneIdentifier = /^[\d\s\+\-\(\)]+$/.test(searchIdentifier.replace(/\s/g, ''));
      
      if (tenant_id) {
        if (isEmailIdentifier) {
          userResult = await query(
            `SELECT id, email, phone, username 
             FROM users 
             WHERE email = $1 AND tenant_id = $2 AND is_active = true`,
            [searchIdentifier, tenant_id]
          );
        } else if (isPhoneIdentifier) {
          // Normalize phone for search
          const normalizedPhone = searchIdentifier.replace(/^\+/, '').replace(/\s/g, '');
          const phoneWithPlus = `+${normalizedPhone}`;
          userResult = await query(
            `SELECT id, email, phone, username 
             FROM users 
             WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
             AND tenant_id = $4 AND is_active = true`,
            [phoneWithPlus, searchIdentifier, normalizedPhone, tenant_id]
          );
        } else {
          // Username
          userResult = await query(
            `SELECT id, email, phone, username 
             FROM users 
             WHERE username = $1 AND tenant_id = $2 AND is_active = true`,
            [searchIdentifier, tenant_id]
          );
        }
      } else {
        if (isEmailIdentifier) {
          userResult = await query(
            `SELECT id, email, phone, username 
             FROM users 
             WHERE email = $1 AND is_active = true`,
            [searchIdentifier]
          );
        } else if (isPhoneIdentifier) {
          // Normalize phone for search
          const normalizedPhone = searchIdentifier.replace(/^\+/, '').replace(/\s/g, '');
          const phoneWithPlus = `+${normalizedPhone}`;
          userResult = await query(
            `SELECT id, email, phone, username 
             FROM users 
             WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
             AND is_active = true`,
            [phoneWithPlus, searchIdentifier, normalizedPhone]
          );
        } else {
          // Username
          userResult = await query(
            `SELECT id, email, phone, username 
             FROM users 
             WHERE username = $1 AND is_active = true`,
            [searchIdentifier]
          );
        }
      }

      if (userResult.rows.length === 0) {
        console.error('❌ User not found for identifier:', searchIdentifier);
        return res.status(400).json({ error: 'Invalid OTP' });
      }

      const user = userResult.rows[0];
      console.log('✅ User found:', {
        id: user.id,
        email: user.email ? 'SET ✅' : 'NOT SET ❌',
        phone: user.phone ? 'SET ✅' : 'NOT SET ❌',
        username: user.username || 'N/A'
      });
      
      // Always get both email and phone from user record for OTP search
      // We'll use method to determine which one to prioritize, but search both
      userEmail = user.email || null;
      userPhone = user.phone || null;
      
      // Use method to determine which contact info to prioritize for OTP search
      if (method === 'email') {
        isEmail = true;
        console.log('   Using email method (will search email first):', userEmail);
      } else if (method === 'whatsapp') {
        isEmail = false;
        console.log('   Using WhatsApp method (will search phone first):', userPhone);
      } else {
        // Default: prioritize email if available, otherwise phone
        isEmail = !!user.email;
        console.log('   Using default method (will search both):', {
          email: userEmail || 'N/A',
          phone: userPhone || 'N/A',
          priority: isEmail ? 'email' : 'phone'
        });
      }
    }

    if (!userEmail && !userPhone) {
      console.error('❌ No email or phone available for OTP verification');
      return res.status(400).json({ error: 'Email or phone number is required' });
    }

    const contactIdentifier = userEmail || userPhone;

    // Determine which method to use for OTP search
    // Always try both email and phone if available, but prioritize based on method
    // This ensures we find OTP even if it was sent via a different method than selected
    const useEmailForOTPSearch = userEmail ? true : false;
    const usePhoneForOTPSearch = userPhone ? true : false;
    const searchEmailFirst = method === 'email' || (method !== 'whatsapp' && userEmail);
    const searchPhoneFirst = method === 'whatsapp' || (method !== 'email' && userPhone);

    console.log('🔍 OTP Search Strategy:', {
      method: method || 'not specified',
      useEmailForOTPSearch,
      usePhoneForOTPSearch,
      userEmail: userEmail ? 'SET ✅' : 'NOT SET ❌',
      userPhone: userPhone ? 'SET ✅' : 'NOT SET ❌',
    });

    // Find valid OTP
    let otpResult: any = null;
    try {
      // Search strategy: Try the method specified first, then try the other method as fallback
      // This ensures we find OTP even if it was sent via a different method
      
      // Try email first if method is email or if email is available and method is not whatsapp
      if (searchEmailFirst && useEmailForOTPSearch && userEmail) {
        console.log('   🔍 Searching OTP by email first (method: email or default)...');
        // Try with purpose column first, fallback if it doesn't exist
        try {
          otpResult = await query(
            `SELECT id, email, expires_at, verified 
             FROM otp_requests 
             WHERE email = $1 AND otp_code = $2 AND purpose = $3 
             ORDER BY created_at DESC LIMIT 1`,
            [userEmail, otp, 'password_reset']
          );
        } catch (purposeErr: any) {
          // If purpose column doesn't exist, query without it
          if (purposeErr.message?.includes('column') && purposeErr.message?.includes('purpose')) {
            console.warn('⚠️  purpose column does not exist. Querying without purpose filter.');
            otpResult = await query(
              `SELECT id, email, expires_at, verified 
               FROM otp_requests 
               WHERE email = $1 AND otp_code = $2 
               ORDER BY created_at DESC LIMIT 1`,
              [userEmail, otp]
            );
          } else {
            throw purposeErr;
          }
        }
        console.log('   ✅ Email OTP search completed');
      }
      
      // If email search didn't find OTP, try phone (either as primary for whatsapp method or as fallback)
      if ((!otpResult || otpResult.rows.length === 0) && usePhoneForOTPSearch && userPhone) {
        if (searchPhoneFirst) {
          console.log('   🔍 Searching OTP by phone first (method: whatsapp)...');
        } else {
          console.log('   🔄 Trying phone OTP search as fallback...');
        }
        // Normalize phone number for search (remove + and spaces)
        const normalizedPhone = userPhone.replace(/^\+/, '').replace(/\s/g, '');
        const phoneWithPlus = `+${normalizedPhone}`;
        
        // Try with purpose column first, fallback if it doesn't exist
        try {
          otpResult = await query(
            `SELECT id, phone, expires_at, verified 
             FROM otp_requests 
             WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
             AND otp_code = $4 AND purpose = $5 
             ORDER BY created_at DESC LIMIT 1`,
            [userPhone, phoneWithPlus, normalizedPhone, otp, 'password_reset']
          );
        } catch (purposeErr: any) {
          // If purpose column doesn't exist, query without it
          if (purposeErr.message?.includes('column') && purposeErr.message?.includes('purpose')) {
            console.warn('⚠️  purpose column does not exist. Querying without purpose filter.');
            otpResult = await query(
              `SELECT id, phone, expires_at, verified 
               FROM otp_requests 
               WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
               AND otp_code = $4 
               ORDER BY created_at DESC LIMIT 1`,
              [userPhone, phoneWithPlus, normalizedPhone, otp]
            );
          } else {
            throw purposeErr;
          }
        }
        console.log('   ✅ Phone OTP search completed');
      }
      
      // If phone search didn't find OTP and email search is available, try email as final fallback
      if ((!otpResult || otpResult.rows.length === 0) && useEmailForOTPSearch && userEmail && !searchEmailFirst) {
        console.log('   🔄 Trying email OTP search as final fallback...');
        // Try with purpose column first, fallback if it doesn't exist
        try {
          otpResult = await query(
            `SELECT id, email, expires_at, verified 
             FROM otp_requests 
             WHERE email = $1 AND otp_code = $2 AND purpose = $3 
             ORDER BY created_at DESC LIMIT 1`,
            [userEmail, otp, 'password_reset']
          );
        } catch (purposeErr: any) {
          // If purpose column doesn't exist, query without it
          if (purposeErr.message?.includes('column') && purposeErr.message?.includes('purpose')) {
            console.warn('⚠️  purpose column does not exist. Querying without purpose filter.');
            otpResult = await query(
              `SELECT id, email, expires_at, verified 
               FROM otp_requests 
               WHERE email = $1 AND otp_code = $2 
               ORDER BY created_at DESC LIMIT 1`,
              [userEmail, otp]
            );
          } else {
            throw purposeErr;
          }
        }
        console.log('   ✅ Email OTP search completed (fallback)');
      }
    } catch (queryErr: any) {
      // If email column doesn't exist, try with phone
      if (queryErr.message?.includes('column') && queryErr.message?.includes('email')) {
        console.warn('⚠️  email column may not exist. Using phone column as fallback.');
        // Normalize phone number for search (remove + and spaces)
        const phoneToSearch = userPhone || contactIdentifier;
        if (!phoneToSearch) {
          throw new Error('No phone number available for OTP verification');
        }
        const normalizedPhone = phoneToSearch.replace(/^\+/, '').replace(/\s/g, '');
        const phoneWithPlus = `+${normalizedPhone}`;
        
        // Search with multiple phone formats
        otpResult = await query(
          `SELECT id, phone, expires_at, verified 
           FROM otp_requests 
           WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
           AND otp_code = $4 
           ORDER BY created_at DESC LIMIT 1`,
          [phoneToSearch, phoneWithPlus, normalizedPhone, otp]
        );
      } else {
        throw queryErr;
      }
    }

    if (!otpResult || !otpResult.rows || otpResult.rows.length === 0) {
      console.error('❌ OTP verification failed: No OTP found');
      console.error('   Search details:', {
        isEmail,
        userEmail: userEmail ? `SET ✅ (${userEmail})` : 'NOT SET ❌',
        userPhone: userPhone ? `SET ✅ (${userPhone})` : 'NOT SET ❌',
        otp: otp ? `SET ✅ (${otp})` : 'NOT SET ❌',
        searchIdentifier: searchIdentifier || 'N/A',
      });
      return res.status(400).json({ error: 'Invalid OTP. Please check the code and try again.' });
    }

    const otpRecord = otpResult.rows[0];
    
    if (!otpRecord) {
      console.error('❌ OTP verification failed: OTP record is null');
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Check if expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: 'OTP has expired' });
    }

    // Check if already verified
    if (otpRecord.verified) {
      return res.status(400).json({ error: 'OTP has already been used' });
    }

    // Mark as verified
    await query(
      'UPDATE otp_requests SET verified = true WHERE id = $1',
      [otpRecord.id]
    );

    // Get email/phone from OTP record (prefer OTP record, fallback to user lookup result)
    const otpEmail = otpRecord.email || (isEmail ? userEmail : null);
    const otpPhone = otpRecord.phone || (!isEmail ? userPhone : null);
    
    // Generate temporary token for password reset (valid for 15 minutes)
    const resetToken = jwt.sign(
      { 
        email: otpEmail, 
        phone: otpPhone,
        identifier: searchIdentifier || contactIdentifier,
        otpId: otpRecord.id, 
        purpose: 'password_reset' 
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Get user info for automatic login
    let userResult;
    if (otpEmail) {
      userResult = await query(
        'SELECT * FROM users WHERE email = $1 AND is_active = true',
        [otpEmail]
      );
    } else if (otpPhone) {
      const normalizedPhone = otpPhone.replace(/^\+/, '').replace(/\s/g, '');
      const phoneWithPlus = `+${normalizedPhone}`;
      userResult = await query(
        `SELECT * FROM users 
         WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
         AND is_active = true`,
        [otpPhone, phoneWithPlus, normalizedPhone]
      );
    }

    let user = null;
    let tenant = null;
    let sessionToken = null;

    if (userResult && userResult.rows.length > 0) {
      user = userResult.rows[0];
      
      // Get tenant if exists
      if (user.tenant_id) {
        const tenantResult = await query('SELECT * FROM tenants WHERE id = $1', [user.tenant_id]);
        tenant = tenantResult.rows[0] || null;
      }

      // Generate JWT session token for automatic login
      sessionToken = jwt.sign(
        { 
          id: user.id, 
          email: user.email, 
          role: user.role,
          tenant_id: user.tenant_id 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Remove password from user object
      const { password_hash, password, ...userWithoutPassword } = user;
      
      console.log('✅ User authenticated via OTP:', {
        id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id || 'N/A'
      });
    }

    res.json({ 
      success: true, 
      resetToken,
      message: 'OTP verified successfully',
      // Include session info for automatic login
      ...(sessionToken && {
        session: {
          access_token: sessionToken,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            tenant_id: user.tenant_id
          }
        },
        user: user ? (() => {
          const { password_hash, password, ...rest } = user;
          return rest;
        })() : null,
        tenant
      })
    });
  } catch (error: any) {
    console.error('Verify OTP error:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Reset password (with token from OTP verification)
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(resetToken, JWT_SECRET) as any;
    } catch (error: any) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid token purpose' });
    }

    // Verify OTP was actually verified
    const otpResult = await query(
      'SELECT verified FROM otp_requests WHERE id = $1',
      [decoded.otpId]
    );

    if (otpResult.rows.length === 0 || !otpResult.rows[0].verified) {
      return res.status(400).json({ error: 'OTP not verified' });
    }

    // Get identifier (email or phone) from decoded token
    const identifier = decoded.email || decoded.phone || decoded.identifier;
    
    if (!identifier) {
      return res.status(400).json({ error: 'Invalid reset token: missing identifier' });
    }

    // Update password - find user by email or phone
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    let updateResult;
    if (decoded.email) {
      updateResult = await query(
        'UPDATE users SET password_hash = $1 WHERE email = $2',
        [hashedPassword, decoded.email]
      );
    } else if (decoded.phone) {
      // Normalize phone number for search (remove + and spaces)
      const normalizedPhone = decoded.phone.replace(/^\+/, '').replace(/\s/g, '');
      const phoneWithPlus = `+${normalizedPhone}`;
      
      // Update with multiple phone formats
      updateResult = await query(
        `UPDATE users 
         SET password_hash = $1 
         WHERE (phone = $2 OR phone = $3 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $4)`,
        [hashedPassword, decoded.phone, phoneWithPlus, normalizedPhone]
      );
    } else {
      return res.status(400).json({ error: 'Invalid reset token: missing email or phone' });
    }

    // Invalidate all OTPs
    if (decoded.email) {
      // Try with purpose column first, fallback if it doesn't exist
      try {
        await query(
          'UPDATE otp_requests SET verified = true WHERE email = $1 AND purpose = $2',
          [decoded.email, 'password_reset']
        );
      } catch (purposeErr: any) {
        if (purposeErr.message?.includes('column') && purposeErr.message?.includes('purpose')) {
          console.warn('⚠️  purpose column does not exist. Updating without purpose filter.');
          await query(
            'UPDATE otp_requests SET verified = true WHERE email = $1',
            [decoded.email]
          );
        } else {
          throw purposeErr;
        }
      }
    } else if (decoded.phone) {
      // Normalize phone number for search
      const normalizedPhone = decoded.phone.replace(/^\+/, '').replace(/\s/g, '');
      const phoneWithPlus = `+${normalizedPhone}`;
      
      // Try with purpose column first, fallback if it doesn't exist
      try {
        await query(
          `UPDATE otp_requests 
           SET verified = true 
           WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
           AND purpose = $4`,
          [decoded.phone, phoneWithPlus, normalizedPhone, 'password_reset']
        );
      } catch (purposeErr: any) {
        if (purposeErr.message?.includes('column') && purposeErr.message?.includes('purpose')) {
          console.warn('⚠️  purpose column does not exist. Updating without purpose filter.');
          await query(
            `UPDATE otp_requests 
             SET verified = true 
             WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3)`,
            [decoded.phone, phoneWithPlus, normalizedPhone]
          );
        } else {
          throw purposeErr;
        }
      }
    }

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error: any) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login with OTP (continue without changing password)
router.post('/login-with-otp', async (req, res) => {
  try {
    const { resetToken } = req.body;

    if (!resetToken) {
      return res.status(400).json({ error: 'Reset token is required' });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(resetToken, JWT_SECRET) as any;
    } catch (error: any) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid token purpose' });
    }

    // Get identifier (email or phone) from decoded token
    const identifier = decoded.email || decoded.phone || decoded.identifier;
    
    if (!identifier) {
      return res.status(400).json({ error: 'Invalid reset token: missing identifier' });
    }

    // Get user by email or phone
    let userResult;
    if (decoded.email) {
      userResult = await query(
        'SELECT * FROM users WHERE email = $1 AND is_active = true',
        [decoded.email]
      );
    } else if (decoded.phone) {
      // Normalize phone number for search (remove + and spaces)
      const normalizedPhone = decoded.phone.replace(/^\+/, '').replace(/\s/g, '');
      const phoneWithPlus = `+${normalizedPhone}`;
      
      // Search with both formats (with + and without +)
      userResult = await query(
        `SELECT * FROM users 
         WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
         AND is_active = true`,
        [decoded.phone, phoneWithPlus, normalizedPhone]
      );
    } else {
      return res.status(400).json({ error: 'Invalid reset token: missing email or phone' });
    }

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get tenant if exists
    let tenant = null;
    if (user.tenant_id) {
      const tenantResult = await query('SELECT * FROM tenants WHERE id = $1', [user.tenant_id]);
      tenant = tenantResult.rows[0] || null;
    }

    // Generate JWT token for login
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        tenant_id: user.tenant_id 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove sensitive fields from user object
    const { password_hash, password, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      tenant: tenant ? {
        id: tenant.id,
        name: tenant.name,
        name_ar: tenant.name_ar,
        slug: tenant.slug,
        industry: tenant.industry,
        contact_email: tenant.contact_email,
        contact_phone: tenant.contact_phone,
        tenant_time_zone: tenant.tenant_time_zone,
        is_active: tenant.is_active,
        public_page_enabled: tenant.public_page_enabled,
        maintenance_mode: tenant.maintenance_mode
      } : null,
      session: {
        access_token: token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username
        },
      },
    });
  } catch (error: any) {
    console.error('Login with OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if phone number exists (for phone entry page)
router.post('/check-phone', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check if phone exists in users table (customers)
    const normalizedPhoneNoPlus = normalizedPhone.replace(/^\+/, '').replace(/\s/g, '');
    const phoneWithPlus = `+${normalizedPhoneNoPlus}`;
    
    const userResult = await query(
      `SELECT id, email, phone, full_name 
       FROM users 
       WHERE (phone = $1 OR phone = $2 OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = $3) 
       AND role = 'customer' 
       AND is_active = true
       LIMIT 1`,
      [normalizedPhone, phoneWithPlus, normalizedPhoneNoPlus]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      return res.json({
        exists: true,
        email: user.email || null,
        name: user.full_name || null,
      });
    }

    // Check if phone exists in bookings table (guest bookings)
    const bookingResult = await query(
      `SELECT DISTINCT customer_name, customer_email 
       FROM bookings 
       WHERE (customer_phone = $1 OR customer_phone = $2 OR REPLACE(REPLACE(customer_phone, '+', ''), ' ', '') = $3)
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedPhone, phoneWithPlus, normalizedPhoneNoPlus]
    );

    if (bookingResult.rows.length > 0) {
      const booking = bookingResult.rows[0];
      return res.json({
        exists: true,
        email: booking.customer_email || null,
        name: booking.customer_name || null,
      });
    }

    // Phone not found
    return res.json({
      exists: false,
    });
  } catch (error: any) {
    console.error('Error checking phone:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Guest phone verification endpoint (for booking without account)
router.post('/guest/verify-phone', async (req, res) => {
  try {
    const { phone, tenant_id } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check if phone number already exists in bookings (for uniqueness check)
    // We allow same phone for different tenants, but check within tenant if tenant_id provided
    let phoneCheckQuery;
    if (tenant_id) {
      phoneCheckQuery = await query(
        `SELECT id FROM bookings 
         WHERE customer_phone = $1 AND tenant_id = $2 
         LIMIT 1`,
        [normalizedPhone, tenant_id]
      );
    } else {
      phoneCheckQuery = await query(
        `SELECT id FROM bookings 
         WHERE customer_phone = $1 
         LIMIT 1`,
        [normalizedPhone]
      );
    }

    // Phone uniqueness: For guest bookings, we allow same phone but track it
    // This is informational, not blocking
    const phoneExists = phoneCheckQuery.rows.length > 0;

    // Generate and send OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in database
    await query(
      `INSERT INTO otp_requests (phone, otp_code, expires_at, purpose, verified)
       VALUES ($1, $2, $3, $4, false)`,
      [normalizedPhone, otp, expiresAt, 'guest_verification']
    );

    // Send OTP via WhatsApp
    try {
      const { sendOTPWhatsApp } = await import('../services/whatsappService.js');
      
      // Get tenant WhatsApp settings if tenant_id provided
      let whatsappConfig: any = null;
      if (tenant_id) {
        try {
          const tenantResult = await query(
            'SELECT whatsapp_settings FROM tenants WHERE id = $1',
            [tenant_id]
          );
          if (tenantResult.rows.length > 0 && tenantResult.rows[0].whatsapp_settings) {
            const settings = tenantResult.rows[0].whatsapp_settings;
            whatsappConfig = {
              provider: settings.provider,
              apiUrl: settings.api_url,
              apiKey: settings.api_key,
              phoneNumberId: settings.phone_number_id,
              accessToken: settings.access_token,
              accountSid: settings.account_sid,
              authToken: settings.auth_token,
              from: settings.from,
            };
          }
        } catch (err: any) {
          console.warn('Could not fetch tenant WhatsApp settings:', err.message);
        }
      }

      if (!whatsappConfig) {
        console.error('❌ WhatsApp settings not configured in database for tenant');
        // Still return success, OTP is stored in DB
        return res.json({ success: true, message: 'OTP generated. WhatsApp not configured.' });
      }
      const result = await sendOTPWhatsApp(normalizedPhone, otp, 'en', whatsappConfig);
      
      if (!result.success) {
        console.error('Failed to send WhatsApp OTP:', result.error);
        // Still return success, OTP is stored in DB
      }
    } catch (importErr: any) {
      console.error('Failed to send WhatsApp OTP:', importErr);
      // Still return success, OTP is stored in DB
    }

    // Log OTP in development mode
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n📧 ============================================');
      console.log(`📧 GUEST OTP FOR ${normalizedPhone.toUpperCase()}`);
      console.log(`📧 CODE: ${otp}`);
      console.log(`📧 Expires at: ${expiresAt.toISOString()}`);
      console.log('📧 ============================================\n');
    }

    res.json({
      success: true,
      message: 'OTP sent successfully',
      phoneExists, // Informational: phone was used before
    });
  } catch (error: any) {
    console.error('Guest phone verification error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Verify guest OTP
router.post('/guest/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone number and OTP are required' });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Find valid OTP
    const otpResult = await query(
      `SELECT id, phone, expires_at, verified 
       FROM otp_requests 
       WHERE phone = $1 AND otp_code = $2 AND purpose = $3 
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedPhone, otp, 'guest_verification']
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    const otpRecord = otpResult.rows[0];

    // Check if expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: 'OTP has expired' });
    }

    // Check if already verified
    if (otpRecord.verified) {
      return res.status(400).json({ error: 'OTP has already been used' });
    }

    // Mark as verified
    await query(
      'UPDATE otp_requests SET verified = true WHERE id = $1',
      [otpRecord.id]
    );

    res.json({
      success: true,
      message: 'Phone verified successfully',
      verifiedPhone: normalizedPhone,
    });
  } catch (error: any) {
    console.error('Guest OTP verification error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export { router as authRoutes };

