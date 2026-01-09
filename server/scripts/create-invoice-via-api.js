import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const customerEmail = 'kaptifidev@gmail.com';
const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';

async function createInvoiceViaAPI() {
  console.log('📧 Creating Zoho Invoice via API\n');
  console.log('='.repeat(60));
  
  // First, we need to find the booking and tenant
  // Since we can't query DB directly, we'll use the API
  
  console.log('\n💡 Instructions:');
  console.log('   1. Make sure the server is running:');
  console.log('      cd project/server && npm run dev');
  console.log('\n   2. Connect Zoho for the tenant:');
  console.log('      Visit: http://localhost:3001/api/zoho/auth?tenant_id=<tenant_uuid>');
  console.log('      Complete OAuth flow');
  console.log('\n   3. Update booking payment status to "paid":');
  console.log('      PATCH http://localhost:3001/api/bookings/<booking_id>/payment-status');
  console.log('      Body: { "payment_status": "paid" }');
  console.log('\n   4. The invoice will be created automatically via the database trigger');
  console.log('      OR call the test endpoint:');
  console.log('      POST http://localhost:3001/api/zoho/test-invoice');
  console.log('      Body: { "tenant_id": "<uuid>", "booking_id": "<uuid>" }');
  
  console.log('\n📋 Quick Test:');
  console.log('   Check if server is running...\n');
  
  try {
    const healthResponse = await fetch(`${API_URL}/api/health`);
    if (healthResponse.ok) {
      console.log('✅ Server is running');
      console.log(`   API URL: ${API_URL}`);
      
      // Try to get booking info (would need an endpoint for this)
      console.log('\n💡 To create invoice:');
      console.log(`   1. Find booking ID for email: ${customerEmail}`);
      console.log(`   2. Get tenant ID for that booking`);
      console.log(`   3. Connect Zoho: GET ${API_URL}/api/zoho/auth?tenant_id=<tenant_id>`);
      console.log(`   4. Create invoice: POST ${API_URL}/api/zoho/test-invoice`);
      console.log(`      { "tenant_id": "<uuid>", "booking_id": "<uuid>" }`);
    } else {
      console.log('❌ Server health check failed');
      console.log(`   Status: ${healthResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Server is not running or not accessible');
    console.log(`   Error: ${error.message}`);
    console.log(`\n💡 Start the server:`);
    console.log(`   cd project/server && npm run dev`);
  }
}

createInvoiceViaAPI().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

