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

const tenantId = '63107b06-938e-4ce6-b0f3-520a87db397b';
const invoiceId = '7919157000000108019';
const testEmail = 'kaptifidev@gmail.com';

async function testEmailDelivery() {
  const client = await pool.connect();
  try {
    console.log('📧 Testing Zoho Invoice Email Delivery\n');
    console.log('='.repeat(60));
    console.log(`Invoice ID: ${invoiceId}`);
    console.log(`Email: ${testEmail}`);
    console.log(`Tenant ID: ${tenantId}\n`);

    // Get access token
    const tokenResult = await client.query(
      `SELECT access_token FROM zoho_tokens WHERE tenant_id = $1`,
      [tenantId]
    );

    if (tokenResult.rows.length === 0) {
      console.log('❌ No tokens found');
      return;
    }

    const accessToken = tokenResult.rows[0].access_token;

    // Test different API regions
    const regions = [
      { name: 'US', url: 'https://invoice.zoho.com/api/v3' },
      { name: 'EU', url: 'https://invoice.zoho.eu/api/v3' },
      { name: 'India', url: 'https://invoice.zoho.in/api/v3' },
    ];

    for (const region of regions) {
      try {
        console.log(`Testing ${region.name} region (${region.url})...`);
        
        const response = await axios.post(
          `${region.url}/invoices/${invoiceId}/email`,
          {
            send_from_org_email_id: true,
            to_mail_ids: [testEmail],
          },
          {
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log(`   ✅ SUCCESS! Email sent via ${region.name} region`);
        console.log(`   Response:`, JSON.stringify(response.data, null, 2));
        console.log(`   ✅ Your organization is in the ${region.name} region`);
        console.log(`   ✅ Use this API Base URL: ${region.url}`);
        console.log('');
        console.log('💡 Check your email (including spam folder)');
        console.log(`   Email should be sent to: ${testEmail}`);
        return;
      } catch (error) {
        if (error.response) {
          const status = error.response.status;
          const errorData = error.response.data;
          console.log(`   ❌ ${status} ${errorData?.message || errorData?.error || 'Error'}`);
          if (errorData?.code) {
            console.log(`   Error code: ${errorData.code}`);
          }
        } else {
          console.log(`   ❌ Network error: ${error.message}`);
        }
      }
    }

    console.log('\n⚠️  Could not send email from any region');
    console.log('   Please check:');
    console.log('   1. Your Zoho account has email sending enabled');
    console.log('   2. Your mobile number is verified in Zoho Accounts');
    console.log('   3. The invoice ID is correct');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

testEmailDelivery();

