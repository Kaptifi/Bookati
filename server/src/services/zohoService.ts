import axios, { AxiosInstance, AxiosError } from 'axios';
import { query, pool } from '../db';
import dotenv from 'dotenv';
import { zohoCredentials } from '../config/zohoCredentials';

dotenv.config();

interface ZohoToken {
  id: string;
  tenant_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
}

interface ZohoInvoiceData {
  customer_name: string;
  customer_email?: string; // Optional - invoices can be created without email
  customer_phone?: string; // Optional - for WhatsApp delivery
  line_items: Array<{
    name: string;
    description?: string;
    rate: number;
    quantity: number;
    unit?: string;
  }>;
  date: string;
  due_date?: string;
  currency_code: string;
  notes?: string;
  custom_fields?: Record<string, any>;
}

interface ZohoInvoiceResponse {
  invoice: {
    invoice_id: string;
    invoice_number: string;
    status: string;
  };
  code: number;
  message: string;
}

class ZohoService {
  private apiBaseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private scope: string;

  constructor() {
    this.apiBaseUrl = process.env.ZOHO_API_BASE_URL || 'https://invoice.zoho.com/api/v3';
    
    // Load credentials securely from environment variables or self_client.json
    // Priority: Environment variables > self_client.json file
    try {
      this.clientId = zohoCredentials.getClientId();
      this.clientSecret = zohoCredentials.getClientSecret();
      this.redirectUri = zohoCredentials.getRedirectUri();
      this.scope = zohoCredentials.getScope().join(',');
    } catch (error: any) {
      console.error('[ZohoService] ❌ Failed to load credentials:', error.message);
      // Set empty strings to fail gracefully on first API call
      this.clientId = '';
      this.clientSecret = '';
      this.redirectUri = process.env.ZOHO_REDIRECT_URI || 'http://localhost:3001/api/zoho/callback';
      this.scope = process.env.ZOHO_SCOPE || 'ZohoInvoice.invoices.CREATE,ZohoInvoice.invoices.READ,ZohoInvoice.invoices.UPDATE';
    }
  }

  /**
   * Get or refresh access token for a tenant
   */
  async getAccessToken(tenantId: string): Promise<string> {
    const client = await pool.connect();
    try {
      // Get existing token
      const tokenResult = await client.query(
        `SELECT * FROM zoho_tokens WHERE tenant_id = $1`,
        [tenantId]
      );

      if (tokenResult.rows.length === 0) {
        throw new Error(`No Zoho token found for tenant ${tenantId}. Please complete OAuth flow first.`);
      }

      const token: ZohoToken = tokenResult.rows[0];

      // Check if token is expired (with 5 minute buffer)
      const expiresAt = new Date(token.expires_at);
      const now = new Date();
      const buffer = 5 * 60 * 1000; // 5 minutes

      if (expiresAt.getTime() - now.getTime() < buffer) {
        console.log(`[ZohoService] Token expired or expiring soon, refreshing for tenant ${tenantId}...`);
        return await this.refreshAccessToken(tenantId, token.refresh_token);
      }

      return token.access_token;
    } finally {
      client.release();
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(tenantId: string, refreshToken: string): Promise<string> {
    try {
      // Use tenant-specific credentials (or fall back to global)
      const clientId = await zohoCredentials.getClientIdForTenant(tenantId);
      const clientSecret = await zohoCredentials.getClientSecretForTenant(tenantId);

      // Determine token endpoint based on API base URL region
      // Extract region from apiBaseUrl (e.g., invoice.zoho.com -> accounts.zoho.com)
      let tokenEndpoint = 'https://accounts.zoho.com/oauth/v2/token';
      if (this.apiBaseUrl.includes('.zoho.eu')) {
        tokenEndpoint = 'https://accounts.zoho.eu/oauth/v2/token';
      } else if (this.apiBaseUrl.includes('.zoho.in')) {
        tokenEndpoint = 'https://accounts.zoho.in/oauth/v2/token';
      } else if (this.apiBaseUrl.includes('.zoho.com.au')) {
        tokenEndpoint = 'https://accounts.zoho.com.au/oauth/v2/token';
      } else if (this.apiBaseUrl.includes('.zoho.com.cn')) {
        tokenEndpoint = 'https://accounts.zoho.com.cn/oauth/v2/token';
      }
      // Default to .com for US and other regions

      console.log(`[ZohoService] Refreshing token using endpoint: ${tokenEndpoint}`);

      const response = await axios.post(
        tokenEndpoint,
        null,
        {
          params: {
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
          },
        }
      );

      const { access_token, expires_in, refresh_token: newRefreshToken } = response.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      // Update token in database
      // Note: Zoho may or may not return a new refresh_token
      // If provided, update it; otherwise keep the existing one
      const client = await pool.connect();
      try {
        if (newRefreshToken) {
          // New refresh token provided - update both
          await client.query(
            `UPDATE zoho_tokens 
             SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = now()
             WHERE tenant_id = $4`,
            [access_token, newRefreshToken, expiresAt, tenantId]
          );
          console.log(`[ZohoService] Token refreshed successfully (new refresh token received) for tenant ${tenantId}`);
        } else {
          // No new refresh token - only update access token
          await client.query(
            `UPDATE zoho_tokens 
             SET access_token = $1, expires_at = $2, updated_at = now()
             WHERE tenant_id = $3`,
            [access_token, expiresAt, tenantId]
          );
          console.log(`[ZohoService] Token refreshed successfully (using existing refresh token) for tenant ${tenantId}`);
        }
      } finally {
        client.release();
      }

      return access_token;
    } catch (error: any) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        const errorData = axiosError.response.data as any;
        console.error(`[ZohoService] Token refresh failed for tenant ${tenantId}:`, {
          status: axiosError.response.status,
          code: errorData?.code,
          message: errorData?.message || errorData?.error || error.message,
          data: errorData,
        });
        
        // Check for specific error codes
        if (errorData?.code === 'INVALID_REFRESH_TOKEN' || errorData?.error === 'invalid_grant') {
          throw new Error('Refresh token is invalid or expired. Please re-authenticate Zoho.');
        }
      } else {
        console.error(`[ZohoService] Token refresh failed for tenant ${tenantId}:`, error.message);
      }
      throw new Error(`Failed to refresh Zoho token: ${error.message}`);
    }
  }

