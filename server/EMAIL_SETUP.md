# Email Service Setup Guide

## Environment Variables

Add the following environment variables to your `.env` file in the `project/server` directory:

```env
# Email Service Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

## Gmail Setup (Recommended for Development)

1. **Enable 2-Step Verification** on your Google account
2. **Generate App Password**:
   - Go to [Google Account Settings](https://myaccount.google.com/)
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Use this password in `SMTP_PASSWORD`

## Other Email Providers

### Outlook/Hotmail
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASSWORD=your-password
```

### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
```

### AWS SES
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-aws-access-key
SMTP_PASSWORD=your-aws-secret-key
```

## Testing

After setting up the environment variables, restart your server and test the forgot password flow:

1. Go to `/login`
2. Click "Forgot Password?"
3. Enter your email
4. Check your email for the OTP code
5. Enter the OTP and proceed

## Troubleshooting

### Email not sending
- Check that SMTP credentials are correct
- Verify firewall/network allows SMTP connections
- Check server logs for error messages
- For Gmail: Ensure "Less secure app access" is enabled OR use App Password

### OTP not received
- Check spam folder
- Verify email address is correct
- Check server logs for email sending errors
- Ensure email service is properly configured

