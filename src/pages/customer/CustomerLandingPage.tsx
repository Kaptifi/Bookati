import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { LogIn, UserPlus, ArrowRight, Package, Zap, Clock, Rocket, Calendar } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  name_ar: string;
  slug: string;
}

export function CustomerLandingPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    if (tenantSlug) {
      fetchTenant();
    }
  }, [tenantSlug]);

  useEffect(() => {
    // If user is already logged in as customer, redirect to dashboard
    if (userProfile && userProfile.role === 'customer') {
      navigate(`/${tenantSlug}/customer/dashboard`);
    }
  }, [userProfile, tenantSlug, navigate]);

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
    } finally {
      setLoading(false);
    }
  }
  
  const primaryColor = settings.primary_color || '#2563eb';
  const secondaryColor = settings.secondary_color || '#3b82f6';

  if (loading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ 
          background: `linear-gradient(135deg, ${primaryColor}15 0%, ${secondaryColor}15 100%)`
        }}
      >
        <div className="text-center">
          <div 
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
            style={{ borderColor: primaryColor }}
          ></div>
          <p className="text-gray-600" style={{ color: primaryColor }}>Loading...</p>
        </div>
      </div>
    );
  }

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

  const tenantName = i18n.language === 'ar' ? tenant.name_ar : tenant.name;
  const isRTL = i18n.language === 'ar';

  return (
    <div 
      className="min-h-screen" 
      dir={isRTL ? 'rtl' : 'ltr'}
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
                  {tenantName}
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

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            {i18n.language === 'ar' 
              ? 'مرحباً بك في لوحة تحكم العملاء' 
              : 'Welcome to Customer Portal'}
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            {i18n.language === 'ar'
              ? 'سجل الدخول أو أنشئ حساباً جديداً لإدارة حجوزاتك'
              : 'Sign in or create an account to manage your bookings'}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => navigate(`/${tenantSlug}/customer/login`)}
              className="flex items-center gap-2"
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
              <LogIn className="w-5 h-5" />
              Sign In
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => navigate(`/${tenantSlug}/customer/signup`)}
              className="flex items-center gap-2"
              style={{ 
                backgroundColor: `${primaryColor}15`,
                borderColor: primaryColor,
                color: primaryColor
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${secondaryColor}25`;
                e.currentTarget.style.borderColor = secondaryColor;
                e.currentTarget.style.color = secondaryColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = `${primaryColor}15`;
                e.currentTarget.style.borderColor = primaryColor;
                e.currentTarget.style.color = primaryColor;
              }}
            >
              <UserPlus className="w-5 h-5" />
              Sign Up
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            {i18n.language === 'ar' ? 'مميزات حسابك' : 'Account Features'}
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="text-center p-6 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <Calendar className="w-8 h-8" style={{ color: primaryColor }} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {i18n.language === 'ar' ? 'إدارة الحجوزات' : 'Manage Bookings'}
              </h3>
              <p className="text-gray-600">
                {i18n.language === 'ar'
                  ? 'عرض وإدارة جميع حجوزاتك من مكان واحد'
                  : 'View and manage all your bookings in one place'}
              </p>
            </div>

            {/* Feature 2 */}
            <div className="text-center p-6 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <Zap className="w-8 h-8" style={{ color: primaryColor }} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {i18n.language === 'ar' ? 'حجوزات سريعة' : 'Quick Booking'}
              </h3>
              <p className="text-gray-600">
                {i18n.language === 'ar'
                  ? 'احجز خدماتك بسهولة وسرعة'
                  : 'Book services quickly and easily'}
              </p>
            </div>

            {/* Feature 3 */}
            <div className="text-center p-6 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <UserPlus className="w-8 h-8" style={{ color: primaryColor }} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {i18n.language === 'ar' ? 'تتبع الحالة' : 'Track Status'}
              </h3>
              <p className="text-gray-600">
                {i18n.language === 'ar'
                  ? 'تابع حالة حجوزاتك في الوقت الفعلي'
                  : 'Track your booking status in real-time'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section 
        className="py-16 px-4"
        style={{ 
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
        }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            {i18n.language === 'ar' 
              ? 'ابدأ رحلتك معنا اليوم' 
              : 'Start Your Journey Today'}
          </h2>
          <p className="text-xl text-white/90 mb-8">
            {i18n.language === 'ar'
              ? 'انضم إلى آلاف العملاء الراضين عن خدماتنا'
              : 'Join thousands of satisfied customers'}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              variant="secondary"
              onClick={() => navigate(`/${tenantSlug}/customer/signup`)}
              className="bg-white text-gray-900 hover:bg-gray-100"
            >
              <UserPlus className="w-5 h-5 mr-2" />
              Create Account
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate(`/${tenantSlug}/book`)}
              className="bg-transparent border-white text-white hover:bg-white"
              style={{
                borderColor: 'white',
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
                e.currentTarget.style.color = primaryColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'white';
              }}
            >
              <Package className="w-5 h-5 mr-2" />
              Browse Services
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-gray-400">
            &copy; {new Date().getFullYear()} {tenantName}. {i18n.language === 'ar' ? 'جميع الحقوق محفوظة' : 'All rights reserved'}.
          </p>
        </div>
      </footer>
    </div>
  );
}


