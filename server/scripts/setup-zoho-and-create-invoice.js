import pg from 'pg';
import dotenv from 'dotenv';
import axios from 'axios';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

async function setupZohoAndCreateInvoice() {
  const client = await pool.connect();
  
  try {
    const customerEmail = 'kaptifidev@gmail.com';
    
    console.log('🚀 Setting up Zoho and creating invoice\n');
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
        b.zoho_invoice_id
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
    console.log(`   Payment status: ${booking.payment_status}`);
    console.log(`   Total price: ${booking.total_price} SAR`);
    
    if (booking.zoho_invoice_id) {
      console.log(`\n⚠️  Invoice already exists: ${booking.zoho_invoice_id}`);
      return;
    }
    
    // Step 2: Check/Setup Zoho tokens
    console.log(`\n📋 Step 2: Setting up Zoho tokens...`);
    
    let tokenResult = await client.query(
      `SELECT * FROM zoho_tokens WHERE tenant_id = $1`,
      [tenantId]
    );
    
    if (tokenResult.rows.length === 0) {
      console.log('   No tokens found, attempting to get tokens from self_client.json...');
      
      // Load self_client.json
      const credentialsPath = join(__dirname, '..', 'self_client.json');
      let selfClientData;
      
      try {
        const fileContent = readFileSync(credentialsPath, 'utf8');
        selfClientData = JSON.parse(fileContent);
        console.log('   ✅ Loaded self_client.json');
      } catch (error) {
        console.log('   ❌ Could not load self_client.json');
        console.log(`   Error: ${error.message}`);
        console.log(`\n💡 You need to complete OAuth flow first:`);
        console.log(`   http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
        return;
      }
      
      // Check if we have an authorization code
      if (selfClientData.code) {
        console.log('   ✅ Found authorization code in self_client.json');
        console.log('   🔄 Exchanging code for tokens...');
        
        try {
          const tokenResponse = await axios.post(
            'https://accounts.zoho.com/oauth/v2/token',
            null,
            {
              params: {
                grant_type: 'authorization_code',
                client_id: selfClientData.client_id,
                client_secret: selfClientData.client_secret,
                redirect_uri: process.env.ZOHO_REDIRECT_URI || 'http://localhost:3001/api/zoho/callback',
                code: selfClientData.code,
              },
            }
          );
          
          const { access_token, refresh_token, expires_in } = tokenResponse.data;
          
          if (!access_token || !refresh_token) {
            throw new Error('Failed to obtain tokens from Zoho');
          }
          
          // Store tokens
          const expiresAt = new Date(Date.now() + expires_in * 1000);
          await client.query(
            `INSERT INTO zoho_tokens (tenant_id, access_token, refresh_token, expires_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (tenant_id) 
             DO UPDATE SET 
               access_token = EXCLUDED.access_token,
               refresh_token = EXCLUDED.refresh_token,
               expires_at = EXCLUDED.expires_at,
               updated_at = now()`,
            [tenantId, access_token, refresh_token, expiresAt]
          );
          
          console.log('   ✅ Tokens stored successfully');
          console.log(`   Expires at: ${expiresAt.toLocaleString()}`);
        } catch (error) {
          console.log('   ❌ Failed to exchange code for tokens:');
          if (error.response) {
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
          } else {
            console.log(`   ${error.message}`);
          }
          console.log(`\n💡 The authorization code may be expired or invalid.`);
          console.log(`   Complete OAuth flow again:`);
          console.log(`   http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
          console.log(`\n   OR if server is running, you can use the API directly.`);
          return;
        }
      } else {
        console.log('   ❌ No authorization code in self_client.json');
        console.log(`\n💡 Complete OAuth flow:`);
        console.log(`   http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
        return;
      }
    } else {
      console.log('   ✅ Zoho tokens already exist');
      const token = tokenResult.rows[0];
      const expiresAt = new Date(token.expires_at);
      console.log(`   Expires at: ${expiresAt.toLocaleString()}`);
    }
    
    // Step 3: Create invoice via API
    console.log(`\n📋 Step 3: Creating Zoho invoice...`);
    
    const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';
    
    try {
      console.log(`   Calling: POST ${API_URL}/api/zoho/test-invoice`);
      
      const response = await fetch(`${API_URL}/api/zoho/test-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          booking_id: bookingId,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText.substring(0, 200) };
        }
        
        console.log('   ❌ Failed to create invoice:');
        console.log(`   Status: ${response.status}`);
        console.log(`   Error: ${errorData.error || errorData.message || 'Unknown error'}`);
        
        if (response.status === 500) {
          console.log(`\n💡 The server might not be running.`);
          console.log(`   Start it with: cd project/server && npm run dev`);
          console.log(`   Then run this script again.`);
        }
        return;
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('   ✅ Invoice created successfully!');
        console.log(`   Invoice ID: ${result.invoice_id}`);
        
        // Verify in database
        const verify = await client.query(
          `SELECT 
            zoho_invoice_id, 
            zoho_invoice_created_at, 
            customer_email,
            customer_name,
            total_price
           FROM bookings 
           WHERE id = $1`,
          [bookingId]
        );
        
        if (verify.rows[0].zoho_invoice_id) {
          console.log(`\n✅ Verification:`);
          console.log(`   Booking ID: ${bookingId}`);
          console.log(`   Customer: ${verify.rows[0].customer_name}`);
          console.log(`   Email: ${verify.rows[0].customer_email}`);
          console.log(`   Amount: ${verify.rows[0].total_price} SAR`);
          console.log(`   Zoho Invoice ID: ${verify.rows[0].zoho_invoice_id}`);
          console.log(`   Created at: ${new Date(verify.rows[0].zoho_invoice_created_at).toLocaleString()}`);
          console.log(`\n📧 Invoice should be sent to: ${verify.rows[0].customer_email}`);
          console.log(`\n🎉 Success! Invoice created and sent via Zoho.`);
        }
      } else {
        console.log('   ❌ Invoice creation failed:');
        console.log(`   Error: ${result.error || result.message}`);
      }
    } catch (error) {
      console.log('   ❌ Error calling API:');
      console.log(`   ${error.message}`);
      console.log(`\n💡 Make sure the server is running:`);
      console.log(`   cd project/server && npm run dev`);
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

setupZohoAndCreateInvoice().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

