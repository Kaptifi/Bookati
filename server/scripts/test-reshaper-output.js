import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const reshaper = require('arabic-reshaper');

const tests = [
  'تذكرة الحجز',
  'تفاصيل الحدث',
  'التاريخ والوقت',
  'نوع التذكرة',
  'اسم العميل',
  'السعر',
  'ريال'
];

console.log('Testing arabic-reshaper output:\n');

tests.forEach(text => {
  const shaped = reshaper.convertArabic(text);
  const reversed = shaped.split('').reverse().join('');
  
  console.log(`Original: ${text}`);
  console.log(`Shaped:   ${shaped}`);
  console.log(`Reversed: ${reversed}`);
  console.log('---');
});

