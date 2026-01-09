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

const customerEmail = 'kaptifidev@gmail.com';
const bookingId = '29d01803-8b04-4e4d-a5af-9eba4ff49dd0';
const tenantId = '63107b06-938e-4ce6-b0f3-520a87db397b';

async function createInvoiceAfterOAuth() {
  const client = await pool.connect();
  
  try {
    console.log('📧 Creating Zoho Invoice\n');
    console.log('='.repeat(60));
    console.log(`Booking ID: ${bookingId}`);
    console.log(`Customer Email: ${customerEmail}`);
    console.log(`Tenant ID: ${tenantId}\n`);
    
    // Check Zoho connection
    console.log('🔍 Checking Zoho connection...');
    const tokenResult = await client.query(
      `SELECT * FROM zoho_tokens WHERE tenant_id = $1`,
      [tenantId]
    );
    
    if (tokenResult.rows.length === 0) {
      console.log('❌ Zoho not connected for this tenant');
      console.log(`\n💡 Complete OAuth flow first:`);
      console.log(`   1. Start server: cd project/server && npm run dev`);
      console.log(`   2. Visit: http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
      console.log(`   3. Complete OAuth flow`);
      console.log(`   4. Run this script again`);
      return;
    }
    
    console.log('✅ Zoho connected');
    const token = tokenResult.rows[0];
    let accessToken = token.access_token;
    
    // Check token expiration
    const expiresAt = new Date(token.expires_at);
    const now = new Date();
    if (expiresAt < now) {
      console.log('🔄 Token expired, refreshing...');
      
      const credentialsPath = join(__dirname, '..', 'self_client.json');
      const { readFileSync } = await import('fs');
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
      
      console.log('✅ Token refreshed');
    }
    
    // Get booking details
    console.log('\n📋 Getting booking details...');
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
      console.log('❌ Booking not found');
      return;
    }
    
    const b = bookingDetails.rows[0];
    
    if (b.zoho_invoice_id) {
      console.log(`\n⚠️  Invoice already exists: ${b.zoho_invoice_id}`);
      return;
    }
    
    // Build invoice
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
    
    const invoicePayload = {
      customer_name: b.customer_name,
      customer_email: b.customer_email || customerEmail,
      line_items: lineItems.map(item => ({
        name: item.name,
        description: item.description || '',
        rate: item.rate,
        quantity: item.quantity,
        unit: item.unit,
      })),
      date: invoiceDate.toISOString().split('T')[0],
      due_date: slotDate.toISOString().split('T')[0],
      currency_code: 'SAR',
      notes: `Booking ID: ${bookingId}`,
    };
    
    console.log('✅ Invoice data prepared');
    console.log(`   Customer: ${invoicePayload.customer_name}`);
    console.log(`   Email: ${invoicePayload.customer_email}`);
    console.log(`   Total: ${b.total_price} SAR`);
    
    // Create invoice
    console.log('\n📧 Creating invoice in Zoho...');
    
    const apiBaseUrl = process.env.ZOHO_API_BASE_URL || 'https://invoice.zoho.com/api/v3';
    
    const invoiceResponse = await axios.post(
      `${apiBaseUrl}/invoices`,
      invoicePayload,
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
      throw new Error('No invoice ID in response: ' + JSON.stringify(invoiceResponse.data));
    }
    
    console.log(`✅ Invoice created: ${invoiceId}`);
    
    // Send email
    console.log('\n📧 Sending invoice via email...');
    
    try {
      await axios.post(
        `${apiBaseUrl}/invoices/${invoiceId}/email`,
        {
          send_from_org_email_id: true,
          to_mail_ids: [invoicePayload.customer_email],
        },
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`✅ Invoice sent to ${invoicePayload.customer_email}`);
    } catch (emailError) {
      console.log(`⚠️  Email sending failed (invoice created):`);
      console.log(`   ${emailError.response?.data?.message || emailError.message}`);
    }
    
    // Update booking
    await client.query(
      `UPDATE bookings 
       SET zoho_invoice_id = $1, zoho_invoice_created_at = now()
       WHERE id = $2`,
      [invoiceId, bookingId]
    );
    
    // Log
    await client.query(
      `INSERT INTO zoho_invoice_logs (booking_id, tenant_id, zoho_invoice_id, status, request_payload, response_payload)
       VALUES ($1, $2, $3, 'success', $4, $5)`,
      [
        bookingId,
        tenantId,
        invoiceId,
        JSON.stringify(invoicePayload),
        JSON.stringify(invoiceResponse.data),
      ]
    );
    
    console.log('\n🎉 SUCCESS!');
    console.log(`\n📊 Invoice Details:`);
    console.log(`   Booking ID: ${bookingId}`);
    console.log(`   Zoho Invoice ID: ${invoiceId}`);
    console.log(`   Customer: ${invoicePayload.customer_name}`);
    console.log(`   Email: ${invoicePayload.customer_email}`);
    console.log(`   Amount: ${b.total_price} SAR`);
    console.log(`   Invoice sent to: ${invoicePayload.customer_email}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

createInvoiceAfterOAuth().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

