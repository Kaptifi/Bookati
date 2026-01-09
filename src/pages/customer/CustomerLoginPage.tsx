import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { Package, ArrowLeft, LogIn, Mail, Lock, UserPlus, User, Eye, EyeOff } from 'lucide-react';

export function CustomerLoginPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tenant, setTenant] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    if (tenantSlug) {
      fetchTenant();
    }
  }, [tenantSlug]);

  async function fetchTenant() {
    try {
      const { data } = await db
        .from('tenants')
        .select('id, name, name_ar, slug, landing_page_settings')
        .eq('slug', tenantSlug)
        .maybeSingle();
      
      if (data) {
        setTenant(data);
        
        // Parse landing_page_settings
        const getSettings = () => {
          if (!data?.landing_page_settings) return {};
          const rawSettings = data.landing_page_settings;
          if (typeof rawSettings === 'string') {
            try {
              return JSON.parse(rawSettings);
            } catch {
              return {};
            }
          }
          return rawSettings || {};
        };
        
        setSettings(getSettings());
      }
    } catch (err) {
      console.error('Error fetching tenant:', err);
    }
  }
  
  const primaryColor = settings.primary_color || '#2563eb';
  const secondaryColor = settings.secondary_color || '#3b82f6';

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tenant not found</h1>
          <p className="text-gray-600 mb-4">The tenant you're looking for doesn't exist.</p>
          <Button onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    let loginEmail = email;
    if (!email.includes('@')) {
      loginEmail = `${email}@bookati.local`;
    }

    // Pass forCustomer: true to allow only customers to login through this page
    const { error: signInError, userProfile } = await signIn(loginEmail, password, true);

    if (signInError) {
      // Show the actual error message (which may include server connection instructions)
      const errorMessage = signInError.message || t('auth.invalidCredentials') || 'Invalid email or password';
      
      // If it's a server connection error, preserve the newlines for better display
      if (errorMessage.includes('Backend server is not running')) {
        setError(errorMessage);
      } else {
        // For other errors, use translation
        setError(t('auth.invalidCredentials') || 'Invalid email or password');
      }
      setLoading(false);
    } else if (userProfile) {
      // SECURITY: Only allow customers to login through this page
      // Block all other roles (admin, employee, service provider, etc.)
      if (userProfile.role === 'customer') {
        navigate(`/${tenantSlug}/customer/dashboard`);
      } else {
        console.warn('[CustomerLoginPage] Security: Non-customer attempted to login through customer login page', { email: loginEmail, role: userProfile.role, userId: userProfile.id });
        setError('Access denied: This login page is for customers only. Administrators, service providers, and employees must use the admin login page.');
        setLoading(false);
        // Clear any session data that might have been set
        try {
          const { db } = await import('../../lib/db');
          await db.auth.signOut();
        } catch (err) {
          console.error('Error signing out non-customer:', err);
        }
      }
    }
  };

  return (
    <div 
      className="min-h-screen" 
      style={{ 
        background: `linear-gradient(135deg, ${primaryColor}08 0%, ${secondaryColor}08 100%)`
      }}
    >
      {/* Header - Matching Public Booking Page Style */}
      <header 
        className="bg-white/95 backdrop-blur-md shadow-md sticky top-0 z-50 border-b transition-all duration-300" 
        style={{ 
          top: '0',
          borderColor: `${primaryColor}15`
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            {/* Logo/Brand Section */}
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate(`/${tenantSlug}/book`)}>
              <div 
                className="p-3 rounded-xl shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl"
                style={{ 
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
                }}
              >
                <Package className="w-7 h-7 text-white" />
              </div>
              <div className="flex flex-col">
                <h1 
                  className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent transition-all duration-300 group-hover:opacity-80"
                  style={{ 
                    backgroundImage: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`
                  }}
                >
                  {tenant ? (i18n.language === 'ar' ? tenant.name_ar : tenant.name) : 'Bookati'}
                </h1>
                <span className="text-sm text-gray-500 font-medium">
                  {i18n.language === 'ar' ? 'احجز خدماتك الآن' : 'Book Your Services'}
                </span>
              </div>
            </div>

            {/* Actions Section */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/${tenantSlug}/book`)}
                className="transition-all duration-300 hover:scale-105"
                style={{ 
                  color: primaryColor,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${primaryColor}10`;
                  e.currentTarget.style.color = secondaryColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = primaryColor;
                }}
              >
                <Package className="w-4 h-4 mr-2" />
                {i18n.language === 'ar' ? 'عرض الخدمات' : 'View Services'}
              </Button>
              <div className="h-6 w-px bg-gray-300"></div>
              <LanguageToggle />
            </div>
          </div>
        </div>
      </header>

      <div 
        className="flex items-center justify-center p-4 min-h-[calc(100vh-80px)]"
        style={{ 
          background: `linear-gradient(135deg, ${primaryColor}08 0%, ${secondaryColor}08 100%)`
        }}
      >
        <div className="w-full max-w-md">

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/${tenantSlug}/customer`)}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 flex items-center justify-center gap-2">
                <LogIn className="w-5 h-5" style={{ color: primaryColor }} />
                <CardTitle className="text-center">Sign In</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm whitespace-pre-line">
                  {error}
                </div>
              )}

              <div className="relative">
                <Mail className="absolute left-3 top-[38px] w-5 h-5 text-gray-400" />
                <Input
                  type="text"
                  label="Email or Username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Enter email or username"
                  autoComplete="email"
                  className="pl-10"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-[38px] w-5 h-5 text-gray-400" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
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

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => navigate(`/${tenantSlug}/customer/forgot-password`)}
                  className="text-sm font-medium transition-colors"
                  style={{ color: primaryColor }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = secondaryColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = primaryColor;
                  }}
                >
                  {t('auth.forgotPassword')}
                </button>
              </div>

              <Button
                type="submit"
                fullWidth
                loading={loading}
                disabled={loading}
                style={{ 
                  backgroundColor: primaryColor,
                  borderColor: primaryColor
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = secondaryColor;
                  e.currentTarget.style.borderColor = secondaryColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = primaryColor;
                  e.currentTarget.style.borderColor = primaryColor;
                }}
              >
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </Button>

              <div className="text-center text-sm text-gray-600">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => navigate(`/${tenantSlug}/customer/signup`)}
                  className="font-medium inline-flex items-center gap-1 transition-colors"
                  style={{ color: primaryColor }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = secondaryColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = primaryColor;
                  }}
                >
                  <UserPlus className="w-4 h-4" />
                  Sign Up
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}

