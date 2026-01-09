import express from 'express';
import { query, pool } from '../db';
import { zohoService } from '../services/zohoService';
import { zohoCredentials } from '../config/zohoCredentials';
import axios from 'axios';

const router = express.Router();

/**
 * GET /api/zoho/auth
 * Initiate OAuth flow - redirect to Zoho authorization page
 * Uses tenant-specific credentials if available, falls back to global
 */
router.get('/auth', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    // Load tenant-specific credentials (or fall back to global)
    const clientId = await zohoCredentials.getClientIdForTenant(tenantId);
    const redirectUri = await zohoCredentials.getRedirectUriForTenant(tenantId);
    const scope = (await zohoCredentials.getScopeForTenant(tenantId)).join(',');

    // Log the redirect URI being used for debugging
    console.log(`[Zoho Routes] Using redirect URI: ${redirectUri}`);
    console.log(`[Zoho Routes] Make sure this EXACT URI is configured in Zoho Developer Console`);

    // Store tenant_id in session or state parameter for callback
    const state = Buffer.from(JSON.stringify({ tenant_id: tenantId })).toString('base64');

    // Determine Zoho accounts URL based on region (if tenant has custom region)
    let accountsUrl = 'https://accounts.zoho.com/oauth/v2/auth';
    try {
      const configResult = await query(
        'SELECT region FROM tenant_zoho_configs WHERE tenant_id = $1 AND is_active = true',
        [tenantId]
      );
      if (configResult.rows.length > 0 && configResult.rows[0].region) {
        const region = configResult.rows[0].region;
        if (region === 'eu') {
          accountsUrl = 'https://accounts.zoho.eu/oauth/v2/auth';
        } else if (region === 'in') {
          accountsUrl = 'https://accounts.zoho.in/oauth/v2/auth';
        } else if (region === 'au') {
          accountsUrl = 'https://accounts.zoho.com.au/oauth/v2/auth';
        } else if (region === 'jp') {
          accountsUrl = 'https://accounts.zoho.jp/oauth/v2/auth';
        }
      }
    } catch (error) {
      // If query fails, use default
      console.warn('[Zoho Routes] Could not determine region, using default');
    }

    const authUrl = `${accountsUrl}?` +
      `scope=${encodeURIComponent(scope)}&` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}`;

    console.log(`[Zoho Routes] ========================================`);
    console.log(`[Zoho Routes] INITIATING OAUTH FLOW`);
    console.log(`[Zoho Routes] Tenant ID: ${tenantId}`);
    console.log(`[Zoho Routes] Client ID: ${clientId.substring(0, 10)}...`);
    console.log(`[Zoho Routes] Redirect URI: ${redirectUri}`);
    console.log(`[Zoho Routes] Access Type: offline (for refresh_token)`);
    console.log(`[Zoho Routes] Prompt: consent (force consent screen)`);
    console.log(`[Zoho Routes] ⚠️  These parameters ensure refresh_token is returned`);
    console.log(`[Zoho Routes] Full Auth URL: ${authUrl.substring(0, 150)}...`);
    console.log(`[Zoho Routes] ⚠️  IMPORTANT: Make sure the redirect URI "${redirectUri}" is configured in Zoho Developer Console`);
    console.log(`[Zoho Routes] ⚠️  The redirect URI must match EXACTLY - no trailing slashes, no extra spaces`);
    console.log(`[Zoho Routes] ========================================`);
    
    res.redirect(authUrl);
  } catch (error: any) {
    console.error('[Zoho Routes] Auth initiation error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate OAuth flow' });
  }
});

/**
 * GET /api/zoho/callback
 * Handle OAuth callback from Zoho
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Log all query parameters for debugging
    console.log('[Zoho Routes] Callback received:', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      error: error,
      errorDescription: error_description,
      allParams: req.query,
    });

    // Check if Zoho returned an error (user denied, invalid request, etc.)
    if (error) {
      const errorMsg = error_description || error || 'Unknown error from Zoho';
      console.error('[Zoho Routes] OAuth error from Zoho:', errorMsg);
      return res.status(400).send(`
        <html>
          <head>
            <title>Zoho OAuth Error</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .error { background: #fee; border: 1px solid #fcc; padding: 15px; border-radius: 5px; }
              .info { background: #eef; border: 1px solid #ccf; padding: 15px; border-radius: 5px; margin-top: 20px; }
              h1 { color: #c00; }
              code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
            </style>
          </head>
          <body>
            <h1>❌ Zoho OAuth Error</h1>
            <div class="error">
              <p><strong>Error:</strong> ${error}</p>
              ${error_description ? `<p><strong>Description:</strong> ${error_description}</p>` : ''}
            </div>
            <div class="info">
              <h3>What happened?</h3>
              <p>Zoho returned an error during the OAuth authorization process.</p>
              <p><strong>Common causes:</strong></p>
              <ul>
                <li>You denied access to the application</li>
                <li>The redirect URI doesn't match what's configured in Zoho</li>
                <li>The authorization request was invalid</li>
              </ul>
              <h3>What to do?</h3>
              <ol>
                <li>Make sure the redirect URI in Zoho Developer Console matches: <code>http://localhost:3001/api/zoho/callback</code></li>
                <li>Try the OAuth flow again: <a href="/api/zoho/auth?tenant_id=63107b06-938e-4ce6-b0f3-520a87db397b">Start OAuth Flow</a></li>
                <li>If you denied access, make sure to click "Allow" or "Authorize" when prompted</li>
              </ol>
            </div>
          </body>
        </html>
      `);
    }

    // Check if authorization code is missing or invalid type
    if (!code || typeof code !== 'string') {
      console.error('[Zoho Routes] Authorization code is missing or invalid. Query params:', req.query);
      return res.status(400).send(`
        <html>
          <head>
            <title>Authorization Code Missing</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .error { background: #fee; border: 1px solid #fcc; padding: 15px; border-radius: 5px; }
              .info { background: #eef; border: 1px solid #ccf; padding: 15px; border-radius: 5px; margin-top: 20px; }
              h1 { color: #c00; }
              code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
            </style>
          </head>
          <body>
            <h1>❌ Authorization Code Missing</h1>
            <div class="error">
              <p>The OAuth callback was received but no authorization code was provided.</p>
            </div>
            <div class="info">
              <h3>What happened?</h3>
              <p>Zoho redirected back to the callback URL, but didn't include an authorization code.</p>
              <p><strong>Common causes:</strong></p>
              <ul>
                <li>You accessed the callback URL directly (without going through OAuth)</li>
                <li>The redirect URI doesn't match exactly what's configured in Zoho</li>
                <li>Zoho encountered an error but didn't include error parameters</li>
                <li>The authorization was denied or cancelled</li>
              </ul>
              <h3>What to do?</h3>
              <ol>
                <li>Make sure you're starting the OAuth flow from: <code>/api/zoho/auth?tenant_id=YOUR_TENANT_ID</code></li>
                <li>Verify the redirect URI in Zoho Developer Console matches exactly: <code>http://localhost:3001/api/zoho/callback</code></li>
                <li>Try the OAuth flow again and make sure to click "Allow" or "Authorize"</li>
                <li>Check the browser console and server logs for more details</li>
              </ol>
              <p><strong>Debug Info:</strong></p>
              <pre style="background: #f5f5f5; padding: 10px; border-radius: 3px; overflow-x: auto;">${JSON.stringify(req.query, null, 2)}</pre>
            </div>
          </body>
        </html>
      `);
    }

    // Ensure code is a string
    const authCode = typeof code === 'string' ? code : Array.isArray(code) ? String(code[0]) : String(code);
    if (!authCode) {
      return res.status(400).json({ error: 'Invalid authorization code' });
    }

    // Decode state to get tenant_id
    let tenantId: string;
    try {
      const stateString: string = typeof state === 'string' 
        ? state 
        : Array.isArray(state) 
          ? String(state[0]) 
          : String(state);
      if (!stateString) {
        return res.status(400).json({ error: 'Invalid state parameter' });
      }
      const stateData = JSON.parse(Buffer.from(stateString, 'base64').toString());
      tenantId = stateData.tenant_id;
    } catch {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    // Exchange authorization code for tokens
    try {
      // Load tenant-specific credentials (or fall back to global)
      const clientId = await zohoCredentials.getClientIdForTenant(tenantId);
      const clientSecret = await zohoCredentials.getClientSecretForTenant(tenantId);
      const redirectUri = await zohoCredentials.getRedirectUriForTenant(tenantId);
      const region = await zohoCredentials.getRegionForTenant(tenantId);

      // Determine token endpoint based on region
      let tokenEndpoint = 'https://accounts.zoho.com/oauth/v2/token';
      if (region === 'eu') {
        tokenEndpoint = 'https://accounts.zoho.eu/oauth/v2/token';
      } else if (region === 'in') {
        tokenEndpoint = 'https://accounts.zoho.in/oauth/v2/token';
      } else if (region === 'au') {
        tokenEndpoint = 'https://accounts.zoho.com.au/oauth/v2/token';
      } else if (region === 'jp') {
        tokenEndpoint = 'https://accounts.zoho.jp/oauth/v2/token';
      }

      console.log(`[Zoho Routes] ========================================`);
      console.log(`[Zoho Routes] TOKEN EXCHANGE STARTING`);
      console.log(`[Zoho Routes] Using token endpoint: ${tokenEndpoint} for region: ${region}`);
      console.log(`[Zoho Routes] Token exchange params:`, {
        grant_type: 'authorization_code',
        client_id: clientId.substring(0, 15) + '...',
        redirect_uri: redirectUri,
        code: authCode.substring(0, 20) + '...',
      });
      console.log(`[Zoho Routes] Full client_id: ${clientId}`);
      console.log(`[Zoho Routes] Full redirect_uri: ${redirectUri}`);
      console.log(`[Zoho Routes] ========================================`);

      let tokenResponse;
      try {
        tokenResponse = await axios.post(
          tokenEndpoint,
          null,
          {
            params: {
              grant_type: 'authorization_code',
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              code: authCode,
            },
          }
        );
      } catch (axiosError: any) {
        console.error(`[Zoho Routes] ❌ Axios request failed:`, {
          message: axiosError.message,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: axiosError.response?.data,
        });
        throw axiosError;
      }

      console.log(`[Zoho Routes] ✅ Token response received`);
      console.log(`[Zoho Routes] Token response status:`, tokenResponse.status);
      console.log(`[Zoho Routes] Token response data:`, JSON.stringify(tokenResponse.data, null, 2));

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      if (!access_token || !refresh_token) {
        console.error(`[Zoho Routes] Missing tokens in response:`, {
          hasAccessToken: !!access_token,
          hasRefreshToken: !!refresh_token,
          responseData: tokenResponse.data,
        });
        throw new Error('Failed to obtain tokens from Zoho');
      }

      // Store tokens
      await zohoService.storeTokens(tenantId, access_token, refresh_token, expires_in);

      // Redirect to success page with postMessage to parent window
      res.send(`
        <html>
          <head>
            <title>Zoho Integration Success</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                max-width: 500px;
                margin: 50px auto;
                padding: 20px;
                text-align: center;
              }
              .success {
                background: #d4edda;
                border: 1px solid #c3e6cb;
                color: #155724;
                padding: 20px;
                border-radius: 5px;
                margin: 20px 0;
              }
              .info {
                color: #666;
                font-size: 14px;
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <div class="success">
              <h1>✅ Zoho Integration Successful!</h1>
              <p>Your Zoho Invoice account has been connected successfully.</p>
              <p class="info">This window will close automatically...</p>
            </div>
            <script>
              // Notify parent window that OAuth completed
              if (window.opener) {
                window.opener.postMessage({ type: 'ZOHO_OAUTH_SUCCESS', tenantId: '${tenantId}' }, '*');
              }
              
              // Close window after 2 seconds
              setTimeout(() => {
                window.close();
              }, 2000);
            </script>
          </body>
        </html>
      `);
    } catch (tokenError: any) {
      // Handle token exchange errors
      console.error('[Zoho Routes] Token exchange error:', tokenError);
      
      let errorMessage = 'Failed to exchange authorization code for tokens';
      let errorDetails = tokenError.message;
      
      // Check if it's an Axios error with response data
      if (tokenError.response) {
        console.error('[Zoho Routes] Zoho API error response:', {
          status: tokenError.response.status,
          data: tokenError.response.data,
        });
        errorDetails = JSON.stringify(tokenError.response.data, null, 2);
        errorMessage = tokenError.response.data?.error || errorMessage;
      }

      return res.status(400).send(`
        <html>
          <head>
            <title>Zoho Token Exchange Failed</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 700px; margin: 50px auto; padding: 20px; }
              .error { background: #fee; border: 1px solid #fcc; padding: 15px; border-radius: 5px; }
              .details { background: #f5f5f5; padding: 10px; border-radius: 3px; margin-top: 10px; overflow-x: auto; }
              h1 { color: #c00; }
              pre { white-space: pre-wrap; word-wrap: break-word; }
            </style>
          </head>
          <body>
            <h1>❌ Token Exchange Failed</h1>
            <div class="error">
              <p><strong>Error:</strong> ${errorMessage}</p>
              <div class="details">
                <pre>${errorDetails}</pre>
              </div>
            </div>
            <p><a href="javascript:window.close()">Close Window</a></p>
          </body>
        </html>
      `);
    }
  } catch (error: any) {
    console.error('[Zoho Routes] Callback error:', error);
    res.status(500).send(`
      <html>
        <head><title>Zoho Integration Error</title></head>
        <body>
          <h1>❌ Zoho Integration Failed</h1>
          <p>Error: ${error.message || 'Unknown error'}</p>
          <p>Please try again or contact support.</p>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/zoho/status
 * Check Zoho integration status for a tenant
 */
router.get('/status', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const client = await pool.connect();
    try {
      const tokenResult = await client.query(
        `SELECT 
          id,
          tenant_id,
          expires_at,
          created_at,
          updated_at,
          CASE 
            WHEN expires_at > now() THEN 'active'
            ELSE 'expired'
          END as status
        FROM zoho_tokens 
        WHERE tenant_id = $1`,
        [tenantId]
      );

      if (tokenResult.rows.length === 0) {
        return res.json({
          connected: false,
          message: 'Zoho not connected',
        });
      }

      const token = tokenResult.rows[0];
      return res.json({
        connected: true,
        status: token.status,
        expires_at: token.expires_at,
        created_at: token.created_at,
        updated_at: token.updated_at,
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[Zoho Routes] Status check error:', error);
    res.status(500).json({ error: error.message || 'Failed to check status' });
  }
});

/**
 * POST /api/zoho/disconnect
 * Disconnect Zoho integration for a tenant
 */
router.post('/disconnect', async (req, res) => {
  try {
    const { tenant_id } = req.body;
    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const client = await pool.connect();
    try {
      await client.query(
        `DELETE FROM zoho_tokens WHERE tenant_id = $1`,
        [tenant_id]
      );

      res.json({
        success: true,
        message: 'Zoho integration disconnected successfully',
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[Zoho Routes] Disconnect error:', error);
    res.status(500).json({ error: error.message || 'Failed to disconnect' });
  }
});

/**
 * POST /api/zoho/test-invoice
 * Test invoice creation (for testing purposes)
 */
router.post('/test-invoice', async (req, res) => {
  try {
    const { tenant_id, booking_id } = req.body;

    if (!tenant_id || !booking_id) {
      return res.status(400).json({ error: 'tenant_id and booking_id are required' });
    }

    const result = await zohoService.generateReceipt(booking_id);

    if (result.success) {
      res.json({
        success: true,
        invoice_id: result.invoiceId,
        message: 'Test invoice created successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error('[Zoho Routes] Test invoice error:', error);
    res.status(500).json({ error: error.message || 'Failed to create test invoice' });
  }
});

/**
 * GET /api/zoho/invoices/:invoiceId/download
 * Download invoice PDF (for customers)
 * Supports both Authorization header and token query parameter for flexibility
 */
router.get('/invoices/:invoiceId/download', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const token = req.query.token as string || req.headers.authorization?.replace('Bearer ', '');
    
    console.log(`[Zoho Routes] Download request for invoice: ${invoiceId}`);
    
    if (!invoiceId) {
      console.error('[Zoho Routes] Invoice ID missing');
      return res.status(400).json({ error: 'Invoice ID is required' });
    }

    // Optional: Validate token if provided (for security)
    // For now, we'll allow downloads without strict auth since invoices are already public to customers
    
    // Get tenant_id from booking (need to find booking by zoho_invoice_id)
    const bookingResult = await query(
      `SELECT tenant_id FROM bookings WHERE zoho_invoice_id = $1 LIMIT 1`,
      [invoiceId]
    );

    if (bookingResult.rows.length === 0) {
      console.error(`[Zoho Routes] Invoice not found in database: ${invoiceId}`);
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const tenantId = bookingResult.rows[0].tenant_id;
    console.log(`[Zoho Routes] Found tenant_id: ${tenantId} for invoice: ${invoiceId}`);

    // Download PDF from Zoho
    console.log(`[Zoho Routes] Downloading PDF from Zoho for invoice: ${invoiceId}`);
    const pdfBuffer = await zohoService.downloadInvoicePdf(tenantId, invoiceId);
    console.log(`[Zoho Routes] PDF downloaded successfully, size: ${pdfBuffer.length} bytes`);

    // Set CORS headers (must be set before sending response)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());

    // Send PDF buffer
    res.send(pdfBuffer);
    console.log(`[Zoho Routes] PDF sent successfully`);
  } catch (error: any) {
    console.error('[Zoho Routes] Download invoice error:', error);
    console.error('[Zoho Routes] Error stack:', error.stack);
    
    // Set CORS headers even for errors
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    res.status(500).json({ 
      error: error.message || 'Failed to download invoice',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * OPTIONS /api/zoho/invoices/:invoiceId/download
 * Handle CORS preflight for invoice download
 */
router.options('/invoices/:invoiceId/download', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.sendStatus(200);
});

export { router as zohoRoutes };

