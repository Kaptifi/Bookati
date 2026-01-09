/**
 * Final Arabic Ticket Test
 * 
 * This script creates a new booking with Arabic language and generates a ticket
 * to verify the complete flow works end-to-end.
 */

import { Pool } from 'pg';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

async function testArabicTicketFinal() {
  const client = await pool.connect();
  
  try {
    console.log('🎫 ========================================');
    console.log('🎫 Final Arabic Ticket Test');
    console.log('🎫 ========================================\n');
    
    // Find the latest Arabic booking
    const bookingResult = await client.query(`
      SELECT 
        b.id,
        b.customer_name,
        b.language,
        b.created_at,
        s.name as service_name_en,
        s.name_ar as service_name_ar
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.language = 'ar'
      ORDER BY b.created_at DESC
      LIMIT 1
    `);
    
    if (bookingResult.rows.length === 0) {
      console.error('❌ No Arabic bookings found. Please create a booking with Arabic language first.');
      return;
    }
    
    const booking = bookingResult.rows[0];
    console.log('📋 Testing with booking:');
    console.log(`   ID: ${booking.id}`);
    console.log(`   Customer: ${booking.customer_name}`);
    console.log(`   Language: ${booking.language}`);
    console.log(`   Service (EN): ${booking.service_name_en}`);
    console.log(`   Service (AR): ${booking.service_name_ar || 'NOT SET'}`);
    console.log(`   Created: ${new Date(booking.created_at).toLocaleString()}\n`);
    
    // Generate PDF
    console.log('📄 Generating PDF ticket...\n');
    const pdfService = await import('../src/services/pdfService.ts');
    const pdfBase64 = await pdfService.generateBookingTicketPDFBase64(booking.id, 'ar');
    
    if (!pdfBase64 || pdfBase64.length === 0) {
      console.error('❌ Failed to generate PDF');
      return;
    }
    
    // Save PDF
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const outputPath = join(__dirname, 'final-arabic-ticket.pdf');
    writeFileSync(outputPath, pdfBuffer);
    
    console.log('✅ PDF Generated Successfully!');
    console.log(`   File: ${outputPath}`);
    console.log(`   Size: ${(pdfBuffer.length / 1024).toFixed(2)} KB\n`);
    
    // Final checklist
    console.log('🎫 ========================================');
    console.log('✅ ARABIC TICKET GENERATION - COMPLETE!');
    console.log('🎫 ========================================\n');
    
    console.log('📋 Verification Steps:');
    console.log('   1. Open: final-arabic-ticket.pdf');
    console.log('   2. Verify Arabic text is readable (not garbled)');
    console.log('   3. Check text flows right-to-left');
    console.log('   4. Confirm letters are properly connected');
    console.log('   5. Verify service name appears in Arabic\n');
    
    console.log('✅ Expected Arabic Content:');
    console.log('   - تذكرة الحجز (Booking Ticket)');
    console.log('   - تفاصيل الحدث (Event Details)');
    console.log('   - التاريخ والوقت (Date & Time)');
    console.log('   - نوع التذكرة (Ticket Type)');
    console.log('   - كبار / أطفال (Adult / Child)');
    console.log('   - اسم العميل (Customer Name)');
    console.log('   - السعر (Price)');
    console.log('   - ريال (SAR)');
    console.log('   - معلومات التذكرة (Ticket Information)\n');
    
    console.log('🎉 If all text is readable and properly connected, the fix is complete!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testArabicTicketFinal().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

