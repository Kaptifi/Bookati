import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';
import { readFileSync } from 'fs';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

async function createInvoiceDirect() {
  const client = await pool.connect();
  
  try {
    const customerEmail = 'kaptifidev@gmail.com';
    
    console.log('🚀 Creating Zoho Invoice Directly\n');
    console.log('='.repeat(60));
    
    // Step 1: Find booking
    console.log('\n📋 Step 1: Finding booking...');
    const bookingResult = await client.query(
      `SELECT 
        b.id,
        b.tenant_id,
        b.customer_name,
        b.customer_email,
        b.payment_status,
        b.total_price,
        b.zoho_invoice_id,
        b.service_id,
        b.slot_id,
        b.adult_count,
        b.child_count,
        b.visitor_count
      FROM bookings b
      WHERE b.customer_email = $1
      ORDER BY b.created_at DESC
      LIMIT 1`,
      [customerEmail]
    );
    
    if (bookingResult.rows.length === 0) {
      console.log('❌ No booking found with this email');
      return;
    }
    
    const booking = bookingResult.rows[0];
    const bookingId = booking.id;
    const tenantId = booking.tenant_id;
    
    console.log(`✅ Found booking: ${bookingId}`);
    console.log(`   Tenant: ${tenantId}`);
    console.log(`   Customer: ${booking.customer_name}`);
    console.log(`   Email: ${booking.customer_email}`);
    console.log(`   Payment: ${booking.payment_status} (${booking.total_price} SAR)`);
    
    if (booking.zoho_invoice_id) {
      console.log(`\n⚠️  Invoice already exists: ${booking.zoho_invoice_id}`);
      return;
    }
    
    // Step 2: Setup Zoho tokens using self_client.json code
    console.log(`\n📋 Step 2: Setting up Zoho tokens...`);
    
    let tokenResult = await client.query(
      `SELECT * FROM zoho_tokens WHERE tenant_id = $1`,
      [tenantId]
    );
    
    if (tokenResult.rows.length === 0) {
      console.log('   No tokens found, getting from self_client.json...');
      
      const credentialsPath = join(__dirname, '..', 'self_client.json');
      let selfClientData;
      
      try {
        const fileContent = readFileSync(credentialsPath, 'utf8');
        selfClientData = JSON.parse(fileContent);
      } catch (error) {
        console.log('   ❌ Could not load self_client.json');
        console.log(`\n💡 Complete OAuth flow:`);
        console.log(`   http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
        return;
      }
      
      // The authorization code in self_client.json is likely expired
      // We need to complete OAuth flow via browser
      console.log('   ⚠️  Authorization code in self_client.json may be expired');
      console.log(`\n💡 Complete OAuth flow:`);
      console.log(`   1. Make sure server is running: cd project/server && npm run dev`);
      console.log(`   2. Visit: http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
      console.log(`   3. Complete OAuth flow in browser`);
      console.log(`   4. Then run this script again`);
      return;
    } else {
      console.log('   ✅ Tokens already exist');
    }
    
    const token = tokenResult.rows[0];
    let accessToken = token.access_token;
    
    // Check if token needs refresh
    const expiresAt = new Date(token.expires_at);
    const now = new Date();
    if (expiresAt < now) {
      console.log('   🔄 Token expired, refreshing...');
      
      const credentialsPath = join(__dirname, '..', 'self_client.json');
      const selfClientData = JSON.parse(readFileSync(credentialsPath, 'utf8'));
      
      const refreshResponse = await axios.post(
        'https://accounts.zoho.com/oauth/v2/token',
        null,
        {
          params: {
            refresh_token: token.refresh_token,
            client_id: selfClientData.client_id,
            client_secret: selfClientData.client_secret,
            grant_type: 'refresh_token',
          },
        }
      );
      
      accessToken = refreshResponse.data.access_token;
      const newExpiresAt = new Date(Date.now() + refreshResponse.data.expires_in * 1000);
      
      await client.query(
        `UPDATE zoho_tokens 
         SET access_token = $1, expires_at = $2, updated_at = now()
         WHERE tenant_id = $3`,
        [accessToken, newExpiresAt, tenantId]
      );
      
      console.log('   ✅ Token refreshed');
    }
    
    // Step 3: Get booking details for invoice
    console.log(`\n📋 Step 3: Preparing invoice data...`);
    
    const bookingDetails = await client.query(
      `SELECT 
        b.*,
        s.name as service_name,
        s.name_ar as service_name_ar,
        s.description as service_description,
        s.base_price,
        s.child_price,
        ts.start_time_utc,
        ts.end_time_utc
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN time_slots ts ON b.slot_id = ts.id
      WHERE b.id = $1`,
      [bookingId]
    );
    
    if (bookingDetails.rows.length === 0) {
      console.log('❌ Booking details not found');
      return;
    }
    
    const b = bookingDetails.rows[0];
    
    // Build invoice data
    const serviceName = b.service_name_ar || b.service_name;
    const lineItems = [];
    
    if (b.adult_count > 0 && b.base_price) {
      lineItems.push({
        name: `${serviceName} - Adult`,
        description: b.service_description || '',
        rate: parseFloat(b.base_price.toString()),
        quantity: b.adult_count,
        unit: 'ticket',
      });
    }
    
    if (b.child_count > 0 && b.child_price) {
      lineItems.push({
        name: `${serviceName} - Child`,
        description: b.service_description || '',
        rate: parseFloat(b.child_price.toString()),
        quantity: b.child_count,
        unit: 'ticket',
      });
    }
    
    if (lineItems.length === 0) {
      lineItems.push({
        name: serviceName,
        description: b.service_description || '',
        rate: parseFloat(b.total_price.toString()),
        quantity: b.visitor_count || 1,
        unit: 'ticket',
      });
    }
    
    const invoiceDate = new Date(b.created_at);
    const slotDate = b.start_time_utc ? new Date(b.start_time_utc) : invoiceDate;
    
    const invoiceData = {
      customer_name: b.customer_name,
      customer_email: b.customer_email,
      line_items: lineItems,
      date: invoiceDate.toISOString().split('T')[0],
      due_date: slotDate.toISOString().split('T')[0],
      currency_code: 'SAR',
      notes: `Booking ID: ${bookingId}`,
      custom_fields: {
        booking_id: bookingId,
        slot_date: slotDate.toISOString().split('T')[0],
      },
    };
    
    console.log('   ✅ Invoice data prepared');
    console.log(`   Customer: ${invoiceData.customer_name}`);
    console.log(`   Email: ${invoiceData.customer_email}`);
    console.log(`   Line items: ${lineItems.length}`);
    console.log(`   Total: ${b.total_price} SAR`);
    
    // Step 4: Create invoice in Zoho
    console.log(`\n📋 Step 4: Creating invoice in Zoho...`);
    
    const apiBaseUrl = process.env.ZOHO_API_BASE_URL || 'https://invoice.zoho.com/api/v3';
    
    try {
      const invoiceResponse = await axios.post(
        `${apiBaseUrl}/invoices`,
        {
          customer_name: invoiceData.customer_name,
          customer_email: invoiceData.customer_email,
          line_items: invoiceData.line_items.map(item => ({
            name: item.name,
            description: item.description || '',
            rate: item.rate,
            quantity: item.quantity,
            unit: item.unit || 'ticket',
          })),
          date: invoiceData.date,
          due_date: invoiceData.due_date,
          currency_code: invoiceData.currency_code,
          notes: invoiceData.notes,
          custom_fields: invoiceData.custom_fields,
        },
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (invoiceResponse.data.error) {
        throw new Error(invoiceResponse.data.message || JSON.stringify(invoiceResponse.data));
      }
      
      const invoiceId = invoiceResponse.data.invoice?.invoice_id;
      
      if (!invoiceId) {
        throw new Error('No invoice ID in response');
      }
      
      console.log(`   ✅ Invoice created in Zoho`);
      console.log(`   Invoice ID: ${invoiceId}`);
      
      // Step 5: Send invoice via email
      console.log(`\n📋 Step 5: Sending invoice via email...`);
      
      try {
        await axios.post(
          `${apiBaseUrl}/invoices/${invoiceId}/email`,
          {
            send_from_org_email_id: true,
            to_mail_ids: [invoiceData.customer_email],
          },
          {
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        console.log(`   ✅ Invoice sent to ${invoiceData.customer_email}`);
      } catch (emailError) {
        console.log(`   ⚠️  Failed to send email (invoice created):`);
        console.log(`   ${emailError.response?.data?.message || emailError.message}`);
      }
      
      // Step 6: Update booking
      console.log(`\n📋 Step 6: Updating booking...`);
      
      await client.query(
        `UPDATE bookings 
         SET zoho_invoice_id = $1, zoho_invoice_created_at = now()
         WHERE id = $2`,
        [invoiceId, bookingId]
      );
      
      // Log success
      await client.query(
        `INSERT INTO zoho_invoice_logs (booking_id, tenant_id, zoho_invoice_id, status, request_payload, response_payload)
         VALUES ($1, $2, $3, 'success', $4, $5)`,
        [
          bookingId,
          tenantId,
          invoiceId,
          JSON.stringify(invoiceData),
          JSON.stringify(invoiceResponse.data),
        ]
      );
      
      console.log(`   ✅ Booking updated with invoice ID`);
      
      console.log(`\n🎉 SUCCESS! Invoice created and sent!`);
      console.log(`\n📊 Summary:`);
      console.log(`   Booking ID: ${bookingId}`);
      console.log(`   Customer: ${invoiceData.customer_name}`);
      console.log(`   Email: ${invoiceData.customer_email}`);
      console.log(`   Zoho Invoice ID: ${invoiceId}`);
      console.log(`   Amount: ${b.total_price} SAR`);
      console.log(`   Invoice sent to: ${invoiceData.customer_email}`);
      
    } catch (error) {
      console.log('   ❌ Failed to create invoice:');
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
      } else {
        console.log(`   ${error.message}`);
      }
      
      // Log failure
      try {
        await client.query(
          `INSERT INTO zoho_invoice_logs (booking_id, tenant_id, status, error_message, request_payload)
           VALUES ($1, $2, 'failed', $3, $4)`,
          [
            bookingId,
            tenantId,
            error.response?.data?.message || error.message,
            JSON.stringify(invoiceData),
          ]
        );
      } catch (logError) {
        // Ignore log errors
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

createInvoiceDirect().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

