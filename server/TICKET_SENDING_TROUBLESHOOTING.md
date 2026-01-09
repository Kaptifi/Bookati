# Ticket Sending Troubleshooting Guide

## Issue: Tickets not received via Email or WhatsApp

### Quick Checks

1. **Check Server Logs**
   - Look for messages starting with `📧`, `📱`, `✅`, or `❌`
   - Check for error messages about SMTP or WhatsApp configuration

2. **Verify Environment Variables**

   For **Email** (SMTP):
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   SMTP_SECURE=false
   ```

   For **WhatsApp**:
   ```env
   WHATSAPP_PROVIDER=meta
   WHATSAPP_ACCESS_TOKEN=your-token
   WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
   ```

3. **Check Booking Data**
   - Ensure `customer_email` is provided for email sending
   - Ensure `customer_phone` is provided for WhatsApp sending
   - Verify phone number is in correct format (E.164: +201032560826)

### Common Issues

#### Email Not Sending

**Symptoms:**
- Log shows: `⚠️ Email configuration missing`
- Log shows: `❌ Failed to send PDF via Email`

**Solutions:**

1. **Missing SMTP Credentials**
   - Add `SMTP_USER` and `SMTP_PASS` to `.env` file
   - For Gmail, use App Password (not regular password)
   - Restart server after adding credentials

2. **Gmail App Password Setup**
   - Enable 2-Step Verification
   - Generate App Password: https://myaccount.google.com/apppasswords
   - Use the 16-character password in `SMTP_PASS`

3. **Check Email in Spam Folder**
   - Sometimes emails are filtered to spam
   - Check spam/junk folder

4. **SMTP Connection Issues**
   - Verify firewall allows SMTP connections
   - Check if port 587 is blocked
   - Try different SMTP provider (Outlook, SendGrid, etc.)

#### WhatsApp Not Sending

**Symptoms:**
- Log shows: `❌ Failed to send PDF via WhatsApp`
- Log shows: `WhatsApp not configured`

**Solutions:**

1. **Missing WhatsApp Configuration**
   - Add WhatsApp settings to tenant in database
   - Or set environment variables: `WHATSAPP_PROVIDER`, `WHATSAPP_ACCESS_TOKEN`, etc.

2. **Invalid Access Token**
   - Token may have expired
   - Generate new token from Facebook Developers
   - See `WHATSAPP_TOKEN_RENEWAL.md` for details

3. **Phone Number Format**
   - Must be in E.164 format: `+201032560826`
   - System automatically normalizes phone numbers
   - Check logs for normalized phone number

4. **WhatsApp Business Account**
   - Ensure phone number is registered in WhatsApp Business Account
   - Verify Phone Number ID is correct

### Testing

1. **Test Email Configuration**
   ```bash
   # In server directory
   node test_smtp.js
   ```

2. **Check Logs After Booking**
   - Look for these messages:
     - `✅ PDF generated successfully`
     - `✅ Ticket PDF sent via Email to ...`
     - `✅ Ticket PDF sent via WhatsApp to ...`

3. **Verify Booking Data**
   ```sql
   SELECT id, customer_name, customer_email, customer_phone, created_at
   FROM bookings
   ORDER BY created_at DESC
   LIMIT 5;
   ```

### Debug Mode

Enable detailed logging by checking server console output. The system logs:
- PDF generation status
- Email sending attempts and results
- WhatsApp sending attempts and results
- Configuration status
- Error details with stack traces

### Next Steps

If tickets still not received:
1. Check server logs for specific error messages
2. Verify environment variables are set correctly
3. Test SMTP/WhatsApp configuration separately
4. Check spam folder for emails
5. Verify phone number format for WhatsApp

