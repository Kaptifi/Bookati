/**
 * Check and Fix Specific Invoice by Invoice Number
 * 
 * This script checks the status of a specific invoice (by invoice number)
 * and marks it as sent if it's in draft status, then sends the email
 * Usage: node scripts/check-and-fix-invoice.js INV-000057
 */

import pg from 'pg';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

async function checkAndFixInvoice(invoiceNumber) {
  const client = await pool.connect();
  
  try {
    console.log(`🔍 Checking invoice: ${invoiceNumber}\n`);
    console.log('='.repeat(60));

    // First, try to find it in the database
    console.log('\n📋 Step 1: Searching database for invoice...');
    const dbResult = await client.query(
      `SELECT 
        b.id as booking_id,
        b.zoho_invoice_id,
        b.tenant_id,
        b.customer_email,
        b.customer_name,
        b.customer_phone
      FROM bookings b
      WHERE b.zoho_invoice_id IS NOT NULL
      ORDER BY b.created_at DESC`
    );

    let invoiceId = null;
    let tenantId = null;
    let customerEmail = null;
    let customerName = null;

    // Search through invoices to find the one with matching invoice number
    console.log(`   Found ${dbResult.rows.length} invoices in database`);
    
    if (dbResult.rows.length > 0) {
      // Get Zoho tokens for all tenants
      const tenantIds = [...new Set(dbResult.rows.map(r => r.tenant_id))];
      console.log(`   Checking ${tenantIds.length} tenant(s)...`);

      for (const tid of tenantIds) {
        const tokens = await client.query(
          `SELECT access_token, refresh_token, expires_at
           FROM zoho_tokens
           WHERE tenant_id = $1`,
          [tid]
        );

        if (tokens.rows.length === 0) {
          continue;
        }

        const token = tokens.rows[0];
        const apiBaseUrl = process.env.ZOHO_API_BASE_URL || 'https://invoice.zoho.com/api/v3';

        // Get bookings for this tenant
        const tenantBookings = dbResult.rows.filter(r => r.tenant_id === tid);

        for (const booking of tenantBookings) {
          try {
            // Get invoice details from Zoho
            const invoiceResponse = await axios.get(
              `${apiBaseUrl}/invoices/${booking.zoho_invoice_id}`,
              {
                headers: {
                  'Authorization': `Zoho-oauthtoken ${token.access_token}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            const invoice = invoiceResponse.data?.invoice;
            if (invoice && invoice.invoice_number === invoiceNumber) {
              invoiceId = booking.zoho_invoice_id;
              tenantId = tid;
              customerEmail = booking.customer_email;
              customerName = booking.customer_name;
              console.log(`   ✅ Found invoice in database!`);
              console.log(`      Invoice ID: ${invoiceId}`);
              console.log(`      Invoice Number: ${invoice.invoice_number}`);
              console.log(`      Tenant: ${tenantId}`);
              console.log(`      Customer: ${customerName} (${customerEmail || 'no email'})`);
              break;
            }
          } catch (error) {
            // Skip if we can't access this invoice
            continue;
          }
        }

        if (invoiceId) break;
      }
    }

    // If not found in database, search Zoho directly
    if (!invoiceId) {
      console.log(`\n📋 Step 2: Searching Zoho API directly...`);
      
      const tenantIds = await client.query(
        `SELECT DISTINCT tenant_id FROM zoho_tokens`
      );

      for (const row of tenantIds.rows) {
        const tid = row.tenant_id;
        const tokens = await client.query(
          `SELECT access_token FROM zoho_tokens WHERE tenant_id = $1`,
          [tid]
        );

        if (tokens.rows.length === 0) continue;

        const token = tokens.rows[0].access_token;
        const apiBaseUrl = process.env.ZOHO_API_BASE_URL || 'https://invoice.zoho.com/api/v3';

        try {
          // Search invoices by invoice number
          const searchResponse = await axios.get(
            `${apiBaseUrl}/invoices`,
            {
              params: {
                search_text: invoiceNumber,
                page: 1,
                per_page: 100,
              },
              headers: {
                'Authorization': `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          const invoices = searchResponse.data?.invoices || [];
          const foundInvoice = invoices.find(inv => inv.invoice_number === invoiceNumber);

          if (foundInvoice) {
            invoiceId = foundInvoice.invoice_id;
            tenantId = tid;
            customerEmail = foundInvoice.customer_email;
            customerName = foundInvoice.customer_name;
            console.log(`   ✅ Found invoice in Zoho!`);
            console.log(`      Invoice ID: ${invoiceId}`);
            console.log(`      Invoice Number: ${foundInvoice.invoice_number}`);
            console.log(`      Tenant: ${tenantId}`);
            console.log(`      Customer: ${customerName} (${customerEmail || 'no email'})`);
            break;
          }
        } catch (error) {
          console.log(`   ⚠️  Could not search tenant ${tid}: ${error.message}`);
          continue;
        }
      }
    }

    if (!invoiceId) {
      console.log(`\n❌ Invoice ${invoiceNumber} not found!`);
      console.log(`\n💡 Please check:`);
      console.log(`   1. The invoice number is correct: ${invoiceNumber}`);
      console.log(`   2. The invoice exists in Zoho`);
      console.log(`   3. You have access to the tenant that owns this invoice`);
      return;
    }

    // Now check status and fix if needed
    console.log(`\n📋 Step 3: Checking invoice status...`);
    console.log('='.repeat(60));

    const tokens = await client.query(
      `SELECT access_token FROM zoho_tokens WHERE tenant_id = $1`,
      [tenantId]
    );

    if (tokens.rows.length === 0) {
      console.log(`❌ No Zoho tokens found for tenant ${tenantId}`);
      return;
    }

    const token = tokens.rows[0].access_token;
    const apiBaseUrl = process.env.ZOHO_API_BASE_URL || 'https://invoice.zoho.com/api/v3';

    // Get invoice status
    const statusResponse = await axios.get(
      `${apiBaseUrl}/invoices/${invoiceId}`,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const invoice = statusResponse.data?.invoice;
    const invoiceStatus = invoice?.status || invoice?.invoice_status || invoice?.status_name;
    
    console.log(`\n📊 Invoice Details:`);
    console.log(`   Invoice ID: ${invoiceId}`);
    console.log(`   Invoice Number: ${invoice?.invoice_number || invoiceNumber}`);
    console.log(`   Current Status: ${invoiceStatus || 'unknown'}`);
    console.log(`   Customer: ${customerName || invoice?.customer_name || 'unknown'}`);
    console.log(`   Email: ${customerEmail || invoice?.customer_email || 'no email'}`);
    console.log(`   Total: ${invoice?.total || 'unknown'}`);

    const statusLower = (invoiceStatus || '').toLowerCase();

    if (statusLower === 'draft' || statusLower === 'd' || statusLower === 'saved') {
      console.log(`\n⚠️  Invoice is in DRAFT status - marking as SENT...`);
      console.log('='.repeat(60));

      let statusUpdated = false;

      // Method 1: Try mark-as-sent endpoint
      try {
        const markResponse = await axios.post(
          `${apiBaseUrl}/invoices/${invoiceId}/mark-as-sent`,
          {},
          {
            headers: {
              'Authorization': `Zoho-oauthtoken ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (markResponse.data?.code === 0 || markResponse.data?.invoice) {
          console.log(`✅ Invoice marked as sent via mark-as-sent endpoint`);
          statusUpdated = true;
        }
      } catch (markError) {
        // Method 2: Try status update
        if (markError.response?.status === 404 || markError.response?.status === 405) {
          console.log(`   Mark-as-sent endpoint not available, trying status update...`);
          
          try {
            const updateResponse = await axios.put(
              `${apiBaseUrl}/invoices/${invoiceId}`,
              { 
                status: 'sent',
                invoice_status: 'sent'
              },
              {
                headers: {
                  'Authorization': `Zoho-oauthtoken ${token}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (updateResponse.data?.code === 0 || updateResponse.data?.invoice) {
              console.log(`✅ Invoice status updated to 'sent'`);
              statusUpdated = true;
            } else {
              console.log(`⚠️  Status update returned code: ${updateResponse.data?.code}`);
            }
          } catch (updateError) {
            const errorMsg = updateError.response?.data?.message || updateError.message;
            console.log(`❌ Failed to update status: ${errorMsg}`);
            
            if (errorMsg.includes('not authorized') || errorMsg.includes('permission')) {
              console.log(`\n⚠️  PERMISSION ISSUE DETECTED`);
              console.log(`   The token doesn't have UPDATE permission for invoices.`);
              console.log(`   This means we cannot change the invoice status programmatically.`);
              console.log(`\n💡 SOLUTIONS:`);
              console.log(`   1. Manually mark invoice as "Sent" in Zoho Invoice dashboard:`);
              console.log(`      https://invoice.zoho.com/ → Invoices → ${invoiceNumber} → Mark as Sent`);
              console.log(`   2. Re-authenticate with UPDATE scope:`);
              console.log(`      http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
              console.log(`      Make sure to grant UPDATE permissions when prompted`);
              console.log(`\n⚠️  WARNING: If invoice stays in draft, email will be saved as draft!`);
              console.log(`   We'll still attempt to send the email, but it may be saved as draft.`);
            }
          }
        } else {
          console.log(`❌ Failed to mark as sent: ${markError.response?.data?.message || markError.message}`);
        }
      }

      if (statusUpdated) {
        // Wait a moment for Zoho to process
        console.log(`\n⏳ Waiting for Zoho to process status change...`);
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Verify status
        try {
          const verifyResponse = await axios.get(
            `${apiBaseUrl}/invoices/${invoiceId}`,
            {
              headers: {
                'Authorization': `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          const newStatus = verifyResponse.data?.invoice?.status || 
                           verifyResponse.data?.invoice?.invoice_status;
          console.log(`✅ Verified new status: ${newStatus}`);
        } catch (verifyError) {
          console.log(`⚠️  Could not verify status: ${verifyError.message}`);
        }
      } else {
        console.log(`\n⚠️  Status was NOT updated - invoice is still in DRAFT`);
        console.log(`   Email will likely be saved as draft instead of being sent.`);
      }
    } else {
      console.log(`\n✅ Invoice is already in '${invoiceStatus}' status`);
    }

    // Send email if customer email exists
    const emailToSend = customerEmail || invoice?.customer_email;
    if (emailToSend) {
      console.log(`\n📧 Step 4: Sending invoice email...`);
      console.log('='.repeat(60));
      console.log(`   Email: ${emailToSend}`);

      try {
        const emailResponse = await axios.post(
          `${apiBaseUrl}/invoices/${invoiceId}/email`,
          {
            send_from_org_email_id: true,
            to_mail_ids: [emailToSend.trim()],
          },
          {
            headers: {
              'Authorization': `Zoho-oauthtoken ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        );

        const emailData = emailResponse.data;
        if (emailData.code === 0) {
          console.log(`✅ Email sent successfully!`);
          console.log(`   Message: ${emailData.message || 'Email sent'}`);
        } else {
          console.log(`⚠️  Email API returned code: ${emailData.code}`);
          console.log(`   Message: ${emailData.message || 'Unknown'}`);
        }
      } catch (emailError) {
        console.log(`❌ Failed to send email: ${emailError.response?.data?.message || emailError.message}`);
        if (emailError.response?.data) {
          console.log(`   Error details:`, JSON.stringify(emailError.response.data, null, 2));
        }
      }
    } else {
      console.log(`\n⚠️  No customer email found - cannot send email`);
    }

    console.log(`\n✅ Processing complete!`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

// Get invoice number from command line argument
const invoiceNumber = process.argv[2];

if (!invoiceNumber) {
  console.log('❌ Please provide an invoice number');
  console.log('Usage: node scripts/check-and-fix-invoice.js INV-000057');
  process.exit(1);
}

checkAndFixInvoice(invoiceNumber);

