# كيفية تشغيل السيرفر

## الطريقة السريعة:

1. افتح Terminal في مجلد `project/server`
2. قم بتشغيل الأمر:
   ```bash
   npm run dev
   ```

## أو استخدم ملف Batch (Windows):

1. انقر نقراً مزدوجاً على `start-server.bat` في مجلد `project/server`

## التحقق من أن السيرفر يعمل:

- يجب أن ترى رسالة: `Server running on port 3001`
- يجب أن ترى: `Database connected`

## استكشاف الأخطاء:

### الخطأ: `ERR_CONNECTION_REFUSED`
- **السبب**: السيرفر غير قيد التشغيل
- **الحل**: قم بتشغيل السيرفر باستخدام `npm run dev`

### الخطأ: `Port 3001 is already in use`
- **السبب**: المنفذ 3001 مستخدم بالفعل
- **الحل**: 
  - أوقف السيرفر السابق (Ctrl+C)
  - أو غيّر المنفذ في `.env` و `src/index.ts`

### الخطأ: `Database connection failed`
- **السبب**: قاعدة البيانات غير متصلة
- **الحل**: 
  - تأكد من أن PostgreSQL يعمل
  - تحقق من `DATABASE_URL` في `.env`

## ملاحظات:

- السيرفر يعمل في وضع `watch mode` - أي أنه يعيد التشغيل تلقائياً عند تغيير الملفات
- لإيقاف السيرفر: اضغط `Ctrl+C` في Terminal

