// Test arabic-reshaper
const reshaper = require('arabic-reshaper');

const text = 'تذكرة الحجز';
console.log('Original:', text);
console.log('Shaped:', reshaper.convertArabic(text));
console.log('Reversed:', reshaper.convertArabic(text).split('').reverse().join(''));

