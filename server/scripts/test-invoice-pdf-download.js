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

async function testInvoicePdfDownload() {
  const client = await pool.connect();
  try {
    console.log('🧪 Testing Invoice PDF Download\n');
    console.log('='.repeat(60));
    console.log(`Invoice ID: ${invoiceId}`);
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

    // Test different regions and endpoints
    const tests = [
      { name: 'US - PDF endpoint', url: `https://invoice.zoho.com/api/v3/invoices/${invoiceId}`, params: { accept: 'pdf' } },
      { name: 'EU - PDF endpoint', url: `https://invoice.zoho.eu/api/v3/invoices/${invoiceId}`, params: { accept: 'pdf' } },
      { name: 'IN - PDF endpoint', url: `https://invoice.zoho.in/api/v3/invoices/${invoiceId}`, params: { accept: 'pdf' } },
      { name: 'US - JSON endpoint', url: `https://invoice.zoho.com/api/v3/invoices/${invoiceId}` },
      { name: 'EU - JSON endpoint', url: `https://invoice.zoho.eu/api/v3/invoices/${invoiceId}` },
      { name: 'IN - JSON endpoint', url: `https://invoice.zoho.in/api/v3/invoices/${invoiceId}` },
    ];

    for (const test of tests) {
      try {
        console.log(`Testing ${test.name}...`);
        const response = await axios.get(test.url, {
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
          },
          params: test.params,
          responseType: test.params?.accept === 'pdf' ? 'arraybuffer' : 'json',
        });

        if (test.params?.accept === 'pdf') {
          const size = Buffer.from(response.data).length;
          console.log(`   ✅ SUCCESS! PDF downloaded (${(size / 1024).toFixed(2)} KB)`);
          console.log(`   ✅ Your organization region: ${test.url.includes('.zoho.eu') ? 'EU' : test.url.includes('.zoho.in') ? 'India' : 'US'}`);
          console.log(`   ✅ Use this API Base URL: ${test.url.replace(`/invoices/${invoiceId}`, '')}`);
          return;
        } else {
          console.log(`   ✅ SUCCESS! Invoice found (JSON)`);
          console.log(`   ✅ Your organization region: ${test.url.includes('.zoho.eu') ? 'EU' : test.url.includes('.zoho.in') ? 'India' : 'US'}`);
          console.log(`   ✅ Use this API Base URL: ${test.url.replace(`/invoices/${invoiceId}`, '')}`);
          console.log(`   ⚠️  But PDF download might need different permissions`);
        }
      } catch (error) {
        if (error.response) {
          const status = error.response.status;
          const errorData = error.response.data;
          let errorMsg = '';
          if (Buffer.isBuffer(errorData)) {
            try {
              const json = JSON.parse(errorData.toString());
              errorMsg = json.message || json.error || '';
            } catch {
              errorMsg = 'Binary data';
            }
          } else {
            errorMsg = errorData?.message || errorData?.error || '';
          }
          console.log(`   ❌ ${status} ${errorMsg || 'Error'}`);
        } else {
          console.log(`   ❌ Network error: ${error.message}`);
        }
      }
    }

    console.log('\n⚠️  Could not download PDF from any region');
    console.log('   This might mean:');
    console.log('   1. The invoice ID is incorrect');
    console.log('   2. The token doesn\'t have PDF download permissions');
    console.log('   3. The organization is in a different region');
    console.log('\n💡 Please check:');
    console.log('   1. Log in to Zoho Invoice');
    console.log('   2. Check the URL (invoice.zoho.com, invoice.zoho.eu, etc.)');
    console.log('   3. Find the invoice and check its ID');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

testInvoicePdfDownload();

