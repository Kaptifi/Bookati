import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const bookingId = '29d01803-8b04-4e4d-a5af-9eba4ff49dd0';
const tenantId = '63107b06-938e-4ce6-b0f3-520a87db397b';
const API_URL = process.env.API_URL || 'http://localhost:3001/api';

async function main() {
  console.log('🚀 Creating Zoho Invoice via API\n');
  console.log('='.repeat(60));
  console.log(`Booking ID: ${bookingId}`);
  console.log(`Tenant ID: ${tenantId}`);
  console.log('='.repeat(60));

  // Step 1: Check Zoho status
  console.log('\n📋 Step 1: Checking Zoho connection...');
  try {
    const statusResponse = await axios.get(`${API_URL}/zoho/status?tenant_id=${tenantId}`);
    const status = statusResponse.data;
    
    if (!status.connected) {
      console.log('❌ Zoho is not connected!');
      console.log('\n💡 Complete OAuth flow first:');
      console.log(`\n   1. Open this URL in your browser:`);
      console.log(`      http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
      console.log(`\n   2. Sign in to Zoho and authorize the application`);
      console.log(`\n   3. You'll see a success page`);
      console.log(`\n   4. Then run this script again`);
      process.exit(1);
    }
    
    console.log('✅ Zoho is connected');
    if (status.status === 'expired') {
      console.log('   ⚠️  Token is expired, but will be refreshed automatically');
    }
  } catch (error) {
    console.log('❌ Error checking Zoho status:');
    if (error.code === 'ECONNREFUSED') {
      console.log('   Server is not running!');
      console.log('\n💡 Start the server first:');
      console.log('   cd project/server');
      console.log('   npm run dev');
    } else {
      console.log(`   ${error.message}`);
    }
    process.exit(1);
  }

  // Step 2: Create invoice
  console.log('\n📋 Step 2: Creating invoice...');
  try {
    const response = await axios.post(
      `${API_URL}/zoho/test-invoice`,
      {
        tenant_id: tenantId,
        booking_id: bookingId,
      },
      {
        timeout: 30000, // 30 seconds
      }
    );

    if (response.data.success) {
      console.log('\n🎉 SUCCESS! Invoice created and sent!');
      console.log(`\n📊 Summary:`);
      console.log(`   Invoice ID: ${response.data.invoice_id}`);
      console.log(`   Booking ID: ${bookingId}`);
      console.log(`   Message: ${response.data.message}`);
      console.log(`\n✅ Invoice has been sent to the customer's email`);
    } else {
      console.log('\n❌ Invoice creation failed:');
      console.log(`   ${response.data.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.log('\n❌ Error creating invoice:');
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
      
      if (error.response.status === 401) {
        console.log('\n💡 Token may be invalid. Complete OAuth flow again:');
        console.log(`   http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.log('   Server is not running!');
      console.log('\n💡 Start the server first:');
      console.log('   cd project/server');
      console.log('   npm run dev');
    } else {
      console.log(`   ${error.message}`);
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

