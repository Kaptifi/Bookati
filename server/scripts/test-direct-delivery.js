import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const bookingId = process.argv[2] || '3bd1b8f1-cd6e-4a60-b336-71a8d3cb9bcc';
const tenantId = '63107b06-938e-4ce6-b0f3-520a87db397b';

async function testDirectDelivery() {
  try {
    console.log('🧪 Testing Direct Invoice Delivery\n');
    console.log('='.repeat(60));
    console.log(`Booking ID: ${bookingId}`);
    console.log(`Tenant ID: ${tenantId}\n`);

    // Import zohoService (relative path - tsx will handle TypeScript)
    const { zohoService } = await import('../src/services/zohoService.ts');

    console.log('📋 Step 1: Calling generateReceipt...\n');
    const result = await zohoService.generateReceipt(bookingId);

    console.log('\n📊 Result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Invoice ID: ${result.invoiceId || 'N/A'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    console.log('\n💡 Check the logs above for:');
    console.log('   - [ZohoService] 📧 Attempting to send invoice via email...');
    console.log('   - [ZohoService] 📱 Step 2-3: Downloading invoice PDF...');
    console.log('   - Any error messages');

    if (result.success) {
      console.log('\n✅ generateReceipt completed successfully');
      console.log('   If invoices were not sent, check the error messages above');
    } else {
      console.log('\n❌ generateReceipt failed');
      console.log(`   Error: ${result.error}`);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testDirectDelivery();

