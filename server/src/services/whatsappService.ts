import axios from 'axios';
import dotenv from 'dotenv';
import FormData from 'form-data';

dotenv.config();

// WhatsApp Business API Configuration
// Supports multiple providers: Meta Cloud API, Twilio, WATI, etc.

interface WhatsAppConfig {
  provider: 'meta' | 'twilio' | 'wati' | 'custom';
  apiUrl?: string;
  apiKey?: string;
  phoneNumberId?: string;
  accessToken?: string;
  accountSid?: string; // For Twilio
  authToken?: string; // For Twilio
  from?: string; // Phone number or WhatsApp Business number
}

// WhatsApp configuration is now ONLY read from database (tenants.whatsapp_settings)
// No environment variable fallback - all settings must be configured per tenant
console.log('\n📱 WhatsApp Configuration:');
console.log('   ✅ WhatsApp settings are read from database (tenants.whatsapp_settings)');
console.log('   ⚠️  No environment variable fallback - configure settings per tenant');
console.log('');

/**
 * Send OTP via WhatsApp using Meta Cloud API
 */
async function sendOTPViaMeta(
  phoneNumber: string,
  otp: string,
  language: 'en' | 'ar',
  config: WhatsAppConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const phoneNumberId = config.phoneNumberId;
    const accessToken = config.accessToken;

    if (!phoneNumberId || !accessToken) {
      return { success: false, error: 'WhatsApp Meta API not configured' };
    }

    // Validate Phone Number ID format (should be numeric, typically 15 digits)
    // Phone Number ID should NOT be a phone number (which starts with country code)
    if (phoneNumberId.startsWith('+') || phoneNumberId.startsWith('0') || phoneNumberId.length < 10) {
      console.error(`❌ Invalid Phone Number ID format: ${phoneNumberId}`);
      console.error(`   Phone Number ID should be a Facebook Graph API ID (e.g., 939237089264920), not a phone number`);
      return { 
        success: false, 
        error: `Invalid Phone Number ID format. Expected Facebook Graph API ID, got: ${phoneNumberId}` 
      };
    }

    // Format phone number (remove + and ensure country code, remove spaces)
    let formattedPhone = phoneNumber.replace(/^\+/, '').replace(/\s/g, '');
    
    // If phone number starts with 0 (local format), try to detect and add country code
    // Common patterns: Egyptian numbers start with 0, then country code is 20
    if (formattedPhone.startsWith('0')) {
      // Remove leading 0
      const withoutZero = formattedPhone.substring(1);
      
      // Check if it's an Egyptian number (starts with 1 after removing 0)
      // Egyptian mobile numbers: 01XXXXXXXX (10 digits after 0)
      if (withoutZero.length === 10 && withoutZero.startsWith('1')) {
        formattedPhone = `20${withoutZero}`; // Add Egypt country code
        console.log(`   Detected Egyptian number format, converted to: ${formattedPhone}`);
      }
      // Add other country code detection here if needed
    }
    
    // Ensure phone number has country code (if it doesn't start with country code, it might be invalid)
    if (formattedPhone.length < 10) {
      console.warn(`⚠️  Phone number seems too short: ${formattedPhone}`);
    }

    // Use v22.0 API version (as shown in the curl example)
    const apiVersion = 'v22.0';
    const apiUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    // Try using template first (if available), otherwise use text message
    // For OTP, we'll use text message as it's more flexible
    const messageText = language === 'ar'
      ? `رمز التحقق الخاص بك هو: *${otp}*\n\nهذا الرمز صالح لمدة 10 دقائق فقط.\n\nإذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذه الرسالة.\n\nشكراً لك،\nفريق Bookati`
      : `Your verification code is: *${otp}*\n\nThis code is valid for 10 minutes only.\n\nIf you did not request a password reset, please ignore this message.\n\nThank you,\nThe Bookati Team`;

    console.log(`📱 Sending WhatsApp message via Meta API:`);
    console.log(`   URL: ${apiUrl}`);
    console.log(`   To: ${formattedPhone}`);
    console.log(`   Phone Number ID: ${phoneNumberId} (from tenant database settings)`);
    console.log(`   Access Token: ${accessToken ? `${accessToken.substring(0, 20)}...` : 'NOT SET ❌'}`);
    console.log(`   Message Preview: ${messageText.substring(0, 50)}...`);

    const requestBody = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'text',
      text: {
        body: messageText,
      },
    };

    const requestHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    console.log(`   Request Body:`, JSON.stringify(requestBody, null, 2));
    console.log(`   Request Headers:`, { 
      'Authorization': `Bearer ${accessToken ? `${accessToken.substring(0, 20)}...` : 'NOT SET'}`,
      'Content-Type': 'application/json'
    });

    let response;
    try {
      response = await axios.post(
        apiUrl,
        requestBody,
        {
          headers: requestHeaders,
          timeout: 30000, // 30 seconds timeout
        }
      );
      console.log(`   ✅ API Response Status: ${response.status}`);
      console.log(`   ✅ API Response Data:`, JSON.stringify(response.data, null, 2));
    } catch (axiosError: any) {
      console.error(`   ❌ Axios Error Details:`);
      console.error(`      Message: ${axiosError.message}`);
      console.error(`      Code: ${axiosError.code || 'N/A'}`);
      console.error(`      Response Status: ${axiosError.response?.status || 'N/A'}`);
      console.error(`      Response Data:`, axiosError.response?.data ? JSON.stringify(axiosError.response.data, null, 2) : 'N/A');
      throw axiosError; // Re-throw to be caught by outer catch block
    }

    if (response.data.messages && response.data.messages[0]?.id) {
      console.log(`✅ WhatsApp OTP sent successfully to ${phoneNumber}`);
      console.log(`   Message ID: ${response.data.messages[0].id}`);
      return { success: true };
    }

    return { success: false, error: 'Unexpected response from WhatsApp API' };
  } catch (error: any) {
    console.error('\n❌ ============================================');
    console.error('❌ WhatsApp Sending Error');
    console.error('❌ ============================================');
    console.error('   Error Type:', error.name || 'Unknown');
    console.error('   Error Message:', error.message || 'No message');
    console.error('   Error Stack:', error.stack || 'No stack');
    
    if (error.response) {
      console.error('   Response Status:', error.response.status);
      console.error('   Response Status Text:', error.response.statusText);
      console.error('   Response Data:', JSON.stringify(error.response.data, null, 2));
      
      const errorData = error.response.data;
      const errorMessage = errorData?.error?.message || '';
      const errorCode = errorData?.error?.code;
      const errorType = errorData?.error?.type || '';
      const errorSubcode = errorData?.error?.error_subcode;
      
      console.error('   Error Code:', errorCode || 'N/A');
      console.error('   Error Type:', errorType || 'N/A');
      console.error('   Error Subcode:', errorSubcode || 'N/A');
      console.error('   Full Error Message:', errorMessage || 'N/A');
      
      // Handle specific access token errors
      if (errorMessage.includes('access token') || 
          errorMessage.includes('session is invalid') ||
          errorMessage.includes('user logged out') ||
          errorCode === 190) {
        console.error('\n⚠️  ============================================');
        console.error('⚠️  ACCESS TOKEN ERROR DETECTED');
        console.error('⚠️  ============================================');
        console.error('   The WhatsApp access token is invalid or expired.');
        console.error('   Possible reasons:');
        console.error('   1. Token has expired (tokens expire after 60 days)');
        console.error('   2. User logged out from Facebook/Meta');
        console.error('   3. Token was revoked or invalidated');
        console.error('');
        console.error('   SOLUTION:');
        console.error('   1. Go to Facebook Developers: https://developers.facebook.com/');
        console.error('   2. Navigate to your App > WhatsApp > API Setup');
        console.error('   3. Generate a new access token');
        console.error('   4. Update WHATSAPP_ACCESS_TOKEN in .env file');
        console.error('   5. Or update tenant WhatsApp settings in the dashboard');
        console.error('⚠️  ============================================\n');
        
        return {
          success: false,
          error: 'WhatsApp access token is invalid or expired. Please generate a new token from Facebook Developers and update the configuration.',
        };
      }
      
      // Handle other common errors
      if (errorCode === 100) {
        console.error('\n⚠️  ============================================');
        console.error('⚠️  INVALID REQUEST ERROR');
        console.error('⚠️  ============================================');
        console.error('   Error:', errorMessage);
        console.error('   This usually means:');
        console.error('   - Phone number format is incorrect');
        console.error('   - Phone Number ID is incorrect');
        console.error('   - Recipient is not opted in to receive messages');
        console.error('⚠️  ============================================\n');
      }
      
      if (errorCode === 131047) {
        console.error('\n⚠️  ============================================');
        console.error('⚠️  MESSAGE TEMPLATE ERROR');
        console.error('⚠️  ============================================');
        console.error('   Error:', errorMessage);
        console.error('   This means the message template is not approved or does not exist.');
        console.error('   For OTP messages, you may need to use a pre-approved template.');
        console.error('⚠️  ============================================\n');
      }
    } else if (error.request) {
      console.error('   Request was made but no response received');
      console.error('   Request:', error.request);
    } else {
      console.error('   Error setting up request:', error.message);
    }
    console.error('============================================\n');
    
    // Return detailed error message
    let errorMsg = 'Failed to send WhatsApp message';
    if (error.response?.data?.error?.message) {
      errorMsg = error.response.data.error.message;
    } else if (error.message) {
      errorMsg = error.message;
    }
    
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Send OTP via WhatsApp using Twilio
 */
async function sendOTPViaTwilio(
  phoneNumber: string,
  otp: string,
  language: 'en' | 'ar',
  config: WhatsAppConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const accountSid = config.accountSid;
    const authToken = config.authToken;
    const from = config.from || 'whatsapp:+14155238886';

    if (!accountSid || !authToken) {
      return { success: false, error: 'Twilio not configured' };
    }

    // Format phone number for Twilio (must include country code with +)
    const formattedPhone = phoneNumber.startsWith('+')
      ? `whatsapp:${phoneNumber}`
      : `whatsapp:+${phoneNumber}`;

    const messageText = language === 'ar'
      ? `رمز التحقق الخاص بك هو: *${otp}*\n\nهذا الرمز صالح لمدة 10 دقائق فقط.\n\nإذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذه الرسالة.\n\nشكراً لك،\nفريق Bookati`
      : `Your verification code is: *${otp}*\n\nThis code is valid for 10 minutes only.\n\nIf you did not request a password reset, please ignore this message.\n\nThank you,\nThe Bookati Team`;

    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      new URLSearchParams({
        From: from,
        To: formattedPhone,
        Body: messageText,
      }),
      {
        auth: {
          username: accountSid,
          password: authToken,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (response.data.sid) {
      console.log(`✅ WhatsApp OTP sent via Twilio to ${phoneNumber}`);
      console.log(`   Message SID: ${response.data.sid}`);
      return { success: true };
    }

    return { success: false, error: 'Unexpected response from Twilio' };
  } catch (error: any) {
    console.error('❌ Twilio WhatsApp sending error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to send WhatsApp message',
    };
  }
}

/**
 * Send OTP via WhatsApp using WATI
 */
async function sendOTPViaWATI(
  phoneNumber: string,
  otp: string,
  language: 'en' | 'ar',
  config: WhatsAppConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const apiUrl = config.apiUrl || 'https://api.wati.io';
    const apiKey = config.apiKey;

    if (!apiKey) {
      return { success: false, error: 'WATI API key not configured' };
    }

    // Format phone number (WATI expects number without +)
    const formattedPhone = phoneNumber.replace(/^\+/, '').replace(/\s/g, '');

    const messageText = language === 'ar'
      ? `رمز التحقق الخاص بك هو: *${otp}*\n\nهذا الرمز صالح لمدة 10 دقائق فقط.\n\nإذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذه الرسالة.\n\nشكراً لك،\nفريق Bookati`
      : `Your verification code is: *${otp}*\n\nThis code is valid for 10 minutes only.\n\nIf you did not request a password reset, please ignore this message.\n\nThank you,\nThe Bookati Team`;

    const response = await axios.post(
      `${apiUrl}/v1/sendSessionMessage/${formattedPhone}`,
      {
        messageText: messageText,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.result === 'success' || response.status === 200) {
      console.log(`✅ WhatsApp OTP sent via WATI to ${phoneNumber}`);
      return { success: true };
    }

    return { success: false, error: 'Unexpected response from WATI' };
  } catch (error: any) {
    console.error('❌ WATI WhatsApp sending error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to send WhatsApp message',
    };
  }
}

/**
 * Main function to send OTP via WhatsApp
 * Supports multiple providers: Meta, Twilio, WATI
 */
export async function sendOTPWhatsApp(
  phoneNumber: string,
  otp: string,
  language: 'en' | 'ar' = 'en',
  tenantConfig: WhatsAppConfig
): Promise<{ success: boolean; error?: string }> {
  // Require tenant config from database - no environment variable fallback
  if (!tenantConfig) {
    console.error('❌ WhatsApp tenant config is required. Settings must be configured in database.');
    return { success: false, error: 'WhatsApp not configured. Please configure WhatsApp settings in tenant settings.' };
  }

  const config = tenantConfig;

  console.log(`\n📱 ============================================`);
  console.log(`📱 sendOTPWhatsApp Called`);
  console.log(`📱 ============================================`);
  console.log(`   Tenant Config:`, {
    provider: config.provider || 'NOT SET ❌',
    phoneNumberId: config.phoneNumberId ? 'SET ✅' : 'NOT SET ❌',
    accessToken: config.accessToken ? 'SET ✅' : 'NOT SET ❌',
  });
  console.log(`============================================\n`);

  if (!config.provider) {
    console.error('❌ WhatsApp provider not configured in database settings.');
    return { success: false, error: 'WhatsApp provider not configured. Please configure WhatsApp settings in tenant settings.' };
  }

  // Validate phone number
  if (!phoneNumber || phoneNumber.trim() === '') {
    return { success: false, error: 'Phone number is required' };
  }

  console.log(`📱 Attempting to send WhatsApp OTP:`);
  console.log(`   Provider: ${config.provider}`);
  console.log(`   To: ${phoneNumber}`);
  console.log(`   Language: ${language}`);

  try {
    switch (config.provider) {
      case 'meta':
        return await sendOTPViaMeta(phoneNumber, otp, language, config);
      case 'twilio':
        return await sendOTPViaTwilio(phoneNumber, otp, language, config);
      case 'wati':
        return await sendOTPViaWATI(phoneNumber, otp, language, config);
      default:
        return { success: false, error: `Unsupported WhatsApp provider: ${config.provider}` };
    }
  } catch (error: any) {
    console.error('❌ WhatsApp sending exception:', error);
    return { success: false, error: error.message || 'Failed to send WhatsApp message' };
  }
}

/**
 * Send document (PDF) via WhatsApp
 */
export async function sendWhatsAppDocument(
  phoneNumber: string,
  documentBuffer: Buffer,
  filename: string,
  caption?: string,
  config: WhatsAppConfig
): Promise<{ success: boolean; error?: string }> {
  // Require config from database - no environment variable fallback
  if (!config || !config.provider) {
    console.error('❌ WhatsApp config is required. Settings must be configured in database.');
    return { success: false, error: 'WhatsApp not configured. Please configure WhatsApp settings in tenant settings.' };
  }
  
  const finalConfig = config;

  try {
    switch (finalConfig.provider) {
      case 'meta':
        return await sendDocumentViaMeta(phoneNumber, documentBuffer, filename, caption, finalConfig);
      case 'twilio':
        return await sendDocumentViaTwilio(phoneNumber, documentBuffer, filename, caption, finalConfig);
      case 'wati':
        return await sendDocumentViaWATI(phoneNumber, documentBuffer, filename, caption, finalConfig);
      default:
        return { success: false, error: `Unsupported WhatsApp provider: ${finalConfig.provider}` };
    }
  } catch (error: any) {
    console.error('❌ WhatsApp document sending exception:', error);
    return { success: false, error: error.message || 'Failed to send WhatsApp document' };
  }
}

/**
 * Send document via Meta Cloud API
 */
async function sendDocumentViaMeta(
  phoneNumber: string,
  documentBuffer: Buffer,
  filename: string,
  caption: string | undefined,
  config: WhatsAppConfig
): Promise<{ success: boolean; error?: string }> {
  if (!config.phoneNumberId || !config.accessToken) {
    return { success: false, error: 'Phone Number ID and Access Token are required' };
  }

  const phoneNumberId = config.phoneNumberId;
  const accessToken = config.accessToken;
  const apiUrl = config.apiUrl || `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  try {
    // First, upload media to Meta
    const mediaUploadUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}/media`;
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', 'document');
    formData.append('file', documentBuffer, {
      filename: filename,
      contentType: 'application/pdf',
    });
    if (caption) {
      formData.append('caption', caption);
    }

    const uploadResponse = await axios.post(mediaUploadUrl, formData, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...formData.getHeaders(),
      },
    });

    const mediaId = uploadResponse.data.id;

    // Then send message with media
    const messageResponse = await axios.post(
      apiUrl,
      {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'document',
        document: {
          id: mediaId,
          caption: caption,
          filename: filename,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (messageResponse.data.error) {
      return { success: false, error: messageResponse.data.error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Meta document send error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.error?.message || error.message };
  }
}

/**
 * Send document via Twilio
 */
async function sendDocumentViaTwilio(
  phoneNumber: string,
  documentBuffer: Buffer,
  filename: string,
  caption: string | undefined,
  config: WhatsAppConfig
): Promise<{ success: boolean; error?: string }> {
  // Twilio requires document to be hosted on a public URL
  // For now, return error suggesting to use Meta or WATI
  return { success: false, error: 'Twilio document sending requires document to be hosted on public URL. Please use Meta or WATI provider.' };
}

/**
 * Send document via WATI
 */
async function sendDocumentViaWATI(
  phoneNumber: string,
  documentBuffer: Buffer,
  filename: string,
  caption: string | undefined,
  config: WhatsAppConfig
): Promise<{ success: boolean; error?: string }> {
  if (!config.apiKey || !config.apiUrl) {
    return { success: false, error: 'API Key and API URL are required for WATI' };
  }

  try {
    const formData = new FormData();
    formData.append('file', documentBuffer, {
      filename: filename,
      contentType: 'application/pdf',
    });
    if (caption) {
      formData.append('caption', caption);
    }

    const response = await axios.post(
      `${config.apiUrl}/api/v1/sendSessionFile/${phoneNumber}`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          ...formData.getHeaders(),
        },
      }
    );

    return { success: true };
  } catch (error: any) {
    console.error('WATI document send error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

/**
 * Test WhatsApp connection
 */
export async function testWhatsAppConnection(config: WhatsAppConfig): Promise<{ success: boolean; error?: string }> {
  // Test with a dummy phone number (won't actually send)
  const testPhone = '1234567890';
  const testOTP = '123456';

  try {
    switch (config.provider) {
      case 'meta':
        // Just verify credentials are set
        if (!config.phoneNumberId || !config.accessToken) {
          return { success: false, error: 'Phone Number ID and Access Token are required' };
        }
        return { success: true };
      case 'twilio':
        if (!config.accountSid || !config.authToken) {
          return { success: false, error: 'Account SID and Auth Token are required' };
        }
        return { success: true };
      case 'wati':
        if (!config.apiKey) {
          return { success: false, error: 'API Key is required' };
        }
        return { success: true };
      default:
        return { success: false, error: `Unsupported provider: ${config.provider}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Connection test failed' };
  }
}

