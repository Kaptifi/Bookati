/**
 * Mark Existing Draft Invoices as Sent
 * 
 * This script finds all invoices in draft status and marks them as sent
 * Usage: node scripts/mark-invoices-as-sent.js
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

async function markInvoicesAsSent() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Marking draft invoices as sent...\n');

    // Get all bookings with invoices
    const bookings = await client.query(
      `SELECT 
        b.id as booking_id,
        b.zoho_invoice_id,
        b.tenant_id,
        b.customer_email,
        b.customer_name
      FROM bookings b
      WHERE b.zoho_invoice_id IS NOT NULL
      ORDER BY b.created_at DESC
      LIMIT 20`
    );

    console.log(`Found ${bookings.rows.length} bookings with invoices\n`);

    if (bookings.rows.length === 0) {
      console.log('No invoices found to process');
      return;
    }

    // Group by tenant
    const tenantGroups = new Map();
    for (const booking of bookings.rows) {
      if (!tenantGroups.has(booking.tenant_id)) {
        tenantGroups.set(booking.tenant_id, []);
      }
      tenantGroups.get(booking.tenant_id).push(booking);
    }

    // Process each tenant
    for (const [tenantId, tenantBookings] of tenantGroups) {
      console.log(`\n📋 Processing tenant: ${tenantId}`);
      console.log(`   Invoices: ${tenantBookings.length}\n`);

      // Get Zoho tokens for this tenant
      const tokens = await client.query(
        `SELECT access_token, refresh_token, expires_at
         FROM zoho_tokens
         WHERE tenant_id = $1`,
        [tenantId]
      );

      if (tokens.rows.length === 0) {
        console.log(`   ⚠️  No Zoho tokens found for tenant ${tenantId}`);
        continue;
      }

      const token = tokens.rows[0];
      const apiBaseUrl = process.env.ZOHO_API_BASE_URL || 'https://invoice.zoho.com/api/v3';

      // Process each invoice
      for (const booking of tenantBookings) {
        console.log(`   Invoice: ${booking.zoho_invoice_id}`);
        console.log(`   Customer: ${booking.customer_name} (${booking.customer_email || 'no email'})`);

        try {
          // First, check invoice status
          const invoiceResponse = await axios.get(
            `${apiBaseUrl}/invoices/${booking.zoho_invoice_id}`,
            {
              headers: {
                'Authorization': `Zoho-oauthtoken ${token.access_token}`,
              },
            }
          );

          const invoiceStatus = invoiceResponse.data.invoice?.status || invoiceResponse.data.invoice?.invoice_status;
          console.log(`   Current status: ${invoiceStatus}`);

          if (invoiceStatus && (invoiceStatus.toLowerCase() === 'draft' || invoiceStatus.toLowerCase() === 'd')) {
            // Mark as sent
            try {
              // Try mark-as-sent endpoint
              await axios.post(
                `${apiBaseUrl}/invoices/${booking.zoho_invoice_id}/mark-as-sent`,
                {},
                {
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${token.access_token}`,
                    'Content-Type': 'application/json',
                  },
                }
              );
              console.log(`   ✅ Marked as sent`);
            } catch (markError) {
              // Try status update
              try {
                await axios.put(
                  `${apiBaseUrl}/invoices/${booking.zoho_invoice_id}`,
                  { status: 'sent' },
                  {
                    headers: {
                      'Authorization': `Zoho-oauthtoken ${token.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  }
                );
                console.log(`   ✅ Status updated to sent`);
              } catch (updateError) {
                console.log(`   ❌ Failed to mark as sent: ${updateError.response?.data?.message || updateError.message}`);
              }
            }

            // If email exists, try to send
            if (booking.customer_email) {
              try {
                await axios.post(
                  `${apiBaseUrl}/invoices/${booking.zoho_invoice_id}/email`,
                  {
                    send_from_org_email_id: true,
                    to_mail_ids: [booking.customer_email],
                  },
                  {
                    headers: {
                      'Authorization': `Zoho-oauthtoken ${token.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  }
                );
                console.log(`   ✅ Email sent to ${booking.customer_email}`);
              } catch (emailError) {
                console.log(`   ⚠️  Email send failed: ${emailError.response?.data?.message || emailError.message}`);
              }
            }
          } else {
            console.log(`   ✅ Already in sent status`);
          }
        } catch (error) {
          console.log(`   ❌ Error: ${error.response?.data?.message || error.message}`);
        }
        console.log();
      }
    }

    console.log('\n✅ Processing complete!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

markInvoicesAsSent();

