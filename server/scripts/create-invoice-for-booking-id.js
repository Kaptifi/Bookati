import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const bookingId = process.argv[2] || 'db5c3ee3-2c28-40af-92f5-d47ee420402d';
const API_URL = process.env.API_URL || 'http://localhost:3001/api';

async function createInvoice() {
  console.log('🚀 Creating Invoice for Booking\n');
  console.log('='.repeat(60));
  console.log(`Booking ID: ${bookingId}`);
  console.log('='.repeat(60));

  try {
    // First, get booking details to get tenant_id
    const bookingResponse = await axios.get(
      `${API_URL}/bookings/${bookingId}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    ).catch(() => null);

    const tenantId = bookingResponse?.data?.tenant_id || '63107b06-938e-4ce6-b0f3-520a87db397b';

    console.log(`\n📋 Creating invoice via API...`);
    const response = await axios.post(
      `${API_URL}/zoho/test-invoice`,
      {
        tenant_id: tenantId,
        booking_id: bookingId,
      },
      {
        timeout: 30000,
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
    }
  } catch (error) {
    console.log('\n❌ Error creating invoice:');
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.log(`   ${error.message}`);
    }
  }
}

createInvoice();