  /**
   * Store OAuth tokens after authorization
   */
  async storeTokens(tenantId: string, accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO zoho_tokens (tenant_id, access_token, refresh_token, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id) 
         DO UPDATE SET 
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           expires_at = EXCLUDED.expires_at,
           updated_at = now()`,
        [tenantId, accessToken, refreshToken, expiresAt]
      );
      console.log(`[ZohoService] Tokens stored for tenant ${tenantId}`);
    } finally {
      client.release();
    }
  }

  /**
   * Create or get customer/contact in Zoho
   * Zoho Invoice requires customers to exist before creating invoices
   */
  async getOrCreateCustomer(tenantId: string, customerName: string, customerEmail?: string): Promise<string> {
    const accessToken = await this.getAccessToken(tenantId);
    
    try {
      // First, try to find existing customer by email (if provided)
      let searchResponse: any = null;
      
      if (customerEmail) {
        console.log(`[ZohoService] Searching for customer by email: ${customerEmail}`);
        searchResponse = await axios.get(
          `${this.apiBaseUrl}/contacts`,
          {
            params: {
              search_text: customerEmail,
            },
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      // If not found by email (or email not provided), try searching by name
      if (!searchResponse || !searchResponse.data?.contacts || searchResponse.data.contacts.length === 0) {
        console.log(`[ZohoService] Not found by email, searching by name: ${customerName}`);
        searchResponse = await axios.get(
          `${this.apiBaseUrl}/contacts`,
          {
            params: {
              search_text: customerName,
            },
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      // If customer exists, return their contact_id
      if (searchResponse.data?.contacts && searchResponse.data.contacts.length > 0) {
        const existingCustomer = searchResponse.data.contacts.find(
          (c: any) => 
            (customerEmail && c.email && c.email.toLowerCase() === customerEmail.toLowerCase()) || 
            (c.contact_name && c.contact_name.toLowerCase() === customerName.toLowerCase())
        );
        if (existingCustomer) {
          console.log(`[ZohoService] ✅ Found existing customer: ${existingCustomer.contact_id} (${existingCustomer.contact_name})`);
          return existingCustomer.contact_id;
        }
      }

      // Customer doesn't exist, create new one
      console.log(`[ZohoService] Creating new customer: ${customerName}${customerEmail ? ` (${customerEmail})` : ' (no email)'}`);
      const createPayload: any = {
        contact_name: customerName,
        contact_type: 'customer',
      };
      
      // Only include email if provided
      if (customerEmail) {
        createPayload.email = customerEmail;
      }
      
      console.log('[ZohoService] Customer creation payload:', JSON.stringify(createPayload, null, 2));
      
      const createResponse = await axios.post(
        `${this.apiBaseUrl}/contacts`,
        createPayload,
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('[ZohoService] Customer creation response:', JSON.stringify(createResponse.data, null, 2));

      if (createResponse.data?.contact?.contact_id) {
        console.log(`[ZohoService] ✅ Created new customer: ${createResponse.data.contact.contact_id}`);
        return createResponse.data.contact.contact_id;
      }

      // Check for error in response
      if (createResponse.data?.code && createResponse.data.code !== 0) {
        // If customer already exists error, try to find them again
        if (createResponse.data.code === 3062 || createResponse.data.message?.includes('already exists')) {
          console.log(`[ZohoService] Customer already exists, searching again...`);
          // Search more broadly - get all contacts and find by name
          const allContactsResponse = await axios.get(
            `${this.apiBaseUrl}/contacts`,
            {
              params: {
                page: 1,
                per_page: 200, // Get more results
              },
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (allContactsResponse.data?.contacts) {
            const found = allContactsResponse.data.contacts.find(
              (c: any) => 
                (c.contact_name && c.contact_name.toLowerCase() === customerName.toLowerCase()) ||
                (c.email && c.email.toLowerCase() === customerEmail.toLowerCase())
            );
            if (found) {
              console.log(`[ZohoService] ✅ Found existing customer after 'already exists' error: ${found.contact_id}`);
              return found.contact_id;
            }
          }
        }
        throw new Error(`Zoho API error: ${createResponse.data.message || JSON.stringify(createResponse.data)}`);
      }

      throw new Error('Failed to create customer: No contact_id in response: ' + JSON.stringify(createResponse.data));
    } catch (error: any) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        // Handle "already exists" error by searching again
        const errorData = axiosError.response.data as any;
        if (errorData?.code === 3062 || errorData?.message?.includes('already exists')) {
          console.log(`[ZohoService] Customer already exists error, searching for existing customer...`);
          try {
            // Search by name
            const searchResponse = await axios.get(
              `${this.apiBaseUrl}/contacts`,
              {
                params: {
                  search_text: customerName,
                },
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            
            if (searchResponse.data?.contacts && searchResponse.data.contacts.length > 0) {
              const found = searchResponse.data.contacts.find(
                (c: any) => 
                  (c.contact_name && c.contact_name.toLowerCase() === customerName.toLowerCase()) ||
                  (c.email && c.email.toLowerCase() === customerEmail.toLowerCase())
              );
              if (found) {
                console.log(`[ZohoService] ✅ Found existing customer after error: ${found.contact_id}`);
                return found.contact_id;
              }
            }
          } catch (searchError) {
            // Ignore search error, throw original
          }
        }
        
        console.error('[ZohoService] Customer creation/fetch failed:', {
          status: axiosError.response.status,
          data: axiosError.response.data,
        });
        throw new Error(`Failed to get/create customer: ${JSON.stringify(axiosError.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Create invoice in Zoho
   */
  async createInvoice(tenantId: string, invoiceData: ZohoInvoiceData): Promise<ZohoInvoiceResponse> {
    const accessToken = await this.getAccessToken(tenantId);

    // Get or create customer first - REQUIRED for Zoho Invoice
    // Zoho Invoice does not auto-create customers, so we must create them first
    console.log(`[ZohoService] Getting or creating customer: ${invoiceData.customer_name} (${invoiceData.customer_email})`);
    const customerId = await this.getOrCreateCustomer(tenantId, invoiceData.customer_name, invoiceData.customer_email);
    
    if (!customerId) {
      throw new Error('Failed to get or create customer: No customer_id returned');
    }

    // Build payload according to Zoho Invoice API format
    // Zoho Invoice requires customer_id, not customer_name/customer_email
    const payload: any = {
      customer_id: customerId, // REQUIRED: Zoho Invoice requires customer_id
      line_items: invoiceData.line_items.map(item => ({
        name: item.name,
        description: item.description || '',
        rate: item.rate,
        quantity: item.quantity,
        unit: item.unit || 'ticket',
      })),
      date: invoiceData.date,
      due_date: invoiceData.due_date || invoiceData.date,
      currency_code: invoiceData.currency_code || 'SAR',
      status: 'sent', // CRITICAL: Set status to 'sent' so invoice can be emailed (not 'draft')
    };
    
    // Add notes if provided
    if (invoiceData.notes) {
      payload.notes = invoiceData.notes;
    }
    
    // Log payload for debugging (remove sensitive data in production)
    console.log('[ZohoService] Invoice payload:', JSON.stringify({ ...payload, customer_email: '***' }, null, 2));
    console.log('[ZohoService] ⚠️  Creating invoice with status: "sent" (not draft) - this allows email sending');

    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/invoices`,
        payload,
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const responseData = response.data;
      
      // Verify invoice status - if still draft, mark as sent
      if (responseData.invoice) {
        const invoiceStatus = responseData.invoice.status || responseData.invoice.invoice_status;
        console.log(`[ZohoService] Invoice created - Status: ${invoiceStatus}`);
        console.log(`[ZohoService] Invoice ID: ${responseData.invoice.invoice_id}`);
        
        // If invoice was created as draft (even though we requested 'sent'), mark it as sent
        if (invoiceStatus && (invoiceStatus.toLowerCase() === 'draft' || invoiceStatus.toLowerCase() === 'd')) {
          console.log(`[ZohoService] ⚠️  Invoice created as draft, marking as sent...`);
          try {
            await this.markInvoiceAsSent(tenantId, responseData.invoice.invoice_id);
            console.log(`[ZohoService] ✅ Invoice marked as sent`);
          } catch (markError: any) {
            console.error(`[ZohoService] ⚠️  Failed to mark invoice as sent: ${markError.message}`);
            // Continue - we'll try to send email anyway
          }
        } else {
          console.log(`[ZohoService] ✅ Invoice created with status: ${invoiceStatus} (ready for email)`);
        }
      }

      return responseData;
    } catch (error: any) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        console.error('[ZohoService] Invoice creation failed:', {
          status: axiosError.response.status,
          data: axiosError.response.data,
        });
        throw new Error(`Zoho API error: ${JSON.stringify(axiosError.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Mark invoice as sent in Zoho
   * This is required if invoice was created as draft
   * Tries multiple methods to ensure invoice is marked as sent
   */
  async markInvoiceAsSent(tenantId: string, invoiceId: string): Promise<void> {
    const accessToken = await this.getAccessToken(tenantId);

    try {
      console.log(`[ZohoService] Marking invoice ${invoiceId} as sent...`);
      
      // Method 1: Try mark-as-sent endpoint
      try {
        const response = await axios.post(
          `${this.apiBaseUrl}/invoices/${invoiceId}/mark-as-sent`,
          {},
          {
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const responseData = response.data as any;
        if (responseData.code === 0 || responseData.invoice) {
          console.log(`[ZohoService] ✅ Invoice ${invoiceId} marked as sent via mark-as-sent endpoint`);
          return;
        }
      } catch (markError: any) {
        // If mark-as-sent doesn't work, try status update
        if (markError.response?.status === 404 || markError.response?.status === 405) {
          console.log(`[ZohoService] Mark-as-sent endpoint not available, trying status update...`);
        } else {
          throw markError;
        }
      }

      // Method 2: Update invoice status directly
      const updateResponse = await axios.put(
        `${this.apiBaseUrl}/invoices/${invoiceId}`,
        { 
          status: 'sent',
          invoice_status: 'sent' // Try both field names
        },
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const updateData = updateResponse.data as any;
      if (updateData.code === 0 || updateData.invoice) {
        console.log(`[ZohoService] ✅ Invoice ${invoiceId} status updated to 'sent'`);
      } else {
        console.warn(`[ZohoService] ⚠️  Status update returned code: ${updateData.code}`);
      }
    } catch (error: any) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        const errorData = axiosError.response.data as any;
        console.error(`[ZohoService] Failed to mark invoice as sent:`, {
          status: axiosError.response.status,
          code: errorData?.code,
          message: errorData?.message || errorData?.error,
        });
        // Don't throw - email might still work even if status is draft
        console.log(`[ZohoService] ⚠️  Continuing with email send attempt (invoice may be in draft status)`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Send invoice via email through Zoho
   * Ensures invoice is sent via email with retry logic
   * Note: Invoice should be in 'sent' status, but we'll try even if it's draft
   */
  async sendInvoiceEmail(tenantId: string, invoiceId: string, customerEmail: string, retryCount: number = 0): Promise<void> {
    const MAX_RETRIES = 2;
    const accessToken = await this.getAccessToken(tenantId);

    // Validate email format before sending
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      throw new Error(`Invalid email format: ${customerEmail}`);
    }

    try {
      console.log(`[ZohoService] 📧 Sending invoice ${invoiceId} to ${customerEmail} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`);
      
      const response = await axios.post(
        `${this.apiBaseUrl}/invoices/${invoiceId}/email`,
        {
          send_from_org_email_id: true,
          to_mail_ids: [customerEmail.trim()], // Ensure email is trimmed
        },
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      // Check response for success
      const responseData = response.data as any;
      if (responseData.code === 0) {
        console.log(`[ZohoService] ✅ Invoice ${invoiceId} sent to ${customerEmail}`);
        console.log(`[ZohoService]    Zoho response: ${responseData.message || 'Email sent successfully'}`);
        if (responseData.is_first_email !== undefined) {
          console.log(`[ZohoService]    Is first email: ${responseData.is_first_email}`);
        }
        return; // Success - exit function
      } else {
        console.warn(`[ZohoService] ⚠️  Email API returned non-zero code: ${responseData.code}`);
        console.warn(`[ZohoService]    Message: ${responseData.message || 'Unknown'}`);
        
        // If non-zero code but not a critical error, retry
        if (retryCount < MAX_RETRIES && responseData.code !== 1025) {
          console.log(`[ZohoService] 🔄 Retrying email send (${retryCount + 1}/${MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
          return this.sendInvoiceEmail(tenantId, invoiceId, customerEmail, retryCount + 1);
        }
        
        // Don't throw error for non-zero codes - Zoho might still send the email
        // But log it as a warning
        if (responseData.code === 1025) {
          throw new Error(`Failed to send invoice email: Your Zoho account mobile number is not verified. Please verify it at https://accounts.zoho.com/ → Security → Mobile Number. Error: ${responseData.message}`);
        }
      }
    } catch (error: any) {
      const axiosError = error as AxiosError;
      
      // Retry on network errors or 5xx errors
      if (retryCount < MAX_RETRIES && (
        !axiosError.response || 
        (axiosError.response.status >= 500 && axiosError.response.status < 600)
      )) {
        console.warn(`[ZohoService] ⚠️  Email send failed (attempt ${retryCount + 1}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
        return this.sendInvoiceEmail(tenantId, invoiceId, customerEmail, retryCount + 1);
      }
      
      if (axiosError.response) {
        const errorData = axiosError.response.data as any;
        console.error('[ZohoService] Email sending failed:', {
          status: axiosError.response.status,
          code: errorData?.code,
          message: errorData?.message || errorData?.error,
          data: axiosError.response.data,
        });
        
        // Check for specific error codes
        if (errorData?.code === 1025) {
          // Mobile number not verified
          throw new Error(`Failed to send invoice email: Your Zoho account mobile number is not verified. Please verify it at https://accounts.zoho.com/ → Security → Mobile Number. Error: ${errorData.message}`);
        }
        
        throw new Error(`Failed to send invoice email: ${JSON.stringify(errorData)}`);
      }
      throw error;
    }
  }

  /**
   * Get invoice PDF URL
   */
  async getInvoicePdfUrl(tenantId: string, invoiceId: string): Promise<string> {
    const accessToken = await this.getAccessToken(tenantId);

    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/invoices/${invoiceId}`,
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
          },
          params: {
            accept: 'pdf',
          },
        }
      );

      // Zoho returns PDF URL in response
      return response.data.invoice?.pdf_url || '';
    } catch (error: any) {
      console.error('[ZohoService] Failed to get invoice PDF:', error.message);
      throw error;
    }
  }

  /**
   * Download invoice PDF as Buffer
   */
  async downloadInvoicePdf(tenantId: string, invoiceId: string): Promise<Buffer> {
    let accessToken = await this.getAccessToken(tenantId);

    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/invoices/${invoiceId}`,
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
          },
          params: {
            accept: 'pdf',
          },
          responseType: 'arraybuffer', // Get PDF as binary data
        }
      );

      return Buffer.from(response.data);
    } catch (error: any) {
      // If 401 (Unauthorized), try refreshing token and retry once
      if (error.response?.status === 401) {
        console.log(`[ZohoService] 401 Unauthorized - refreshing token and retrying...`);
        try {
          // Get refresh token from database
          const client = await pool.connect();
          try {
            const tokenResult = await client.query(
              `SELECT refresh_token FROM zoho_tokens WHERE tenant_id = $1`,
              [tenantId]
            );
            
            if (tokenResult.rows.length > 0 && tokenResult.rows[0].refresh_token) {
              // Refresh token and retry
              accessToken = await this.refreshAccessToken(tenantId, tokenResult.rows[0].refresh_token);
              
              // Retry the request with new token
              const retryResponse = await axios.get(
                `${this.apiBaseUrl}/invoices/${invoiceId}`,
                {
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  },
                  params: {
                    accept: 'pdf',
                  },
                  responseType: 'arraybuffer',
                }
              );
              
              console.log(`[ZohoService] Retry successful after token refresh`);
              return Buffer.from(retryResponse.data);
            } else {
              throw new Error('No refresh token available');
            }
          } finally {
            client.release();
          }
        } catch (retryError: any) {
          const axiosError = retryError as AxiosError;
          console.error('[ZohoService] Failed to refresh token and retry:', retryError.message);
          
          if (axiosError.response) {
            const errorData = axiosError.response.data as any;
            console.error('[ZohoService] Retry error details:', {
              status: axiosError.response.status,
              code: errorData?.code,
              message: errorData?.message || errorData?.error,
              data: axiosError.response.data,
            });
            
            // Check for specific error codes
            if (errorData?.code === 401 || axiosError.response.status === 401) {
              // 401 after refresh suggests:
              // 1. Refresh token is invalid/expired
              // 2. Region mismatch (token from one region, API call to another)
              // 3. Token not yet propagated
              console.error('[ZohoService] ⚠️ 401 after token refresh - possible causes:');
              console.error('   1. Refresh token is invalid or expired');
              console.error('   2. Region mismatch (check ZOHO_API_BASE_URL matches your Zoho organization region)');
              console.error('   3. Organization location mismatch');
              console.error(`   Current API Base URL: ${this.apiBaseUrl}`);
              console.error(`   Please verify your Zoho organization region and set ZOHO_API_BASE_URL accordingly`);
              throw new Error(`Failed to download invoice PDF: Token refresh succeeded but API call still returns 401. This usually means: (1) Refresh token is invalid/expired, or (2) Region mismatch. Please re-authenticate Zoho and verify ZOHO_API_BASE_URL matches your organization region. Visit: http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
            }
          }
          
          // Check if it's a refresh token issue
          if (retryError.message?.includes('invalid') || retryError.message?.includes('expired')) {
            throw new Error(`Failed to download invoice PDF: Refresh token is invalid or expired. Please re-authenticate Zoho by visiting: http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
          }
          
          throw new Error(`Failed to download invoice PDF: Token refresh failed. Please re-authenticate Zoho by visiting: http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
        }
      }
      
      console.error('[ZohoService] Failed to download invoice PDF:', error.message);
      if (error.response) {
        console.error('[ZohoService] Response status:', error.response.status);
        console.error('[ZohoService] Response data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Send invoice via WhatsApp
   * Flow: Download Invoice PDF (Zoho API) → Send PDF via WhatsApp (WhatsApp API)
   */
  async sendInvoiceViaWhatsApp(tenantId: string, invoiceId: string, phoneNumber: string): Promise<void> {
    try {
      // Step 2: Download Invoice PDF from Zoho API
      console.log(`[ZohoService] 📥 Step 2: Downloading invoice PDF from Zoho API (Invoice ID: ${invoiceId})...`);
      const pdfBuffer = await this.downloadInvoicePdf(tenantId, invoiceId);
      console.log(`[ZohoService] ✅ Step 2 Complete: Invoice PDF downloaded (${(pdfBuffer.length / 1024).toFixed(2)} KB)`);
      
      // Step 3: Send PDF via WhatsApp API
      console.log(`[ZohoService] 📤 Step 3: Sending invoice PDF via WhatsApp API to ${phoneNumber}...`);
      const { sendWhatsAppDocument } = await import('./whatsappService.js');
      
      // Get tenant WhatsApp config
      const tenantResult = await query(
        'SELECT whatsapp_settings FROM tenants WHERE id = $1',
        [tenantId]
      );
      
      let whatsappConfig: any = undefined;
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
      
      // Send invoice PDF via WhatsApp API
      const result = await sendWhatsAppDocument(
        phoneNumber,
        pdfBuffer,
        `invoice_${invoiceId}.pdf`,
        'Your booking invoice is attached. Thank you for your booking!',
        whatsappConfig
      );
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send invoice via WhatsApp');
      }
      
      console.log(`[ZohoService] ✅ Step 3 Complete: Invoice PDF sent via WhatsApp API to ${phoneNumber}`);
    } catch (error: any) {
      console.error(`[ZohoService] Failed to send invoice via WhatsApp:`, error.message);
      throw error;
    }
  }

  /**
   * Map booking data to Zoho invoice format
   */
  async mapBookingToInvoice(bookingId: string): Promise<ZohoInvoiceData> {
    const client = await pool.connect();
    try {
      // Fetch booking with related data (including offer if present)
      const bookingResult = await client.query(
        `SELECT 
          b.*,
          s.name as service_name,
          s.name_ar as service_name_ar,
          s.description as service_description,
          s.description_ar as service_description_ar,
          s.base_price,
          s.child_price,
          ts.start_time,
          ts.end_time,
          ts.slot_date,
          t.name as tenant_name,
          t.name_ar as tenant_name_ar,
          o.price as offer_price,
          o.name as offer_name,
          o.name_ar as offer_name_ar
        FROM bookings b
        JOIN services s ON b.service_id = s.id
        JOIN slots ts ON b.slot_id = ts.id
        JOIN tenants t ON b.tenant_id = t.id
        LEFT JOIN service_offers o ON b.offer_id = o.id
        WHERE b.id = $1`,
        [bookingId]
      );

      if (bookingResult.rows.length === 0) {
        throw new Error(`Booking ${bookingId} not found`);
      }

      const booking = bookingResult.rows[0];
      // Default to English for invoice language
      // You can add language detection logic here if needed
      const language = 'en';

      // Determine service name based on language
      const serviceName = language === 'ar' && booking.service_name_ar
        ? booking.service_name_ar
        : booking.service_name;

      const serviceDescription = language === 'ar' && booking.service_description_ar
        ? booking.service_description_ar
        : booking.service_description;

      // Build line items
      const lineItems: ZohoInvoiceData['line_items'] = [];

      // Determine adult price: use offer price if offer exists, otherwise use base_price
      let adultPrice: number;
      if (booking.offer_id && booking.offer_price) {
        // Use offer price for adults
        adultPrice = parseFloat(booking.offer_price.toString());
        console.log(`[ZohoService] Using offer price for invoice: ${adultPrice} (Offer ID: ${booking.offer_id})`);
      } else {
        // Use base price
        adultPrice = parseFloat(booking.base_price?.toString() || '0');
      }

      // Child price always uses service child_price (offers don't affect child price)
      const childPrice = parseFloat(booking.child_price?.toString() || adultPrice.toString());

      // If adult and child pricing are different, create separate line items
      if (booking.adult_count > 0 && booking.child_count > 0 && adultPrice > 0 && childPrice > 0) {
        // Build item name - include offer name if offer is used
        let adultItemName = `${serviceName} - Adult`;
        if (booking.offer_id && booking.offer_name) {
          const offerName = language === 'ar' && booking.offer_name_ar 
            ? booking.offer_name_ar 
            : booking.offer_name;
          // Only add offer name if it's different from service name
          if (offerName !== serviceName) {
            adultItemName = `${serviceName} - ${offerName} (Adult)`;
          } else {
            adultItemName = `${serviceName} - Adult (Offer)`;
          }
        }

        if (adultPrice > 0) {
          lineItems.push({
            name: adultItemName,
            description: serviceDescription,
            rate: adultPrice,
            quantity: booking.adult_count,
            unit: 'ticket',
          });
        }

        if (childPrice > 0 && childPrice !== adultPrice) {
          lineItems.push({
            name: `${serviceName} - Child`,
            description: serviceDescription,
            rate: childPrice,
            quantity: booking.child_count,
            unit: 'ticket',
          });
        }
      } else {
        // Single line item for total price
        // Use the actual total_price from booking (which already accounts for offers)
        const totalPrice = parseFloat(booking.total_price.toString());
        
        // Build item name - include offer name if offer is used
        let itemName = serviceName;
        if (booking.offer_id && booking.offer_name) {
          const offerName = language === 'ar' && booking.offer_name_ar 
            ? booking.offer_name_ar 
            : booking.offer_name;
          // Only add offer name if it's different from service name
          if (offerName !== serviceName) {
            itemName = `${serviceName} - ${offerName}`;
          } else {
            itemName = `${serviceName} (Offer)`;
          }
        }

        lineItems.push({
          name: itemName,
          description: serviceDescription,
          rate: totalPrice,
          quantity: booking.visitor_count || 1,
          unit: 'ticket',
        });
      }

      // Format date
      const bookingDate = new Date(booking.created_at);
      const slotDate = booking.slot_date ? new Date(booking.slot_date) : bookingDate;
      
      // Invoice date (today)
      const invoiceDate = new Date();
      invoiceDate.setHours(0, 0, 0, 0);
      
      // Due date must be after invoice date (Zoho requirement)
      // Use slot date if it's in the future, otherwise use invoice date + 7 days
      let dueDate = slotDate;
      if (dueDate <= invoiceDate) {
        // If slot date is in the past or today, set due date to 7 days from now
        dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + 7);
      }

      // Build custom fields
      const customFields: Record<string, any> = {
        booking_id: booking.id,
        slot_date: slotDate.toISOString().split('T')[0],
      };

      if (booking.start_time && booking.end_time) {
        const startTime = new Date(booking.start_time);
        const endTime = new Date(booking.end_time);
        customFields.slot_time = `${startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      }

      return {
        customer_name: booking.customer_name,
        customer_email: booking.customer_email || undefined, // Optional
        customer_phone: booking.customer_phone || undefined, // For WhatsApp delivery
        line_items: lineItems,
        date: invoiceDate.toISOString().split('T')[0], // Use today's date for invoice
        due_date: dueDate.toISOString().split('T')[0], // Due date must be after invoice date
        currency_code: 'SAR',
        notes: booking.notes || `Booking ID: ${booking.id}`,
        custom_fields: customFields,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Generate and send receipt for a booking
   */
  async generateReceipt(bookingId: string): Promise<{ invoiceId: string; success: boolean; error?: string }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if invoice already exists - also get customer_email directly from booking
      const existingCheck = await client.query(
        `SELECT zoho_invoice_id, tenant_id, customer_email, customer_phone, customer_name FROM bookings WHERE id = $1`,
        [bookingId]
      );

      if (existingCheck.rows.length === 0) {
        throw new Error(`Booking ${bookingId} not found`);
      }

      const booking = existingCheck.rows[0];

      // Validate tenant_id
      if (!booking.tenant_id) {
        throw new Error(`Booking ${bookingId} has no tenant_id`);
      }

      // Map booking to invoice data (needed for delivery even if invoice exists)
      const invoiceData = await this.mapBookingToInvoice(bookingId);
      
      // IMPORTANT: Ensure we use email directly from booking if mapBookingToInvoice didn't get it
      // This ensures email is always used if available in the database
      const customerEmail = booking.customer_email || invoiceData.customer_email;
      const customerPhone = booking.customer_phone || invoiceData.customer_phone;
      
      // Update invoiceData with direct booking values (more reliable)
      if (customerEmail) {
        invoiceData.customer_email = customerEmail.trim();
      }
      if (customerPhone) {
        invoiceData.customer_phone = customerPhone.trim();
      }
      
      // Log customer contact information for debugging
      console.log(`[ZohoService] 📋 Customer contact info for invoice:`);
      console.log(`   Name: ${invoiceData.customer_name}`);
      console.log(`   Email (from booking): ${booking.customer_email || 'NULL'}`);
      console.log(`   Email (from mapped data): ${invoiceData.customer_email || 'NULL'}`);
      console.log(`   Email (final): ${invoiceData.customer_email || 'NOT PROVIDED'}`);
      console.log(`   Phone: ${invoiceData.customer_phone || 'NOT PROVIDED'}`);

      let invoiceId: string;

      // Check if invoice already exists
      if (booking.zoho_invoice_id) {
        console.log(`[ZohoService] Invoice already exists for booking ${bookingId}: ${booking.zoho_invoice_id}`);
        invoiceId = booking.zoho_invoice_id;
        console.log(`[ZohoService] ⚠️ Invoice exists, but will attempt to send via email/WhatsApp if not already sent`);
      } else {
        // Email is optional - validate format only if provided
        if (invoiceData.customer_email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(invoiceData.customer_email)) {
            throw new Error(`Invalid email format: ${invoiceData.customer_email}`);
          }
        }

        // Step 1: Create invoice in Zoho Invoice
        console.log(`[ZohoService] 📋 Step 1: Creating invoice in Zoho Invoice for booking ${bookingId}...`);
        const invoiceResponse = await this.createInvoice(booking.tenant_id, invoiceData);

        if (!invoiceResponse.invoice || !invoiceResponse.invoice.invoice_id) {
          throw new Error(`Failed to create invoice: ${invoiceResponse.message || 'Unknown error'}`);
        }

        invoiceId = invoiceResponse.invoice.invoice_id;
        console.log(`[ZohoService] ✅ Step 1 Complete: Invoice created in Zoho Invoice (ID: ${invoiceId})`);

        // Update booking with invoice ID - CRITICAL: This must succeed
        console.log(`[ZohoService] 💾 Saving invoice to database for booking ${bookingId}...`);
        const updateResult = await client.query(
          `UPDATE bookings 
           SET zoho_invoice_id = $1, zoho_invoice_created_at = now(), updated_at = now()
           WHERE id = $2
           RETURNING id, zoho_invoice_id, zoho_invoice_created_at`,
          [invoiceId, bookingId]
        );

        if (updateResult.rows.length === 0) {
          throw new Error(`Failed to update booking ${bookingId} with invoice ID ${invoiceId} - booking not found`);
        }

        if (updateResult.rows[0].zoho_invoice_id !== invoiceId) {
          throw new Error(`Invoice ID mismatch: expected ${invoiceId}, got ${updateResult.rows[0].zoho_invoice_id}`);
        }

        console.log(`[ZohoService] ✅ Invoice saved to database successfully`);
        console.log(`[ZohoService]    Booking ID: ${updateResult.rows[0].id}`);
        console.log(`[ZohoService]    Invoice ID: ${updateResult.rows[0].zoho_invoice_id}`);
        console.log(`[ZohoService]    Invoice Created At: ${updateResult.rows[0].zoho_invoice_created_at}`);

        // Log success
        await client.query(
          `INSERT INTO zoho_invoice_logs (booking_id, tenant_id, zoho_invoice_id, status, request_payload, response_payload)
           VALUES ($1, $2, $3, 'success', $4, $5)`,
          [
            bookingId,
            booking.tenant_id,
            invoiceId,
            JSON.stringify(invoiceData),
            JSON.stringify(invoiceResponse),
          ]
        );
        console.log(`[ZohoService] ✅ Invoice creation logged to zoho_invoice_logs`);
      }

      // CRITICAL: Commit transaction IMMEDIATELY after saving invoice
      // This ensures invoice is saved even if email/WhatsApp sending fails
      console.log(`[ZohoService] 💾 Committing invoice save transaction...`);
      await client.query('COMMIT');
      console.log(`[ZohoService] ✅ Invoice ${invoiceId} saved and transaction committed`);
      console.log(`[ZohoService] ⚠️  Email/WhatsApp errors will NOT affect invoice save from this point`);

      // Send invoice via email (if email is provided)
      // ENSURE EMAIL IS ALWAYS SENT WHEN AVAILABLE
      // Note: Errors here won't rollback the transaction since it's already committed
      console.log(`[ZohoService] ========================================`);
      console.log(`[ZohoService] EMAIL DELIVERY PROCESS STARTING`);
      console.log(`[ZohoService] ========================================`);
      console.log(`[ZohoService] 🔍 Email extraction debug:`);
      console.log(`   booking.customer_email (raw): ${booking.customer_email || 'NULL'}`);
      console.log(`   booking.customer_email (type): ${typeof booking.customer_email}`);
      console.log(`   invoiceData.customer_email (raw): ${invoiceData.customer_email || 'NULL'}`);
      console.log(`   invoiceData.customer_email (type): ${typeof invoiceData.customer_email}`);
      
      // Get email from multiple sources to ensure we don't miss it
      let emailToSend: string | null = null;
      
      // Priority 1: Direct from booking (most reliable)
      if (booking.customer_email && typeof booking.customer_email === 'string') {
        const trimmed = booking.customer_email.trim();
        if (trimmed.length > 0) {
          emailToSend = trimmed;
          console.log(`[ZohoService] ✅ Email found in booking: "${emailToSend}"`);
        }
      }
      
      // Priority 2: From invoiceData (fallback)
      if (!emailToSend && invoiceData.customer_email && typeof invoiceData.customer_email === 'string') {
        const trimmed = invoiceData.customer_email.trim();
        if (trimmed.length > 0) {
          emailToSend = trimmed;
          console.log(`[ZohoService] ✅ Email found in invoiceData: "${emailToSend}"`);
        }
      }
      
      console.log(`[ZohoService] 📧 Final email to send: ${emailToSend || 'NOT FOUND'}`);
      
      if (emailToSend && emailToSend.length > 0) {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValidFormat = emailRegex.test(emailToSend);
        
        console.log(`[ZohoService] 🔍 Email validation:`);
        console.log(`   Email: "${emailToSend}"`);
        console.log(`   Length: ${emailToSend.length}`);
        console.log(`   Valid format: ${isValidFormat ? '✅ YES' : '❌ NO'}`);
        
        if (!isValidFormat) {
          console.error(`[ZohoService] ❌ Invalid email format: "${emailToSend}" - skipping email delivery`);
        } else {
          console.log(`[ZohoService] 📧 Attempting to send invoice via email to ${emailToSend}...`);
          console.log(`[ZohoService]    Invoice ID: ${invoiceId}`);
          console.log(`[ZohoService]    Tenant ID: ${booking.tenant_id}`);
          
          try {
            await this.sendInvoiceEmail(booking.tenant_id, invoiceId, emailToSend);
            console.log(`[ZohoService] ✅ Invoice sent via email to ${emailToSend}`);
            
            // Log successful email delivery
            try {
              await client.query(
                `INSERT INTO zoho_invoice_logs (booking_id, tenant_id, zoho_invoice_id, status, request_payload, response_payload)
                 VALUES ($1, $2, $3, 'email_sent', $4, $5)
                 ON CONFLICT DO NOTHING`,
                [
                  bookingId,
                  booking.tenant_id,
                  invoiceId,
                  JSON.stringify({ email: emailToSend, delivery_method: 'email', invoice_id: invoiceId }),
                  JSON.stringify({ success: true, sent_at: new Date().toISOString() }),
                ]
              );
              console.log(`[ZohoService] ✅ Email delivery logged to database`);
            } catch (logError: any) {
              console.error(`[ZohoService] ⚠️  Failed to log email delivery: ${logError.message}`);
            }
          } catch (emailError: any) {
            console.error(`[ZohoService] ❌ Failed to send invoice email: ${emailError.message}`);
            console.error(`[ZohoService]    Error type: ${emailError.constructor.name}`);
            console.error(`[ZohoService]    Error details:`, emailError.response?.data || emailError.stack);
            
            // Log email failure
            try {
              await client.query(
                `INSERT INTO zoho_invoice_logs (booking_id, tenant_id, zoho_invoice_id, status, error_message, request_payload)
                 VALUES ($1, $2, $3, 'email_failed', $4, $5)
                 ON CONFLICT DO NOTHING`,
                [
                  bookingId,
                  booking.tenant_id,
                  invoiceId,
                  emailError.message,
                  JSON.stringify({ 
                    email: emailToSend, 
                    delivery_method: 'email',
                    invoice_id: invoiceId,
                    error_type: emailError.constructor.name,
                    error_data: emailError.response?.data || null
                  }),
                ]
              );
              console.log(`[ZohoService] ✅ Email failure logged to database`);
            } catch (logError: any) {
              console.error(`[ZohoService] ⚠️  Failed to log email failure: ${logError.message}`);
            }
            
            // Continue - invoice is created even if email fails
            // But we log it clearly for debugging
          }
        }
      } else {
        console.log(`[ZohoService] ⚠️ No customer email provided, skipping email delivery`);
        console.log(`[ZohoService]    This means invoice was created but NOT sent via email!`);
        console.log(`[ZohoService]    Customer will only receive invoice via WhatsApp (if phone provided)`);
        console.log(`[ZohoService]    Debug info:`);
        console.log(`      booking.customer_email: ${booking.customer_email || 'NULL'}`);
        console.log(`      invoiceData.customer_email: ${invoiceData.customer_email || 'NULL'}`);
      }
      
      console.log(`[ZohoService] ========================================`);
      console.log(`[ZohoService] EMAIL DELIVERY PROCESS COMPLETE`);
      console.log(`[ZohoService] ========================================`);

      // Step 2 & 3: Download Invoice PDF and Send via WhatsApp (if phone is provided)
      // This follows the exact path: Download PDF → Send via WhatsApp
      console.log(`[ZohoService] 🔍 WhatsApp delivery check: customer_phone = ${invoiceData.customer_phone ? `"${invoiceData.customer_phone}"` : 'falsy'}`);
      if (invoiceData.customer_phone) {
        console.log(`[ZohoService] 📱 Step 2-3: Downloading invoice PDF and sending via WhatsApp to ${invoiceData.customer_phone}...`);
        try {
          await this.sendInvoiceViaWhatsApp(booking.tenant_id, invoiceId, invoiceData.customer_phone);
          console.log(`[ZohoService] ✅ Step 2-3 Complete: Invoice PDF sent via WhatsApp to ${invoiceData.customer_phone}`);
        } catch (whatsappError: any) {
          console.error(`[ZohoService] ❌ Step 2-3 Failed: ${whatsappError.message}`);
          console.error(`[ZohoService]    Error details:`, whatsappError.response?.data || whatsappError.stack);
          // Continue - invoice is created even if WhatsApp fails
        }
      } else {
        console.log(`[ZohoService] ⚠️ No customer phone provided, skipping WhatsApp delivery`);
        console.log(`[ZohoService]    Phone value: ${invoiceData.customer_phone}`);
        console.log(`[ZohoService]    Type: ${typeof invoiceData.customer_phone}`);
        console.log(`[ZohoService]    This means invoice was created but NOT sent to customer!`);
      }

      // Verify invoice was saved (using a new connection since transaction is closed)
      const verifyClient = await pool.connect();
      try {
        const verifyResult = await verifyClient.query(
          `SELECT zoho_invoice_id, zoho_invoice_created_at FROM bookings WHERE id = $1`,
          [bookingId]
        );
        
        if (verifyResult.rows.length > 0 && verifyResult.rows[0].zoho_invoice_id === invoiceId) {
          console.log(`[ZohoService] ✅ Verification: Invoice ${invoiceId} confirmed in database`);
          console.log(`[ZohoService]    Invoice Created At: ${verifyResult.rows[0].zoho_invoice_created_at}`);
        } else {
          console.error(`[ZohoService] ❌ Verification FAILED: Invoice ${invoiceId} not found in database after commit!`);
          console.error(`[ZohoService]    Found: ${JSON.stringify(verifyResult.rows[0] || {})}`);
        }
      } catch (verifyError) {
        console.error(`[ZohoService] ⚠️  Verification query failed: ${verifyError}`);
      } finally {
        verifyClient.release();
      }

      console.log(`[ZohoService] Receipt generated successfully for booking ${bookingId}, invoice: ${invoiceId}`);
      return { invoiceId, success: true };
    } catch (error: any) {
      await client.query('ROLLBACK');

      // Log failure
      try {
        const bookingCheck = await client.query(
          `SELECT tenant_id FROM bookings WHERE id = $1`,
          [bookingId]
        );
        if (bookingCheck.rows.length > 0) {
          await client.query(
            `INSERT INTO zoho_invoice_logs (booking_id, tenant_id, status, error_message, request_payload)
             VALUES ($1, $2, 'failed', $3, $4)`,
            [
              bookingId,
              bookingCheck.rows[0].tenant_id,
              error.message,
              JSON.stringify({ bookingId }),
            ]
          );
        }
      } catch (logError) {
        console.error('[ZohoService] Failed to log error:', logError);
      }

      console.error(`[ZohoService] Failed to generate receipt for booking ${bookingId}:`, error.message);
      return { invoiceId: '', success: false, error: error.message };
    } finally {
      client.release();
    }
  }
}

export const zohoService = new ZohoService();

