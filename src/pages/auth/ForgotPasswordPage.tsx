import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { Mail, ArrowLeft, CheckCircle, Lock, Eye, EyeOff, MessageCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

type Step = 'username' | 'confirm' | 'otp' | 'password' | 'success';

export function ForgotPasswordPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [step, setStep] = useState<Step>('username');
  const [identifier, setIdentifier] = useState(''); // Can be username, email, or phone
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [hasEmail, setHasEmail] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [displayOrder, setDisplayOrder] = useState<string[]>(['email', 'phone']); // Order to display options
  const [searchType, setSearchType] = useState<'email' | 'phone' | 'username'>('username');
  const [method, setMethod] = useState<'email' | 'whatsapp'>('email');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Internal state for actual email/phone (not masked)
  const [_Email, set_Email] = useState<string | null>(null);
  const [_Phone, set_Phone] = useState<string | null>(null);
  const [_UserId, set_UserId] = useState<string | null>(null);
  const [_TenantId, set_TenantId] = useState<string | null>(null);

  const handleLookupIdentifier = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setMaskedEmail(null);
    setMaskedPhone(null);
    setHasEmail(false);
    setHasPhone(false);
    setDisplayOrder([]);
    setSearchType(null);

    if (!identifier.trim()) {
      setError(i18n.language === 'ar' 
        ? 'اسم المستخدم أو البريد الإلكتروني أو رقم الهاتف مطلوب' 
        : 'Username, email, or phone number is required');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/forgot-password/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to find account.');
      }

      if (data.found) {
        setMaskedEmail(data.data.maskedEmail);
        setMaskedPhone(data.data.maskedPhone);
        setHasEmail(data.data.hasEmail);
        setHasPhone(data.data.hasPhone);
        setDisplayOrder(data.data.displayOrder);
        setSearchType(data.data.searchType);
        // Store actual email/phone for OTP sending
        set_Email(data.data._email);
        set_Phone(data.data._phone);
        set_UserId(data.data._userId);
        set_TenantId(data.data._tenantId);
        setStep('confirm');
      } else {
        setError(i18n.language === 'ar' 
          ? 'لم نتمكن من العثور على حساب يطابق المدخلات الخاصة بك. يرجى المحاولة مرة أخرى.' 
          : 'We could not find an account matching your input. Please try again.');
      }
    } catch (err: any) {
      console.error('Lookup error:', err);
      setError(err.message || (i18n.language === 'ar' 
        ? 'فشل في العثور على الحساب. يرجى المحاولة مرة أخرى.' 
        : 'Failed to find account. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (selectedMethod?: 'email' | 'whatsapp') => {
    setError('');
    setLoading(true);

    // Use the passed method or fallback to current state
    const methodToUse = selectedMethod || method;

    // Validate that selected method is available
    if (methodToUse === 'email' && !hasEmail) {
      setError(i18n.language === 'ar' ? 'البريد الإلكتروني غير متوفر' : 'Email is not available');
      setLoading(false);
      return;
    }
    if (methodToUse === 'whatsapp' && !hasPhone) {
      setError(i18n.language === 'ar' ? 'رقم الهاتف غير متوفر' : 'Phone number is not available');
      setLoading(false);
      return;
    }

    try {
      const requestBody: any = {
        identifier: identifier.trim(),
        method: methodToUse,
        tenant_id: _TenantId,
        language: i18n.language || 'en',
      };
      
      console.log('📤 Sending OTP request:', {
        method: methodToUse,
        identifier: identifier.trim(),
        hasEmail,
        hasPhone,
      });

      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      if (data.message) {
        console.log('Server response:', data.message);
      }

      setStep('otp');
      setResendCooldown(60); // Set cooldown to 60 seconds
    } catch (err: any) {
      setError(err.message || t('auth.otpSendError') || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Resend cooldown timer
  React.useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Use identifier for verification (backend will lookup the contact info)
      const response = await fetch(`${API_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          identifier: identifier.trim(),
          method,
          otp,
          tenant_id: _TenantId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid OTP');
      }

      // Store reset token and proceed to password reset step
      // User can choose to change password or continue without changing
      setResetToken(data.resetToken);
      setStep('password');
    } catch (err: any) {
      setError(err.message || t('auth.invalidOTP') || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // If password fields are filled, validate them
    if (newPassword || confirmPassword) {
      if (newPassword !== confirmPassword) {
        setError(t('auth.passwordsDoNotMatch') || 'Passwords do not match');
        return;
      }
      
      if (newPassword.length > 0 && newPassword.length < 6) {
        setError(t('auth.passwordTooShort') || 'Password must be at least 6 characters');
        return;
      }
    }
    
    // If no password provided, continue without changing password
    if (!newPassword && !confirmPassword) {
      await handleContinueWithoutChange();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setStep('success');
    } catch (err: any) {
      setError(err.message || t('auth.resetPasswordError') || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueWithoutChange = async () => {
    setLoading(true);
    setError('');
    
    if (!resetToken) {
      console.error('Reset token is missing');
      setError('Reset token is missing. Please verify OTP again.');
      setLoading(false);
      return;
    }
    
    console.log('Attempting login with OTP, resetToken present:', !!resetToken);
    
    try {
      const response = await fetch(`${API_URL}/auth/login-with-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken }),
      });

      const data = await response.json();

      console.log('Login with OTP response:', { 
        ok: response.ok, 
        status: response.status,
        hasUser: !!data.user, 
        hasTenant: !!data.tenant,
        hasSession: !!data.session,
        userRole: data.user?.role,
        tenantSlug: data.tenant?.slug,
        sessionToken: data.session?.access_token ? 'present' : 'missing'
      });

      if (!response.ok) {
        console.error('Login with OTP failed:', data);
        throw new Error(data.error || 'Failed to login');
      }

      if (!data.user) {
        console.error('No user data in response:', data);
        throw new Error('No user data received from server');
      }

      if (!data.session?.access_token) {
        console.error('No session token in response:', data);
        throw new Error('No session token received from server');
      }

      // Store session in localStorage (format expected by AuthContext)
      const sessionData = {
        access_token: data.session.access_token,
        user: data.session.user,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      };
      
      // Store in multiple formats for compatibility
      localStorage.setItem('auth_token', data.session.access_token);
      localStorage.setItem('auth_session', JSON.stringify(sessionData)); // Standard format
      localStorage.setItem('supabase.auth.token', JSON.stringify(sessionData)); // Supabase format
      localStorage.setItem('user', JSON.stringify(data.session.user));
      
      if (data.user) {
        localStorage.setItem('user_data', JSON.stringify(data.user));
      }
      if (data.tenant) {
        localStorage.setItem('tenant', JSON.stringify(data.tenant));
        localStorage.setItem('tenant_data', JSON.stringify(data.tenant));
      }
      
      console.log('Session stored in localStorage:', {
        hasToken: !!localStorage.getItem('auth_token'),
        hasSession: !!localStorage.getItem('auth_session'),
        userId: data.session.user?.id
      });
      
      // Trigger AuthContext to refresh by dispatching a custom event
      // AuthContext will pick up the session on next check
      window.dispatchEvent(new CustomEvent('auth-state-changed', { 
        detail: { session: sessionData, user: data.user } 
      }));
      
      // Also trigger a storage event to notify other tabs/windows
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'auth_session',
        newValue: JSON.stringify(sessionData),
        storageArea: localStorage
      }));

      const user = data.user;
      let tenant = data.tenant;

      console.log('Login with OTP successful:', { 
        userId: user.id,
        userRole: user.role,
        userEmail: user.email,
        tenantId: tenant?.id,
        tenantSlug: tenant?.slug
      });

      // Navigate based on user role using full page navigation
      // This ensures AuthContext re-initializes and picks up the session
      const navigateUser = async () => {
        if (user.role === 'solution_owner') {
          window.location.href = '/solution-admin';
        } else if (user.role === 'customer') {
          const tenantSlug = tenant?.slug || window.location.pathname.split('/')[1];
          if (tenantSlug) {
            window.location.href = `/${tenantSlug}/customer/dashboard`;
          } else {
            window.location.href = '/login';
          }
        } else if (tenant && tenant.slug) {
          if (user.role === 'tenant_admin') {
            window.location.href = `/${tenant.slug}/admin`;
          } else if (user.role === 'receptionist' || user.role === 'cashier') {
            window.location.href = `/${tenant.slug}/reception`;
          } else {
            window.location.href = `/${tenant.slug}/admin`;
          }
        } else if (user.tenant_id) {
          // Try to fetch tenant if not provided
          try {
            const { data: tenantData } = await db
              .from('tenants')
              .select('slug')
              .eq('id', user.tenant_id)
              .maybeSingle();
            
            if (tenantData?.slug) {
              if (user.role === 'tenant_admin') {
                window.location.href = `/${tenantData.slug}/admin`;
              } else if (user.role === 'receptionist' || user.role === 'cashier') {
                window.location.href = `/${tenantData.slug}/reception`;
              } else {
                window.location.href = `/${tenantData.slug}/admin`;
              }
            } else {
              window.location.href = '/dashboard';
            }
          } catch (err) {
            console.error('Error fetching tenant:', err);
            window.location.href = '/dashboard';
          }
        } else {
          window.location.href = '/dashboard';
        }
      };
      
      // Wait a moment to ensure localStorage is written, then navigate
      setTimeout(() => {
        navigateUser();
      }, 300); // Short delay to ensure localStorage is written
    } catch (err: any) {
      setError(err.message || t('auth.loginError') || 'Failed to login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Mail className="w-10 h-10 text-blue-600" />
            <span className="text-3xl font-bold text-gray-900">Bookati</span>
          </div>
          <div className="flex justify-center">
            <LanguageToggle />
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/login')}
                className="mr-auto"
                type="button"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <CardTitle className="flex-1 text-center">
                {step === 'username' && (t('auth.forgotPassword') || 'Forgot Password')}
                {step === 'confirm' && (i18n.language === 'ar' ? 'تأكيد معلومات الاتصال' : 'Confirm Contact Information')}
                {step === 'otp' && (t('auth.enterOTP') || 'Enter OTP Code')}
                {step === 'password' && (t('auth.resetPassword') || 'Reset Password')}
                {step === 'success' && (t('auth.passwordChanged') || 'Success')}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4 whitespace-pre-line">
                {error}
              </div>
            )}

            {step === 'username' && (
              <form onSubmit={handleLookupIdentifier} className="space-y-4">
                <p className="text-sm text-gray-600">
                  {i18n.language === 'ar' 
                    ? 'أدخل اسم المستخدم أو البريد الإلكتروني أو رقم الهاتف للعثور على حسابك'
                    : 'Enter your username, email, or phone number to find your account'}
                </p>
                <Input
                  type="text"
                  label={i18n.language === 'ar' ? 'اسم المستخدم أو البريد الإلكتروني أو رقم الهاتف' : 'Username, Email, or Phone'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  placeholder={i18n.language === 'ar' ? 'أدخل المعرف الخاص بك' : 'Enter your identifier'}
                  autoComplete="username"
                />
                <Button type="submit" fullWidth loading={loading}>
                  {i18n.language === 'ar' ? 'البحث' : 'Search'}
                </Button>
              </form>
            )}

            {step === 'confirm' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-800 font-medium text-center">
                    {i18n.language === 'ar' 
                      ? 'تم العثور على حسابك.'
                      : 'We found your account.'}
                  </p>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  {i18n.language === 'ar' 
                    ? 'اختر طريقة استلام رمز التحقق:'
                    : 'Choose how you want to receive your security code:'}
                </p>
                <div className="space-y-3">
                  {displayOrder.map((optionType) => {
                    if (optionType === 'email' && hasEmail) {
                      return (
                        <button
                          key="email"
                          type="button"
                          onClick={() => {
                            setMethod('email');
                            handleSendOTP('email');
                          }}
                          className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                            method === 'email'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Mail className={`w-5 h-5 ${method === 'email' ? 'text-blue-600' : 'text-gray-400'}`} />
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">
                                {i18n.language === 'ar' ? 'إرسال إلى البريد الإلكتروني' : 'Send code to your email'}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                {maskedEmail || 'N/A'}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    }
                    
                    if (optionType === 'phone' && hasPhone) {
                      return (
                        <button
                          key="phone"
                          type="button"
                          onClick={() => {
                            setMethod('whatsapp');
                            handleSendOTP('whatsapp');
                          }}
                          className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                            method === 'whatsapp'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <MessageCircle className={`w-5 h-5 ${method === 'whatsapp' ? 'text-blue-600' : 'text-gray-400'}`} />
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">
                                {i18n.language === 'ar' ? 'إرسال إلى رقم الهاتف عبر WhatsApp' : 'Send code to your phone via WhatsApp'}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                {maskedPhone || 'N/A'}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  fullWidth
                  onClick={() => {
                    setStep('username');
                    setError('');
                  }}
                >
                  {i18n.language === 'ar' ? 'العودة' : 'Back'}
                </Button>
              </div>
            )}

            {step === 'otp' && (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <p className="text-sm text-gray-600 mb-2">
                  {i18n.language === 'ar' 
                    ? `أدخل رمز التحقق الذي أرسلناه ${method === 'email' ? `إلى ${maskedEmail || 'البريد الإلكتروني'}` : `على ${maskedPhone || 'WhatsApp'}`}`
                    : `Enter the verification code sent ${method === 'email' ? `to ${maskedEmail || 'your email'}` : `to ${maskedPhone || 'your WhatsApp'}`}`}
                </p>
                {import.meta.env.DEV && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 mb-2">
                    <p className="font-medium">⚠️ Development Mode:</p>
                    <p className="text-xs mt-1">
                      {i18n.language === 'ar' 
                        ? 'إذا لم تستلم البريد، تحقق من console الخادم للحصول على رمز OTP.'
                        : 'If email wasn\'t received, check server console for OTP code.'}
                    </p>
                    <p className="text-xs mt-1 opacity-75">
                      {i18n.language === 'ar' 
                        ? 'SMTP قد لا يكون مُعداً.'
                        : 'SMTP may not be configured.'}
                    </p>
                  </div>
                )}
                <Input
                  type="text"
                  label={t('auth.otpCode') || 'OTP Code'}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  placeholder="000000"
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                />
                <Button 
                  type="submit" 
                  fullWidth 
                  loading={loading}
                >
                  {i18n.language === 'ar' ? 'تحقق' : t('auth.verify') || 'Verify'}
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    fullWidth
                    onClick={() => {
                      setStep('confirm');
                      setOtp('');
                      setError('');
                    }}
                  >
                    {i18n.language === 'ar' ? 'تغيير طريقة الإرسال' : t('auth.changeMethod') || 'Change Delivery Method'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    fullWidth
                    onClick={() => handleSendOTP()}
                    disabled={resendCooldown > 0 || loading}
                  >
                    {loading 
                      ? (i18n.language === 'ar' ? 'جارٍ الإرسال...' : 'Sending...')
                      : resendCooldown > 0
                      ? (i18n.language === 'ar' 
                          ? `إعادة الإرسال (${resendCooldown}ث)`
                          : `Resend (${resendCooldown}s)`)
                      : (i18n.language === 'ar' ? 'إعادة إرسال' : 'Resend Code')
                    }
                  </Button>
                </div>
              </form>
            )}

            {step === 'password' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  {i18n.language === 'ar' 
                    ? 'اختر كلمة مرور جديدة أو استمر بدون تغيير'
                    : t('auth.choosePasswordOrContinue') || 'Choose a new password or continue without changing'}
                </p>
                <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
                  <div className="relative">
                    <Lock className="absolute left-3 top-[38px] w-5 h-5 text-gray-400" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      label={i18n.language === 'ar' ? 'كلمة المرور الجديدة (اختياري)' : 'New Password (Optional)'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={6}
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-[38px] text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700 transition-colors z-10"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-[38px] w-5 h-5 text-gray-400" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      label={i18n.language === 'ar' ? 'تأكيد كلمة المرور (اختياري)' : 'Confirm Password (Optional)'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={6}
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-[38px] text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700 transition-colors z-10"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <Button 
                    type="submit" 
                    fullWidth 
                    loading={loading}
                  >
                    {i18n.language === 'ar' ? 'تغيير كلمة المرور' : t('auth.changePassword') || 'Change Password'}
                  </Button>
                </form>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">
                      {i18n.language === 'ar' ? 'أو' : 'OR'}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={handleContinueWithoutChange}
                  loading={loading}
                >
                  {i18n.language === 'ar' ? 'متابعة إلى لوحة التحكم' : t('auth.continueToDashboard') || 'Continue to Dashboard'}
                </Button>
              </div>
            )}

            {step === 'success' && (
              <div className="text-center space-y-4">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
                <h3 className="text-lg font-semibold">
                  {i18n.language === 'ar' ? 'تم تغيير كلمة المرور بنجاح!' : t('auth.passwordChangedSuccess') || 'Password Changed Successfully!'}
                </h3>
                <p className="text-sm text-gray-600">
                  {i18n.language === 'ar' 
                    ? 'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة'
                    : t('auth.canLoginWithNewPassword') || 'You can now login with your new password'}
                </p>
                <Button
                  fullWidth
                  onClick={() => navigate('/login')}
                >
                  {i18n.language === 'ar' ? 'تسجيل الدخول' : t('auth.goToLogin') || 'Go to Login'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
