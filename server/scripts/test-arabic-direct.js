/**
 * Test Arabic text directly without reversal
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const reshaper = require('arabic-reshaper');

const testTexts = [
  'تذكرة الحجز',
  'تفاصيل الحدث',
  'التاريخ والوقت',
  'نوع التذكرة',
  'اسم العميل',
  'السعر',
  'ريال',
  'معلومات التذكرة'
];

console.log('Testing Arabic text processing:\n');
console.log('='.repeat(60));

testTexts.forEach(text => {
  const shaped = reshaper.convertArabic(text);
  const reversed = shaped.split('').reverse().join('');
  
  console.log(`\nOriginal:  ${text}`);
  console.log(`Shaped:    ${shaped}`);
  console.log(`Reversed:  ${reversed}`);
  console.log(`\nAnalysis:`);
  console.log(`  - Shaped has proper connections: ${shaped !== text ? 'YES' : 'NO'}`);
  console.log(`  - Reversed breaks connections: ${reversed !== shaped ? 'YES' : 'NO'}`);
});

console.log('\n' + '='.repeat(60));
console.log('\nConclusion:');
console.log('  - Use SHAPED text (ﺗﺬﻛﺮﺓ) with right alignment');
console.log('  - Do NOT reverse - it breaks letter connections');
console.log('  - PDFKit will render shaped text correctly with right align');

