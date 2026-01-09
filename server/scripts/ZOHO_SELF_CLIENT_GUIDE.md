# Zoho Self Client Token Exchange Guide

## Overview

This guide explains how to use the Self Client flow to exchange an authorization code for OAuth tokens without requiring a redirect URI.

## What is Self Client Flow?

The Self Client flow allows you to:
- Exchange a one-time authorization code for `access_token` and `refresh_token`
- Store tokens securely in the database
- Use `refresh_token` to get new `access_token` when needed
- No redirect URI required (server-to-server)

## Prerequisites

1. **self_client.json** file with:
   - `client_id`: Your Zoho client ID
   - `client_secret`: Your Zoho client secret
   - `code`: Authorization code (one-time use)
   - `scope`: Requested permissions
   - `grant_type`: "authorization_code"

2. **Database migrations applied**:
   ```bash
   node scripts/apply-zoho-migrations-simple.js
   ```

## Step-by-Step Process

### Step 1: Read self_client.json

The script reads credentials securely from the backend file:

```javascript
const credentials = readSelfClientJson();
// Returns: { client_id, client_secret, code, scope, grant_type }
```

**Security**: File is never exposed to frontend, only read on backend.

### Step 2: Exchange Code for Tokens

Makes POST request to Zoho token endpoint:

```javascript
POST https://accounts.zoho.com/oauth/v2/token
Params:
  - grant_type: "authorization_code"
  - client_id: <from self_client.json>
  - client_secret: <from self_client.json>
  - code: <from self_client.json>
```

**Response**:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### Step 3: Store Tokens Securely

Tokens are stored in `zoho_tokens` table:

```sql
INSERT INTO zoho_tokens (tenant_id, access_token, refresh_token, expires_at)
VALUES ($1, $2, $3, $4)
ON CONFLICT (tenant_id) DO UPDATE ...
```

**Security**:
- Tokens stored in database, not files
- Refresh token saved for long-term use
- Access token expires and is refreshed automatically

### Step 4: Use Refresh Token

When access token expires, use refresh token:

```javascript
// Automatic refresh via zohoService
const accessToken = await zohoService.getAccessToken(tenantId);
// Service automatically refreshes if expired
```

## Running the Script

```bash
cd project/server
node scripts/exchange-code-for-tokens.js
```

## Expected Output

```
🚀 Zoho Self Client Token Exchange
============================================================
Tenant ID: 63107b06-938e-4ce6-b0f3-520a87db397b
============================================================

📄 Step 1: Reading self_client.json...
✅ Successfully loaded credentials from self_client.json
   Client ID: 1000.11W8WXV5NH...
   Code present: Yes

🔄 Step 2: Exchanging authorization code for tokens...
✅ Successfully obtained tokens from Zoho
   Access token: 1000.abc123...
   Refresh token: 1000.xyz789...
   Expires in: 3600 seconds (1 hours)

💾 Step 3: Storing tokens securely in database...
✅ Tokens stored securely in database

✅ SUCCESS! Token exchange completed successfully
```

## Error Handling

### Invalid Grant Error

```
Error: Invalid authorization code. The code may be expired or already used.
```

**Solution**: Generate a new authorization code from Zoho Developer Console.

### Invalid Client Error

```
Error: Invalid client credentials.
```

**Solution**: Check `client_id` and `client_secret` in `self_client.json`.

### Missing Table Error

```
Error: zoho_tokens table does not exist.
```

**Solution**: Run database migrations:
```bash
node scripts/apply-zoho-migrations-simple.js
```

## Using Tokens in Your Code

### Get Access Token (Auto-refresh)

```javascript
import { zohoService } from './services/zohoService';

// Automatically gets valid token, refreshes if needed
const accessToken = await zohoService.getAccessToken(tenantId);
```

### Manual Refresh

```javascript
// Get refresh token from database
const { refresh_token } = await getStoredTokens(tenantId);

// Refresh access token
const newAccessToken = await zohoService.refreshAccessToken(tenantId, refresh_token);
```

### Create Invoice

```javascript
const invoiceData = {
  customer_name: "John Doe",
  customer_email: "john@example.com",
  line_items: [{
    name: "Service Name",
    rate: 100,
    quantity: 1,
  }],
  // ... other fields
};

const invoice = await zohoService.createInvoice(tenantId, invoiceData);
```

## Security Best Practices

1. ✅ **Never commit self_client.json** - Already in `.gitignore`
2. ✅ **Use environment variables in production** - Override file-based credentials
3. ✅ **Store tokens in database** - Not in files or environment
4. ✅ **Rotate refresh tokens** - If compromised, revoke and regenerate
5. ✅ **Monitor token expiration** - Service auto-refreshes, but monitor logs
6. ✅ **Use HTTPS in production** - All API calls should be encrypted

## Production Deployment

1. **Set environment variables**:
   ```env
   ZOHO_CLIENT_ID=your_client_id
   ZOHO_CLIENT_SECRET=your_client_secret
   ZOHO_TENANT_ID=your_tenant_id
   ```

2. **Remove self_client.json** (or keep as fallback)

3. **Run token exchange**:
   ```bash
   node scripts/exchange-code-for-tokens.js
   ```

4. **Verify tokens stored**:
   ```sql
   SELECT tenant_id, expires_at FROM zoho_tokens;
   ```

## Troubleshooting

### Code Already Used

If you get "invalid_grant", the code was already used. Generate a new one from Zoho Developer Console.

### Token Refresh Fails

Check:
- Refresh token is still valid (not revoked)
- Client credentials are correct
- Network connectivity to Zoho API

### Database Connection Issues

Ensure:
- Database is running
- `DATABASE_URL` is correct in `.env`
- Migrations are applied

## Next Steps

After successful token exchange:

1. **Create invoices**: `node scripts/create-invoice-simple-api.js`
2. **Test API calls**: Use `zohoService.getAccessToken()` in your code
3. **Monitor expiration**: Check logs for auto-refresh messages

