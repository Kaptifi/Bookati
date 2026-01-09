import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { Input } from '../../components/ui/Input';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { validatePhoneNumberByCountry } from '../../lib/countryCodes';
import { ArrowLeft, Phone, User, Shield } from 'lucide-react';

interface BookingData {
  serviceId: string;
  packageId?: string | null;
  offerId?: string | null;
  slotId: string;
  date: string;
  time: string;
}

export function PhoneEntryPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [step, setStep] = useState<'phone' | 'otp' | 'name'>('phone'); // 'phone' | 'otp' | 'name'
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Get booking data from navigation state
  const bookingData: BookingData | null = location.state as BookingData | null;

  useEffect(() => {
    if (!bookingData) {
      // If no booking data, redirect back to booking page
      navigate(`/${tenantSlug}/book`);
    }
  }, [bookingData, tenantSlug, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Handle phone number change
  const handlePhoneChange = (value: string) => {
    setPhone(value);
    setPhoneError(null);
  };

  // Check if phone number exists
  const checkPhoneExists = async (phoneNumber: string): Promise<{ exists: boolean; email?: string; name?: string }> => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      
      const response = await fetch(`${API_URL}/auth/check-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: phoneNumber }),
      });

      if (!response.ok) {
        return { exists: false };
      }

      const data = await response.json();
      return {
        exists: data.exists || false,
        email: data.email || undefined,
        name: data.name || undefined,
      };
    } catch (error) {
      console.error('Error checking phone:', error);
      return { exists: false };
    }
  };

  // Send OTP to phone number
  const sendOTP = async (phoneNumber: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      
      const response = await fetch(`${API_URL}/auth/guest/verify-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: phoneNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send OTP');
      }

      const data = await response.json();
      return { success: true, phoneExists: data.phoneExists || false };
    } catch (error: any) {
      console.error('Error sending OTP:', error);
      throw error;
    }
  };

  // Verify OTP
  const verifyOTP = async (phoneNumber: string, otp: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      
      const response = await fetch(`${API_URL}/auth/guest/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: phoneNumber, otp }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid OTP');
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error verifying OTP:', error);
      throw error;
    }
  };

  // Handle phone submission - send OTP
  const handlePhoneSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!phone || phone.trim() === '') {
      setPhoneError(i18n.language === 'ar' ? 'يرجى إدخال رقم الهاتف' : 'Please enter your phone number');
      return;
    }

    // Validate phone format using the same validation as other pages
    const cleanPhone = phone.replace(/\s/g, '');
    // Extract country code (first 1-4 digits after +)
    const countryCodeMatch = cleanPhone.match(/^\+(\d{1,4})/);
    if (!countryCodeMatch) {
      setPhoneError(i18n.language === 'ar' ? 'رقم الهاتف غير صحيح' : 'Invalid phone number format');
      return;
    }
    const countryCode = `+${countryCodeMatch[1]}`;
    const validation = validatePhoneNumberByCountry(cleanPhone, countryCode, i18n.language as 'en' | 'ar');
    if (!validation.valid) {
      setPhoneError(validation.error || (i18n.language === 'ar' ? 'رقم الهاتف غير صحيح' : 'Invalid phone number format'));
      return;
    }

    setSendingOtp(true);
    setPhoneError(null);

    try {
      // Send OTP regardless of whether phone exists or not
      await sendOTP(phone);
      // Move to OTP verification step
      setStep('otp');
      setOtpCode('');
      setOtpError(null);
      // Set resend cooldown (60 seconds)
      setResendCooldown(60);
    } catch (error: any) {
      console.error('Error sending OTP:', error);
      setPhoneError(error.message || (i18n.language === 'ar' ? 'فشل إرسال رمز التحقق' : 'Failed to send verification code'));
    } finally {
      setSendingOtp(false);
    }
  };

  // Handle resend OTP
  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;
    
    setOtpError(null);
    setSendingOtp(true);

    try {
      await sendOTP(phone);
      setResendCooldown(60); // Reset cooldown to 60 seconds
    } catch (error: any) {
      console.error('Error resending OTP:', error);
      setOtpError(error.message || (i18n.language === 'ar' ? 'فشل إعادة إرسال رمز التحقق' : 'Failed to resend verification code'));
    } finally {
      setSendingOtp(false);
    }
  };

  // Handle OTP verification
  const handleOTPSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!otpCode || otpCode.trim() === '' || otpCode.length !== 6) {
      setOtpError(i18n.language === 'ar' ? 'يرجى إدخال رمز التحقق المكون من 6 أرقام' : 'Please enter the 6-digit verification code');
      return;
    }

    setVerifyingOtp(true);
    setOtpError(null);

    try {
      // Verify OTP
      await verifyOTP(phone, otpCode);
      
      // After OTP verification, check if phone exists
      const phoneCheck = await checkPhoneExists(phone);

      if (phoneCheck.exists) {
        // Phone exists - auto-fill and proceed to checkout
        if (phoneCheck.name) {
          setName(phoneCheck.name);
        }
        if (phoneCheck.email) {
          setCustomerEmail(phoneCheck.email);
        }
        
        // Proceed directly to checkout with customer info
        proceedToCheckout(phoneCheck.name || '', phoneCheck.email || '');
      } else {
        // Phone doesn't exist - ask for name
        setStep('name');
      }
    } catch (error: any) {
      console.error('Error verifying OTP:', error);
      setOtpError(error.message || (i18n.language === 'ar' ? 'رمز التحقق غير صحيح' : 'Invalid verification code'));
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Handle name submission
  const handleNameSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!name || name.trim() === '') {
      setNameError(i18n.language === 'ar' ? 'يرجى إدخال الاسم' : 'Please enter your name');
      return;
    }

    if (name.trim().length < 2) {
      setNameError(i18n.language === 'ar' ? 'الاسم يجب أن يكون على الأقل حرفين' : 'Name must be at least 2 characters');
      return;
    }

    setNameError(null);
    proceedToCheckout(name.trim(), customerEmail || '');
  };

  // Proceed to checkout with customer info
  const proceedToCheckout = (customerName: string, email: string) => {
    if (!bookingData) {
      navigate(`/${tenantSlug}/book`);
      return;
    }

    // Navigate to checkout with booking data and customer info
    navigate(`/${tenantSlug}/book/checkout`, {
      state: {
        ...bookingData,
        customerInfo: {
          name: customerName,
          phone: phone,
          email: email,
        },
      },
    });
  };

  if (!bookingData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <button
              onClick={() => navigate(`/${tenantSlug}/book`)}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              {i18n.language === 'ar' ? 'رجوع' : 'Back'}
            </button>
            <LanguageToggle />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-md mx-auto px-4 py-12">
        <Card>
          <CardContent className="p-6">
            {step === 'phone' && (
              <>
                <div className="text-center mb-6">
                  <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <Phone className="w-8 h-8 text-blue-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {i18n.language === 'ar' ? 'أدخل رقم الهاتف' : 'Enter Your Phone Number'}
                  </h2>
                  <p className="text-gray-600">
                    {i18n.language === 'ar' 
                      ? 'يرجى إدخال رقم هاتفك للمتابعة إلى صفحة الدفع'
                      : 'Please enter your phone number to proceed to checkout'}
                  </p>
                </div>

                <form onSubmit={handlePhoneSubmit} className="space-y-4">
                  <div>
                    <PhoneInput
                      value={phone}
                      onChange={handlePhoneChange}
                      label={i18n.language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                      placeholder={i18n.language === 'ar' ? 'أدخل رقم الهاتف' : 'Enter phone number'}
                      required
                      error={phoneError || undefined}
                      defaultCountry="+966"
                    />
                  </div>

                  {phoneError && (
                    <div className="text-sm text-red-600 mt-1">
                      {phoneError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    fullWidth
                    size="lg"
                    disabled={!phone || sendingOtp}
                    className="mt-6"
                  >
                    {sendingOtp 
                      ? (i18n.language === 'ar' ? 'جارٍ الإرسال...' : 'Sending...')
                      : (i18n.language === 'ar' ? 'إرسال رمز التحقق' : 'Send Verification Code')
                    }
                  </Button>
                </form>
              </>
            )}

            {step === 'otp' && (
              <>
                <div className="text-center mb-6">
                  <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                    <Shield className="w-8 h-8 text-purple-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {i18n.language === 'ar' ? 'أدخل رمز التحقق' : 'Enter Verification Code'}
                  </h2>
                  <p className="text-gray-600">
                    {i18n.language === 'ar' 
                      ? `تم إرسال رمز التحقق إلى ${phone}. يرجى إدخال الرمز أدناه.`
                      : `Verification code sent to ${phone}. Please enter the code below.`
                    }
                  </p>
                </div>

                {import.meta.env.DEV && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 mb-4">
                    <p className="font-medium">⚠️ Development Mode:</p>
                    <p className="text-xs mt-1">
                      {i18n.language === 'ar' 
                        ? 'إذا لم تستلم الرمز، تحقق من console الخادم للحصول على رمز OTP.'
                        : 'If code wasn\'t received, check server console for OTP code.'}
                    </p>
                  </div>
                )}

                <form onSubmit={handleOTPSubmit} className="space-y-4">
                  <div>
                    <Input
                      type="text"
                      label={i18n.language === 'ar' ? 'رمز التحقق' : 'Verification Code'}
                      value={otpCode}
                      onChange={(e) => {
                        const code = e.target.value.replace(/[^\d]/g, '').slice(0, 6);
                        setOtpCode(code);
                        setOtpError(null);
                      }}
                      placeholder={i18n.language === 'ar' ? 'أدخل الرمز المكون من 6 أرقام' : 'Enter 6-digit code'}
                      required
                      maxLength={6}
                      className={`text-center text-2xl tracking-widest ${otpError ? 'border-red-500' : ''}`}
                    />
                    {otpError && (
                      <div className="text-sm text-red-600 mt-1">
                        {otpError}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      fullWidth
                      onClick={() => {
                        setStep('phone');
                        setOtpCode('');
                        setOtpError(null);
                      }}
                    >
                      {i18n.language === 'ar' ? 'رجوع' : 'Back'}
                    </Button>
                    <Button
                      type="submit"
                      fullWidth
                      size="lg"
                      disabled={!otpCode || otpCode.length !== 6 || verifyingOtp}
                    >
                      {verifyingOtp 
                        ? (i18n.language === 'ar' ? 'جارٍ التحقق...' : 'Verifying...')
                        : (i18n.language === 'ar' ? 'التحقق' : 'Verify')
                      }
                    </Button>
                  </div>

                  <div className="text-center mt-4">
                    <button
                      type="button"
                      onClick={handleResendOTP}
                      disabled={resendCooldown > 0 || sendingOtp}
                      className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed underline"
                    >
                      {sendingOtp 
                        ? (i18n.language === 'ar' ? 'جارٍ الإرسال...' : 'Sending...')
                        : resendCooldown > 0
                        ? (i18n.language === 'ar' 
                            ? `إعادة الإرسال (${resendCooldown}ث)`
                            : `Resend code (${resendCooldown}s)`)
                        : (i18n.language === 'ar' ? 'إعادة إرسال رمز التحقق' : 'Resend verification code')
                      }
                    </button>
                  </div>
                </form>
              </>
            )}

            {step === 'name' && (
              <>
                <div className="text-center mb-6">
                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <User className="w-8 h-8 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {i18n.language === 'ar' ? 'أدخل اسمك' : 'Enter Your Name'}
                  </h2>
                  <p className="text-gray-600">
                    {i18n.language === 'ar' 
                      ? 'رقم الهاتف غير مسجل. يرجى إدخال اسمك للمتابعة'
                      : 'Phone number not found. Please enter your name to continue'}
                  </p>
                </div>

                <form onSubmit={handleNameSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {i18n.language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                    </label>
                    <Input
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setNameError(null);
                      }}
                      placeholder={i18n.language === 'ar' ? 'أدخل اسمك الكامل' : 'Enter your full name'}
                      required
                      className={nameError ? 'border-red-500' : ''}
                    />
                    {nameError && (
                      <div className="text-sm text-red-600 mt-1">
                        {nameError}
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    <p className="font-medium mb-1">
                      {i18n.language === 'ar' ? 'رقم الهاتف:' : 'Phone Number:'}
                    </p>
                    <p>{phone}</p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      fullWidth
                      onClick={() => {
                        setStep('otp');
                        setName('');
                        setNameError(null);
                      }}
                    >
                      {i18n.language === 'ar' ? 'رجوع' : 'Back'}
                    </Button>
                    <Button
                      type="submit"
                      fullWidth
                      size="lg"
                      disabled={!name || name.trim().length < 2}
                    >
                      {i18n.language === 'ar' ? 'المتابعة إلى الدفع' : 'Proceed to Checkout'}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

