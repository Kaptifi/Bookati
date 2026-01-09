# Zoho Credentials Setup Guide

This guide explains how to securely configure Zoho OAuth credentials for the booking system.

## Overview

The system supports two methods for loading Zoho credentials:

1. **Environment Variables** (Recommended for Production)
2. **self_client.json File** (Development/Testing)

## Method 1: Environment Variables (Production)

Add these to your `server/.env` file:

```env
# Zoho OAuth Configuration
ZOHO_CLIENT_ID=your_client_id_here
ZOHO_CLIENT_SECRET=your_client_secret_here
ZOHO_REDIRECT_URI=http://localhost:3001/api/zoho/callback
ZOHO_SCOPE=ZohoInvoice.invoices.CREATE,ZohoInvoice.invoices.READ,ZohoInvoice.invoices.UPDATE

# Zoho API Base URL
ZOHO_API_BASE_URL=https://invoice.zoho.com/api/v3
```

**Advantages:**
- ✅ Most secure for production
- ✅ No files to manage
- ✅ Easy to rotate credentials
- ✅ Works with containerized deployments

## Method 2: self_client.json File (Development)

1. Copy the example file:
   ```bash
   cp server/self_client.json.example server/self_client.json
   ```

2. Edit `server/self_client.json` with your credentials:
   ```json
   {
     "client_id": "1000.11W8WXV5NHQZK87XTN54UNREEVFTEW",
     "client_secret": "51f35f11fe3a89107abfc7b3cce504ab286fd688ab",
     "scope": [
       "ZohoInvoice.invoices.CREATE",
       "ZohoInvoice.invoices.READ",
       "ZohoInvoice.invoices.UPDATE"
     ]
   }
   ```

3. The file is automatically excluded from git (see `.gitignore`)

**Advantages:**
- ✅ Easy for local development
- ✅ No need to set environment variables
- ✅ Can store additional OAuth data (code, expiry_time)

## Security Notes

### ✅ Secure Practices

- **Credentials are loaded only on the backend** - Never exposed to frontend
- **Stored in memory only** - Not persisted in logs or responses
- **Environment variables take priority** - Override file-based credentials
- **File excluded from git** - `self_client.json` is in `.gitignore`

### ⚠️ Important Warnings

1. **Never commit credentials to version control**
   - `self_client.json` is in `.gitignore`
   - Environment variables should not be in `.env` files committed to git

2. **Use environment variables in production**
   - File-based credentials are for development only
   - Production should always use environment variables

3. **Rotate credentials if exposed**
   - If credentials are accidentally committed, rotate them immediately in Zoho Developer Console

## How It Works

### Credential Loading Priority

```
1. Check environment variables (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET)
   ↓ (if not found)
2. Load from self_client.json file
   ↓ (if not found)
3. Throw error (credentials required)
```

### Code Flow

```typescript
// Backend only - credentials never sent to frontend
import { zohoCredentials } from './config/zohoCredentials';

// Load credentials (cached after first load)
const clientId = zohoCredentials.getClientId();
const clientSecret = zohoCredentials.getClientSecret();

// Use for OAuth flows
const tokenResponse = await axios.post('https://accounts.zoho.com/oauth/v2/token', {
  client_id: clientId,
  client_secret: clientSecret,
  // ... other params
});
```

## Verification

After setting up credentials, verify they're loaded correctly:

1. **Check server startup logs:**
   ```
   [ZohoCredentials] ✅ Loaded credentials from environment variables
   ```
   or
   ```
   [ZohoCredentials] ✅ Loaded credentials from self_client.json
   ```

2. **Test OAuth flow:**
   ```
   GET /api/zoho/auth?tenant_id=<uuid>
   ```
   Should redirect to Zoho authorization page without errors.

## Troubleshooting

### Error: "Zoho credentials not found"

**Solution:**
- Ensure either environment variables are set OR `self_client.json` exists
- Check file path: `server/self_client.json`
- Verify file has valid JSON with `client_id` and `client_secret`

### Error: "Invalid JSON in self_client.json"

**Solution:**
- Validate JSON syntax (use JSON validator)
- Ensure no trailing commas
- Check file encoding (should be UTF-8)

### Credentials not working

**Solution:**
1. Verify credentials in Zoho Developer Console
2. Check if credentials are expired (for self-client)
3. Ensure correct data center URL matches your Zoho account region
4. Clear credential cache: `zohoCredentials.clearCache()`

## Production Deployment

For production, **always use environment variables**:

```bash
# Set in your deployment platform
export ZOHO_CLIENT_ID="your_production_client_id"
export ZOHO_CLIENT_SECRET="your_production_client_secret"
export ZOHO_REDIRECT_URI="https://yourdomain.com/api/zoho/callback"
export ZOHO_API_BASE_URL="https://invoice.zoho.com/api/v3"
```

Do NOT include `self_client.json` in production deployments.

## Support

For issues:
1. Check server logs for credential loading messages
2. Verify credentials in Zoho Developer Console
3. Ensure correct OAuth redirect URI is configured
4. Review Zoho API documentation: https://www.zoho.com/invoice/api/

