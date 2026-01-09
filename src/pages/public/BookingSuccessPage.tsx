import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { Package, CheckCircle, Calendar, Clock, Users, ArrowRight, User } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export function BookingSuccessPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { userProfile } = useAuth();

  const [tenant, setTenant] = useState<any>(null);
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bookingData = location.state;
    if (bookingData?.booking) {
      setBooking(bookingData.booking);
      fetchTenant();
    } else {
      navigate(`/${tenantSlug}/book`);
    }
  }, [location, tenantSlug]);

  // Prevent back navigation - replace history to prevent going back
  useEffect(() => {
    // Replace current history entry so back button goes to booking page instead
    window.history.pushState(null, '', window.location.href);
    
    const handlePopState = (event: PopStateEvent) => {
      // Prevent default back navigation
      window.history.pushState(null, '', window.location.href);
      // Redirect to booking page instead
      navigate(`/${tenantSlug}/book`, { replace: true });
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [tenantSlug, navigate]);

  async function fetchTenant() {
    if (!tenantSlug) return;
    try {
      const { data } = await db
        .from('tenants')
        .select('id, name, name_ar, slug, landing_page_settings')
        .eq('slug', tenantSlug)
        .maybeSingle();
      
      if (data) {
        setTenant(data);
      }
    } catch (error) {
      console.error('Error fetching tenant:', error);
    } finally {
      setLoading(false);
    }
  }

  const getSettings = () => {
    if (!tenant?.landing_page_settings) return {};
    const rawSettings = tenant.landing_page_settings;
    if (typeof rawSettings === 'string') {
      try {
        return JSON.parse(rawSettings);
      } catch {
        return {};
      }
    }
    return rawSettings || {};
  };

  const settings = getSettings();
  const primaryColor = settings.primary_color || '#2563eb';
  const secondaryColor = settings.secondary_color || '#3b82f6';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: primaryColor }}></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header 
        className="bg-white/95 backdrop-blur-md shadow-md sticky top-0 z-50 border-b transition-all duration-300" 
        style={{ 
          top: '0',
          borderColor: `${primaryColor}15`
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
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
                  {i18n.language === 'ar' ? tenant?.name_ar : tenant?.name}
                </h1>
              </div>
            </div>
            <LanguageToggle />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="text-center">
          <CardContent className="pt-12 pb-8">
            <div className="flex justify-center mb-6">
              <div 
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <CheckCircle className="w-12 h-12" style={{ color: primaryColor }} />
              </div>
            </div>

            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              {i18n.language === 'ar' ? 'تم تأكيد الحجز بنجاح!' : 'Booking Confirmed!'}
            </h2>

            <p className="text-gray-600 mb-8">
              {i18n.language === 'ar' 
                ? 'شكراً لك! تم تأكيد حجزك بنجاح. سيتم إرسال تذكرة الحجز إلى رقم الواتساب الخاص بك.'
                : 'Thank you! Your booking has been confirmed. Your booking ticket will be sent to your WhatsApp number.'}
            </p>

            <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500">
                    {i18n.language === 'ar' ? 'رقم الحجز' : 'Booking ID'}
                  </p>
                  <p className="font-semibold text-gray-900">{booking.id}</p>
                </div>
              </div>

              {booking.slot_date && (
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">
                      {i18n.language === 'ar' ? 'التاريخ' : 'Date'}
                    </p>
                    <p className="font-semibold text-gray-900">
                      {format(parseISO(booking.slot_date), 'EEEE, MMMM d, yyyy')}
                    </p>
                  </div>
                </div>
              )}

              {booking.visitor_count && (
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">
                      {i18n.language === 'ar' ? 'عدد الزوار' : 'Visitors'}
                    </p>
                    <p className="font-semibold text-gray-900">
                      {booking.visitor_count}
                      {booking.adult_count && booking.child_count && (
                        <span className="text-sm text-gray-600 ml-2">
                          ({booking.adult_count} {i18n.language === 'ar' ? 'كبار' : 'adults'}, {booking.child_count} {i18n.language === 'ar' ? 'أطفال' : 'children'})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {booking.customer_name && (
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">
                      {i18n.language === 'ar' ? 'اسم العميل' : 'Customer Name'}
                    </p>
                    <p className="font-semibold text-gray-900">{booking.customer_name}</p>
                  </div>
                </div>
              )}

              {booking.customer_phone && (
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">
                      {i18n.language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                    </p>
                    <p className="font-semibold text-gray-900">{booking.customer_phone}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500">
                    {i18n.language === 'ar' ? 'المبلغ الإجمالي' : 'Total Amount'}
                  </p>
                  <p className="font-semibold text-gray-900">
                    {parseFloat(booking.total_price?.toString() || '0').toFixed(2)} {t('service.currency') || 'SAR'}
                  </p>
                </div>
              </div>
            </div>

            {/* Signup Encouragement Message for Guests */}
            {!userProfile && (
              <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 text-center">
                  {i18n.language === 'ar' 
                    ? '💡 إذا كنت تريد عرض جميع حجوزاتك، يرجى إنشاء حساب.'
                    : '💡 If you want to view all your bookings, please sign up.'}
                </p>
                <div className="flex justify-center mt-3">
                  <Button
                    onClick={() => navigate(`/${tenantSlug}/customer/signup`)}
                    variant="outline"
                    size="sm"
                    style={{ borderColor: primaryColor, color: primaryColor }}
                  >
                    {i18n.language === 'ar' ? 'إنشاء حساب' : 'Create Account'}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => navigate(`/${tenantSlug}/book`)}
                variant="secondary"
                className="flex items-center justify-center"
              >
                {i18n.language === 'ar' ? 'حجز خدمة أخرى' : 'Book Another Service'}
              </Button>
              {userProfile?.role === 'customer' && (
                <Button
                  onClick={() => navigate(`/${tenantSlug}/customer/dashboard`)}
                  className="flex items-center justify-center"
                  style={{ backgroundColor: primaryColor }}
                >
                  {i18n.language === 'ar' ? 'عرض جميع الحجوزات' : 'View All Bookings'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}





