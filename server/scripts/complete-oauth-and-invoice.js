import pg from 'pg';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

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
const API_URL = process.env.API_URL || 'http://localhost:3001/api';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function checkServer() {
  try {
    const response = await axios.get(`${API_URL.replace('/api', '')}/health`, { timeout: 2000 });
    return true;
  } catch (error) {
    return false;
  }
}

async function checkZohoStatus() {
  try {
    const response = await axios.get(`${API_URL}/zoho/status?tenant_id=${tenantId}`);
    return response.data;
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

async function createInvoiceViaAPI() {
  try {
    console.log('\n📋 Creating invoice via API...');
    const response = await axios.post(
      `${API_URL}/zoho/test-invoice`,
      {
        tenant_id: tenantId,
        booking_id: bookingId,
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function main() {
  console.log('🚀 Zoho Invoice Creation Helper\n');
  console.log('='.repeat(60));
  console.log(`Booking ID: ${bookingId}`);
  console.log(`Customer Email: ${customerEmail}`);
  console.log(`Tenant ID: ${tenantId}`);
  console.log('='.repeat(60));

  // Step 1: Check server
  console.log('\n📋 Step 1: Checking server status...');
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log('❌ Server is not running!');
    console.log('\n💡 Please start the server first:');
    console.log('   cd project/server');
    console.log('   npm run dev');
    rl.close();
    await pool.end();
    return;
  }
  console.log('✅ Server is running');

  // Step 2: Check Zoho status
  console.log('\n📋 Step 2: Checking Zoho connection status...');
  const status = await checkZohoStatus();
  
  if (!status.connected) {
    console.log('❌ Zoho is not connected');
    console.log('\n💡 You need to complete the OAuth flow:');
    console.log('\n   1. Open this URL in your browser:');
    console.log(`      ${API_URL.replace('/api', '')}/api/zoho/auth?tenant_id=${tenantId}`);
    console.log('\n   2. Sign in to Zoho and authorize the application');
    console.log('\n   3. You will be redirected to a success page');
    console.log('\n   4. Then press Enter here to continue...');
    
    await question('\n   Press Enter after completing OAuth...');
    
    // Check again
    console.log('\n   Checking connection again...');
    const newStatus = await checkZohoStatus();
    if (!newStatus.connected) {
      console.log('❌ Still not connected. Please try again.');
      rl.close();
      await pool.end();
      return;
    }
    console.log('✅ Zoho connected!');
  } else {
    console.log('✅ Zoho is already connected');
    if (status.status === 'expired') {
      console.log('   ⚠️  Token is expired, but will be refreshed automatically');
    }
  }

  // Step 3: Create invoice
  console.log('\n📋 Step 3: Creating invoice...');
  try {
    const result = await createInvoiceViaAPI();
    
    if (result.success) {
      console.log('\n🎉 SUCCESS! Invoice created!');
      console.log(`\n📊 Summary:`);
      console.log(`   Invoice ID: ${result.invoice_id}`);
      console.log(`   Booking ID: ${bookingId}`);
      console.log(`   Customer: ${customerEmail}`);
      console.log(`   Message: ${result.message}`);
    } else {
      console.log('\n❌ Invoice creation failed:');
      console.log(`   ${result.error}`);
    }
  } catch (error) {
    console.log('\n❌ Error creating invoice:');
    if (error.message) {
      console.log(`   ${error.message}`);
    } else {
      console.log(`   ${error}`);
    }
    
    // Check if it's an auth error
    if (error.response?.status === 401) {
      console.log('\n💡 Token may be invalid. Please complete OAuth flow again:');
      console.log(`   ${API_URL.replace('/api', '')}/api/zoho/auth?tenant_id=${tenantId}`);
    }
  }

  rl.close();
  await pool.end();
}

main().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});

