import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const reshaper = require('arabic-reshaper');

const text = 'تذكرة الحجز';
const shaped = reshaper.convertArabic(text);
const wordOrderReversed = shaped.split(' ').reverse().join(' ');

console.log('Original:           ', text);
console.log('Shaped:             ', shaped);
console.log('Word order reversed:', wordOrderReversed);
console.log('\nThis should preserve letter connections while achieving RTL word order.');

