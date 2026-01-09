import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const invoiceId = process.argv[2] || '7919157000000117031';
const API_URL = process.env.API_URL || 'http://localhost:3001/api';

async function testInvoiceDownload() {
  try {
    console.log('🧪 Testing Invoice Download Endpoint\n');
    console.log('='.repeat(60));
    console.log(`Invoice ID: ${invoiceId}`);
    console.log(`API URL: ${API_URL}/zoho/invoices/${invoiceId}/download\n`);

    // Test 1: Check if server is running
    console.log('📡 Test 1: Checking if server is running...');
    try {
      const healthResponse = await fetch(`${API_URL.replace('/api', '')}/health`);
      if (healthResponse.ok) {
        console.log('✅ Server is running\n');
      } else {
        console.log('⚠️  Server responded but health check failed\n');
      }
    } catch (error) {
      console.error('❌ Server is not running or not accessible');
      console.error(`   Error: ${error.message}`);
      console.error(`   Make sure the server is running: cd project/server && npm run dev\n`);
      return;
    }

    // Test 2: Test the download endpoint
    console.log('📥 Test 2: Testing invoice download endpoint...');
    const response = await fetch(`${API_URL}/zoho/invoices/${invoiceId}/download`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token', // Token might not be needed for this test
      },
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Download failed: ${errorText}\n`);
      return;
    }

    const contentType = response.headers.get('content-type');
    console.log(`   Content-Type: ${contentType}`);

    if (contentType && contentType.includes('application/pdf')) {
      const blob = await response.blob();
      console.log(`✅ PDF downloaded successfully!`);
      console.log(`   Size: ${blob.size} bytes (${(blob.size / 1024).toFixed(2)} KB)\n`);
    } else {
      const text = await response.text();
      console.error(`❌ Response is not PDF:`);
      console.error(text.substring(0, 500));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testInvoiceDownload();

