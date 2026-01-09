import express from 'express';
import { query } from '../db';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { testWhatsAppConnection } from '../services/whatsappService';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
        tenant_id?: string;
      };
    }
  }
}

// Middleware to authenticate tenant admin
function authenticateTenantAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Allow tenant_admin, receptionist, cashier, and solution_owner
    const allowedRoles = ['tenant_admin', 'receptionist', 'cashier', 'solution_owner'];
    if (!decoded.role) {
      return res.status(403).json({ 
        error: 'Access denied. No role found in token. Please log in again.',
        debug: 'Token missing role field'
      });
    }
    if (!allowedRoles.includes(decoded.role)) {
      return res.status(403).json({ 
        error: `Access denied. Your role "${decoded.role}" does not have permission to access this resource.`,
        userRole: decoded.role,
        allowedRoles: allowedRoles,
        hint: 'You need to be logged in as a tenant admin, receptionist, cashier, or solution owner.'
      });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      tenant_id: decoded.tenant_id,
    };
    
    next();
  } catch (error: any) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Get SMTP settings for tenant
router.get('/smtp-settings', authenticateTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }

    try {
      const result = await query(
        'SELECT smtp_settings FROM tenants WHERE id = $1',
        [tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const smtpSettings = result.rows[0].smtp_settings || null;
      
      // Don't send password back, only send if it exists
      if (smtpSettings && smtpSettings.smtp_password) {
        smtpSettings.smtp_password = '***'; // Mask password
      }

      res.json({ smtp_settings: smtpSettings });
    } catch (dbError: any) {
      // Check if column doesn't exist
      if (dbError.message && dbError.message.includes('column') && dbError.message.includes('smtp_settings')) {
        console.warn('⚠️  smtp_settings column does not exist. Please run migration: 20251203000001_add_smtp_settings_to_tenants.sql');
        return res.json({ smtp_settings: null });
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error('Error fetching SMTP settings:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Update SMTP settings for tenant
router.put('/smtp-settings', authenticateTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { smtp_host, smtp_port, smtp_user, smtp_password } = req.body;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }

    // Validate required fields
    if (!smtp_user || !smtp_password) {
      return res.status(400).json({ error: 'SMTP user and password are required' });
    }

    const smtpSettings = {
      smtp_host: smtp_host || 'smtp.gmail.com',
      smtp_port: smtp_port || 587,
      smtp_user,
      smtp_password, // In production, this should be encrypted
    };

    try {
      const result = await query(
        `UPDATE tenants 
         SET smtp_settings = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, smtp_settings`,
        [JSON.stringify(smtpSettings), tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Mask password in response
      const responseSettings = { ...smtpSettings };
      responseSettings.smtp_password = '***';

      res.json({ 
        success: true,
        message: 'SMTP settings updated successfully',
        smtp_settings: responseSettings
      });
    } catch (dbError: any) {
      // Check if column doesn't exist
      if (dbError.message && dbError.message.includes('column') && dbError.message.includes('smtp_settings')) {
        console.error('❌ smtp_settings column does not exist. Please run migration: 20251203000001_add_smtp_settings_to_tenants.sql');
        return res.status(500).json({ 
          error: 'Database migration required. Please run: 20251203000001_add_smtp_settings_to_tenants.sql',
          details: 'The smtp_settings column does not exist in the tenants table.'
        });
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error('Error updating SMTP settings:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Test SMTP connection
router.post('/smtp-settings/test', authenticateTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { smtp_host, smtp_port, smtp_user, smtp_password } = req.body;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }

    // If settings not provided in body, get from database
    let host = smtp_host;
    let port = smtp_port;
    let user = smtp_user;
    let password = smtp_password;

    if (!user || !password) {
      const result = await query(
        'SELECT smtp_settings FROM tenants WHERE id = $1',
        [tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const settings = result.rows[0].smtp_settings;
      if (!settings || !settings.smtp_user || !settings.smtp_password) {
        return res.status(400).json({ error: 'SMTP settings not configured. Please save settings first.' });
      }

      host = settings.smtp_host || 'smtp.gmail.com';
      port = settings.smtp_port || 587;
      user = settings.smtp_user;
      password = settings.smtp_password;
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: host || 'smtp.gmail.com',
      port: parseInt(String(port || 587)),
      secure: false,
      auth: {
        user,
        pass: password,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
      },
    });

    // Test connection
    await new Promise<void>((resolve, reject) => {
      transporter.verify((error, success) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    // Try sending a test email
    const testEmail = user; // Send test email to the SMTP user email
    const testInfo = await transporter.sendMail({
      from: `"Bookati Test" <${user}>`,
      to: testEmail,
      subject: 'SMTP Connection Test - Bookati',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">SMTP Connection Test</h2>
          <p>This is a test email to verify your SMTP configuration.</p>
          <p>If you received this email, your SMTP settings are working correctly! ✅</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">This is an automated test email from Bookati.</p>
        </div>
      `,
    });

    res.json({ 
      success: true,
      message: 'SMTP connection test successful! Test email sent.',
      messageId: testInfo.messageId,
      testEmail
    });
  } catch (error: any) {
    console.error('SMTP test error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'SMTP connection test failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get WhatsApp settings for tenant
router.get('/whatsapp-settings', authenticateTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }

    try {
      const result = await query(
        'SELECT whatsapp_settings FROM tenants WHERE id = $1',
        [tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const whatsappSettings = result.rows[0].whatsapp_settings || null;
      
      // Mask sensitive information
      if (whatsappSettings) {
        if (whatsappSettings.access_token) {
          whatsappSettings.access_token = '***';
        }
        if (whatsappSettings.api_key) {
          whatsappSettings.api_key = '***';
        }
        if (whatsappSettings.auth_token) {
          whatsappSettings.auth_token = '***';
        }
      }

      res.json({ whatsapp_settings: whatsappSettings });
    } catch (dbError: any) {
      if (dbError.message && dbError.message.includes('column') && dbError.message.includes('whatsapp_settings')) {
        console.warn('⚠️  whatsapp_settings column does not exist. Please run migration: 20251201000000_add_whatsapp_settings_to_tenants.sql');
        return res.json({ whatsapp_settings: null });
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error('Error fetching WhatsApp settings:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Update WhatsApp settings for tenant
router.put('/whatsapp-settings', authenticateTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { provider, api_url, api_key, phone_number_id, access_token, account_sid, auth_token, from } = req.body;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    const whatsappSettings: any = {
      provider,
    };

    // Add provider-specific settings
    if (api_url) whatsappSettings.api_url = api_url;
    if (api_key) whatsappSettings.api_key = api_key;
    if (phone_number_id) whatsappSettings.phone_number_id = phone_number_id;
    if (access_token) whatsappSettings.access_token = access_token;
    if (account_sid) whatsappSettings.account_sid = account_sid;
    if (auth_token) whatsappSettings.auth_token = auth_token;
    if (from) whatsappSettings.from = from;

    try {
      const result = await query(
        `UPDATE tenants 
         SET whatsapp_settings = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, whatsapp_settings`,
        [JSON.stringify(whatsappSettings), tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Mask sensitive info in response
      const responseSettings = { ...whatsappSettings };
      if (responseSettings.access_token) responseSettings.access_token = '***';
      if (responseSettings.api_key) responseSettings.api_key = '***';
      if (responseSettings.auth_token) responseSettings.auth_token = '***';

      res.json({ 
        success: true,
        message: 'WhatsApp settings updated successfully',
        whatsapp_settings: responseSettings
      });
    } catch (dbError: any) {
      if (dbError.message && dbError.message.includes('column') && dbError.message.includes('whatsapp_settings')) {
        console.error('❌ whatsapp_settings column does not exist. Please run migration: 20251201000000_add_whatsapp_settings_to_tenants.sql');
        return res.status(500).json({ 
          error: 'Database migration required. Please run: 20251201000000_add_whatsapp_settings_to_tenants.sql',
          details: 'The whatsapp_settings column does not exist in the tenants table.'
        });
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error('Error updating WhatsApp settings:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Test WhatsApp connection
router.post('/whatsapp-settings/test', authenticateTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { provider, api_url, api_key, phone_number_id, access_token, account_sid, auth_token, from } = req.body;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }

    // If settings not provided in body, get from database
    let config: any = {
      provider: provider,
    };

    if (!provider) {
      const result = await query(
        'SELECT whatsapp_settings FROM tenants WHERE id = $1',
        [tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const settings = result.rows[0].whatsapp_settings;
      if (!settings || !settings.provider) {
        return res.status(400).json({ error: 'WhatsApp settings not configured. Please save settings first.' });
      }

      // Convert snake_case from database to camelCase for whatsappService
      config.provider = settings.provider;
      if (settings.api_url) config.apiUrl = settings.api_url;
      if (settings.api_key) config.apiKey = settings.api_key;
      if (settings.phone_number_id) config.phoneNumberId = settings.phone_number_id;
      if (settings.access_token) config.accessToken = settings.access_token;
      if (settings.account_sid) config.accountSid = settings.account_sid;
      if (settings.auth_token) config.authToken = settings.auth_token;
      if (settings.from) config.from = settings.from;
    } else {
      // Use provided settings - convert snake_case to camelCase for whatsappService
      config.provider = provider;
      if (api_url) config.apiUrl = api_url;
      if (api_key) config.apiKey = api_key;
      if (phone_number_id) config.phoneNumberId = phone_number_id;
      if (access_token) config.accessToken = access_token;
      if (account_sid) config.accountSid = account_sid;
      if (auth_token) config.authToken = auth_token;
      if (from) config.from = from;
    }

    // Validate required fields before testing
    if (config.provider === 'meta') {
      if (!config.phoneNumberId || !config.accessToken) {
        return res.status(400).json({ 
          success: false,
          error: 'Phone Number ID and Access Token are required for Meta Cloud API',
          provider: config.provider
        });
      }
    } else if (config.provider === 'twilio') {
      if (!config.accountSid || !config.authToken) {
        return res.status(400).json({ 
          success: false,
          error: 'Account SID and Auth Token are required for Twilio',
          provider: config.provider
        });
      }
    } else if (config.provider === 'wati') {
      if (!config.apiKey) {
        return res.status(400).json({ 
          success: false,
          error: 'API Key is required for WATI',
          provider: config.provider
        });
      }
    } else if (!config.provider) {
      return res.status(400).json({ 
        success: false,
        error: 'Provider is required'
      });
    }

    // Test connection
    const testResult = await testWhatsAppConnection(config);

    if (testResult.success) {
      res.json({ 
        success: true,
        message: 'WhatsApp connection test successful!',
        provider: config.provider
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: testResult.error || 'WhatsApp connection test failed',
        provider: config.provider
      });
    }
  } catch (error: any) {
    console.error('WhatsApp test error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'WhatsApp connection test failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get Zoho configuration for tenant
router.get('/zoho-config', authenticateTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }

    try {
      const result = await query(
        `SELECT 
          id, tenant_id, client_id, redirect_uri, scopes, region, is_active, created_at, updated_at
        FROM tenant_zoho_configs 
        WHERE tenant_id = $1`,
        [tenantId]
      );

      if (result.rows.length === 0) {
        return res.json({ zoho_config: null });
      }

      const config = result.rows[0];
      
      // Never send client_secret back
      res.json({ 
        zoho_config: {
          id: config.id,
          tenant_id: config.tenant_id,
          client_id: config.client_id,
          redirect_uri: config.redirect_uri,
          scopes: config.scopes,
          region: config.region,
          is_active: config.is_active,
          created_at: config.created_at,
          updated_at: config.updated_at,
          has_credentials: true, // Indicates credentials are set
        }
      });
    } catch (dbError: any) {
      if (dbError.message && dbError.message.includes('relation') && dbError.message.includes('tenant_zoho_configs')) {
        console.warn('⚠️  tenant_zoho_configs table does not exist. Please run migration: 20250131000000_create_tenant_zoho_configs_table.sql');
        return res.json({ zoho_config: null });
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error('Error fetching Zoho config:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Update Zoho configuration for tenant
router.put('/zoho-config', authenticateTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { client_id, client_secret, redirect_uri, scopes, region } = req.body;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }

    // Validate required fields
    if (!client_id || !client_secret) {
      return res.status(400).json({ error: 'Client ID and Client Secret are required' });
    }

    const defaultRedirectUri = redirect_uri || `${process.env.APP_URL || 'http://localhost:3001'}/api/zoho/callback`;
    const defaultScopes = scopes || [
      'ZohoInvoice.invoices.CREATE',
      'ZohoInvoice.invoices.READ',
      'ZohoInvoice.contacts.CREATE',
      'ZohoInvoice.contacts.READ'
    ];
    const defaultRegion = region || 'com';

    try {
      // Check if config exists
      const existingResult = await query(
        'SELECT id FROM tenant_zoho_configs WHERE tenant_id = $1',
        [tenantId]
      );

      let result;
      if (existingResult.rows.length > 0) {
        // Update existing
        result = await query(
          `UPDATE tenant_zoho_configs 
           SET client_id = $1, 
               client_secret = $2, 
               redirect_uri = $3, 
               scopes = $4, 
               region = $5,
               is_active = true,
               updated_at = NOW()
           WHERE tenant_id = $6
           RETURNING id, tenant_id, client_id, redirect_uri, scopes, region, is_active, created_at, updated_at`,
          [client_id, client_secret, defaultRedirectUri, defaultScopes, defaultRegion, tenantId]
        );
      } else {
        // Insert new
        result = await query(
          `INSERT INTO tenant_zoho_configs 
           (tenant_id, client_id, client_secret, redirect_uri, scopes, region, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING id, tenant_id, client_id, redirect_uri, scopes, region, is_active, created_at, updated_at`,
          [tenantId, client_id, client_secret, defaultRedirectUri, defaultScopes, defaultRegion]
        );
      }

      if (result.rows.length === 0) {
        return res.status(500).json({ error: 'Failed to save Zoho configuration' });
      }

      const config = result.rows[0];

      // Clear credential cache to ensure fresh data is loaded
      const { zohoCredentials } = await import('../config/zohoCredentials');
      zohoCredentials.clearTenantCache(tenantId);

      res.json({ 
        success: true,
        message: 'Zoho configuration saved successfully',
        zoho_config: {
          id: config.id,
          tenant_id: config.tenant_id,
          client_id: config.client_id,
          redirect_uri: config.redirect_uri,
          scopes: config.scopes,
          region: config.region,
          is_active: config.is_active,
          created_at: config.created_at,
          updated_at: config.updated_at,
        }
      });
    } catch (dbError: any) {
      if (dbError.message && dbError.message.includes('relation') && dbError.message.includes('tenant_zoho_configs')) {
        console.error('❌ tenant_zoho_configs table does not exist. Please run migration: 20250131000000_create_tenant_zoho_configs_table.sql');
        return res.status(500).json({ 
          error: 'Database migration required. Please run: 20250131000000_create_tenant_zoho_configs_table.sql',
          details: 'The tenant_zoho_configs table does not exist.'
        });
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error('Error updating Zoho config:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get Zoho connection status (check if tokens exist)
router.get('/zoho-status', authenticateTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }

    // Check if config exists
    const configResult = await query(
      'SELECT id, is_active FROM tenant_zoho_configs WHERE tenant_id = $1',
      [tenantId]
    );

    const hasConfig = configResult.rows.length > 0 && configResult.rows[0].is_active;

    // Check if tokens exist
    const tokenResult = await query(
      'SELECT id, expires_at FROM zoho_tokens WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
      [tenantId]
    );

    const hasTokens = tokenResult.rows.length > 0;
    let tokenStatus = 'not_connected';
    let tokenExpiresAt = null;

    if (hasTokens) {
      const expiresAt = new Date(tokenResult.rows[0].expires_at);
      const now = new Date();
      if (expiresAt > now) {
        tokenStatus = 'connected';
        tokenExpiresAt = expiresAt.toISOString();
      } else {
        tokenStatus = 'expired';
        tokenExpiresAt = expiresAt.toISOString();
      }
    }

    res.json({
      has_config: hasConfig,
      has_tokens: hasTokens,
      connection_status: tokenStatus,
      token_expires_at: tokenExpiresAt,
    });
  } catch (error: any) {
    console.error('Error checking Zoho status:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Test Zoho connection (create a test invoice)
router.post('/zoho-config/test', authenticateTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }

    // Check if config exists
    const configResult = await query(
      'SELECT id FROM tenant_zoho_configs WHERE tenant_id = $1 AND is_active = true',
      [tenantId]
    );

    if (configResult.rows.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Zoho configuration not found. Please save your Zoho credentials first.' 
      });
    }

    // Check if tokens exist
    const tokenResult = await query(
      'SELECT id FROM zoho_tokens WHERE tenant_id = $1',
      [tenantId]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Zoho account not connected. Please connect your Zoho account first using the OAuth flow.' 
      });
    }

    // Try to use Zoho service to test connection
    try {
      const { zohoService } = await import('../services/zohoService.js');
      
      // This will test if we can get an access token
      const accessToken = await zohoService.getAccessToken(tenantId);
      
      if (accessToken) {
        res.json({ 
          success: true,
          message: 'Zoho connection test successful! Your Zoho integration is working correctly.',
        });
      } else {
        res.status(400).json({ 
          success: false,
          error: 'Failed to get access token. Please reconnect your Zoho account.' 
        });
      }
    } catch (zohoError: any) {
      console.error('Zoho test error:', zohoError);
      res.status(400).json({ 
        success: false,
        error: zohoError.message || 'Zoho connection test failed. Please check your configuration and reconnect.',
      });
    }
  } catch (error: any) {
    console.error('Error testing Zoho connection:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export { router as tenantRoutes };

