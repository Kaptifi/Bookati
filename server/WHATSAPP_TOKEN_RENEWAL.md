# كيفية تجديد WhatsApp Access Token

## المشكلة
إذا رأيت رسالة خطأ:
```
Error validating access token: The session is invalid because the user logged out.
```

هذا يعني أن **WhatsApp Access Token** منتهي الصلاحية أو غير صالح.

## الحل

### الطريقة 1: تجديد Token من Facebook Developers

1. **اذهب إلى Facebook Developers:**
   - افتح: https://developers.facebook.com/
   - سجل الدخول بحساب Facebook الخاص بك

2. **انتقل إلى تطبيقك:**
   - من القائمة، اختر **My Apps**
   - اختر التطبيق المرتبط بـ WhatsApp Business API

3. **انتقل إلى WhatsApp API Setup:**
   - من القائمة الجانبية، اختر **WhatsApp** > **API Setup**
   - أو اذهب مباشرة إلى: `https://developers.facebook.com/apps/{YOUR_APP_ID}/whatsapp-business/wa-dev-console`

4. **انسخ Access Token:**
   - في قسم **Temporary access token** أو **System user access token**
   - انقر على **Copy** لنسخ الـ token

5. **حدّث الإعدادات:**

   **أ) في ملف `.env`:**
   ```env
   WHATSAPP_ACCESS_TOKEN=YOUR_NEW_TOKEN_HERE
   ```
   
   **ب) أو في لوحة التحكم (Tenant Settings):**
   - اذهب إلى Settings > WhatsApp Settings
   - الصق الـ token الجديد في حقل **Access Token**
   - احفظ التغييرات

6. **أعد تشغيل الخادم:**
   ```powershell
   # أوقف الخادم (Ctrl+C)
   # ثم أعد تشغيله
   npm run dev
   ```

### الطريقة 2: إنشاء System User Token (مستمر)

للحصول على token لا ينتهي صلاحيته:

1. **انتقل إلى System Users:**
   - في Facebook Developers، اذهب إلى **Business Settings**
   - اختر **System Users** من القائمة

2. **أنشئ System User جديد:**
   - انقر على **Add**
   - أدخل اسم واختر **System User**
   - انقر **Create System User**

3. **أضف الصلاحيات:**
   - انقر على System User الذي أنشأته
   - انقر **Assign Assets**
   - اختر **WhatsApp Business Account** الخاص بك
   - انقر **Save Changes**

4. **أنشئ Token:**
   - انقر **Generate New Token**
   - اختر **whatsapp_business_messaging** و **whatsapp_business_management**
   - انقر **Generate Token**
   - **انسخ الـ token فوراً** (لن تتمكن من رؤيته مرة أخرى!)

5. **حدّث الإعدادات** (كما في الطريقة 1)

## ملاحظات مهمة

- **Temporary Tokens** تنتهي صلاحيتها بعد **60 يوم**
- **System User Tokens** لا تنتهي صلاحيتها (إلا إذا تم إلغاؤها يدوياً)
- عند انتهاء صلاحية الـ token، سيتم **التحويل تلقائياً إلى Email** كـ fallback
- تأكد من أن **Email** مفعّل كـ fallback في إعدادات المستخدم

## التحقق من Token

يمكنك اختبار الـ token باستخدام:

```bash
curl -X GET "https://graph.facebook.com/v22.0/me?access_token=YOUR_TOKEN"
```

إذا كان الـ token صالح، ستحصل على معلومات عن التطبيق.

## استكشاف الأخطاء

### Token لا يعمل بعد التحديث
- تأكد من نسخ الـ token بالكامل (بدون مسافات)
- تأكد من إعادة تشغيل الخادم
- تحقق من أن الـ token له الصلاحيات الصحيحة

### لا يمكن إنشاء System User
- تأكد من أن لديك صلاحيات **Admin** في Business Account
- تأكد من أن WhatsApp Business API مفعّل في التطبيق

### Token يعمل لكن الرسائل لا تُرسل
- تحقق من **Phone Number ID** (يجب أن يكون صحيحاً)
- تحقق من أن رقم الهاتف مسجّل في WhatsApp Business Account
- تحقق من أن المستلم لديه رقم WhatsApp نشط

