# Quick Guide: Create Invoice for kaptifidev@gmail.com

## Current Booking Info
- **Booking ID**: `29d01803-8b04-4e4d-a5af-9eba4ff49dd0`
- **Customer Email**: `kaptifidev@gmail.com`
- **Tenant ID**: `63107b06-938e-4ce6-b0f3-520a87db397b`
- **Amount**: 362.00 SAR

## Quick Steps

### 1. Start Server
```bash
cd project/server
npm run dev
```

### 2. Connect Zoho (One-time setup)
Open in browser:
```
http://localhost:3001/api/zoho/auth?tenant_id=63107b06-938e-4ce6-b0f3-520a87db397b
```

Complete OAuth flow, then verify:
```
http://localhost:3001/api/zoho/status?tenant_id=63107b06-938e-4ce6-b0f3-520a87db397b
```

### 3. Create Invoice

**Method 1: Via API (Recommended)**
```bash
curl -X POST http://localhost:3001/api/zoho/test-invoice \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "63107b06-938e-4ce6-b0f3-520a87db397b",
    "booking_id": "29d01803-8b04-4e4d-a5af-9eba4ff49dd0"
  }'
```

**Method 2: Via Script**
```bash
cd project/server
node scripts/create-invoice-after-oauth.js
```

## Expected Result

- ✅ Invoice created in Zoho
- ✅ Invoice ID stored in database
- ✅ Email sent to kaptifidev@gmail.com
- ✅ Invoice visible in Zoho dashboard

## Check Results

```sql
SELECT zoho_invoice_id, zoho_invoice_created_at 
FROM bookings 
WHERE id = '29d01803-8b04-4e4d-a5af-9eba4ff49dd0';
```

