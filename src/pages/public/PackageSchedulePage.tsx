import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { AnimatedRating } from '../../components/ui/AnimatedRating';
import { Calendar, Clock, Package, ChevronRight, ChevronLeft, CheckCircle, X, User, AlertCircle, Users, Baby } from 'lucide-react';
import { format, addDays, startOfDay, getDay, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, getDaysInMonth } from 'date-fns';

interface Tenant {
  id: string;
  name: string;
  name_ar: string;
  slug: string;
  landing_page_settings?: any;
}

interface ServicePackage {
  id: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  total_price: number;
  original_price?: number | null;
  discount_percentage?: number | null;
  image_url?: string;
  gallery_urls?: string[];
  services?: Array<{
    service_id: string;
    service_name: string;
    service_name_ar: string;
    quantity: number;
  }>;
}

interface PackageService {
  service_id: string;
  service_name: string;
  service_name_ar: string;
  quantity: number;
  service?: {
    id: string;
    name: string;
    name_ar: string;
    description: string;
    description_ar: string;
    base_price: number;
    child_price?: number | null;
    duration_minutes: number;
    image_url?: string;
  };
}

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  available_capacity: number;
  booked_count: number;
  shift_id: string;
}

interface Shift {
  id: string;
  service_id: string;
  days_of_week: number[];
  start_time_utc: string;
  end_time_utc: string;
  is_active: boolean;
}

interface DateAvailability {
  date: Date;
  dateString: string;
  hasAvailability: boolean;
  slotCount: number;
}

// Helper function to format package name
function formatPackageName(
  pkg: ServicePackage,
  language: string
): string {
  const serviceNames = pkg.services
    ? pkg.services.map(svc => language === 'ar' ? svc.service_name_ar : svc.service_name).join(' + ')
    : '';
  
  let savePercentage = 0;
  if (pkg.original_price && pkg.original_price > pkg.total_price) {
    savePercentage = Math.round(((pkg.original_price - pkg.total_price) / pkg.original_price) * 100);
  } else if (pkg.discount_percentage) {
    savePercentage = pkg.discount_percentage;
  }
  
  if (savePercentage > 0 && serviceNames) {
    return language === 'ar' 
      ? `كومبو (وفر ${savePercentage}%): ${serviceNames}`
      : `Combo (Save ${savePercentage}%): ${serviceNames}`;
  } else if (serviceNames) {
    return language === 'ar'
      ? `كومبو: ${serviceNames}`
      : `Combo: ${serviceNames}`;
  } else {
    return language === 'ar' ? pkg.name_ar : pkg.name;
  }
}

export function PackageSchedulePage() {
  const { tenantSlug, packageId } = useParams<{ tenantSlug: string; packageId: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const isLoggedIn = userProfile?.role === 'customer';

  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [packageData, setPackageData] = useState<ServicePackage | null>(null);
  const [packageServices, setPackageServices] = useState<PackageService[]>([]);
  const [selectedDates, setSelectedDates] = useState<Record<string, Date | null>>({});
  const [selectedSlots, setSelectedSlots] = useState<Record<string, Slot | null>>({});
  const [availableDates, setAvailableDates] = useState<Record<string, DateAvailability[]>>({});
  const [slots, setSlots] = useState<Record<string, Slot[]>>({});
  const [shifts, setShifts] = useState<Record<string, Shift[]>>({});
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [showFullCalendar, setShowFullCalendar] = useState<Record<string, boolean>>({});
  const [calendarMonth, setCalendarMonth] = useState<Record<string, Date>>({});
  const [adultCounts, setAdultCounts] = useState<Record<string, number>>({});
  const [childCounts, setChildCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (tenantSlug && packageId) {
      fetchData();
    }
  }, [tenantSlug, packageId]);

  async function fetchData() {
    try {
      setLoading(true);

      if (!packageId) {
        console.error('Package ID is missing from URL');
        alert(i18n.language === 'ar' ? 'معرف الحزمة مفقود' : 'Package ID is missing');
        navigate(`/${tenantSlug}/book`);
        return;
      }

      console.log('Fetching data for package:', { packageId, tenantSlug });

      // Fetch tenant
      const { data: tenantData, error: tenantError } = await db
        .from('tenants')
        .select('id, name, name_ar, slug, landing_page_settings')
        .eq('slug', tenantSlug)
        .eq('is_active', true)
        .maybeSingle();

      if (tenantError || !tenantData) {
        console.error('Error fetching tenant:', tenantError);
        alert(i18n.language === 'ar' ? 'لم يتم العثور على مزود الخدمة' : 'Service provider not found');
        navigate(`/${tenantSlug}/book`);
        return;
      }

      setTenant(tenantData);

      // Fetch package - filter by tenant_id and is_active for security
      console.log('Fetching package:', { packageId, tenantId: tenantData.id });
      const { data: pkgData, error: pkgError } = await db
        .from('service_packages')
        .select('id, name, name_ar, description, description_ar, total_price, original_price, discount_percentage, image_url, gallery_urls, is_active, tenant_id')
        .eq('id', packageId)
        .eq('tenant_id', tenantData.id)
        .eq('is_active', true)
        .maybeSingle();

      console.log('Package query result:', { 
        found: !!pkgData, 
        error: pkgError?.message,
        packageTenantId: pkgData?.tenant_id,
        currentTenantId: tenantData.id,
        isActive: pkgData?.is_active
      });

      if (pkgError) {
        console.error('Error fetching package:', pkgError);
        alert(i18n.language === 'ar' ? `خطأ في جلب الحزمة: ${pkgError.message}` : `Error fetching package: ${pkgError.message}`);
        navigate(`/${tenantSlug}/book`);
        return;
      }

      if (!pkgData) {
        console.error('Package not found in database:', { packageId, tenantId: tenantData.id });
        // Try to list all packages for this tenant to help debug
        const { data: allPackages } = await db
          .from('service_packages')
          .select('id, name, tenant_id, is_active')
          .eq('tenant_id', tenantData.id)
          .limit(10);
        console.log('Available packages for this tenant:', allPackages);
        alert(i18n.language === 'ar' 
          ? 'لم يتم العثور على الحزمة. قد تكون غير نشطة أو غير موجودة.' 
          : 'Package not found. It may be inactive or does not exist.');
        navigate(`/${tenantSlug}/book`);
        return;
      }

      // Fetch package services
      // Use explicit foreign key format: services:service_id to avoid auto-detection issues
      const { data: packageServicesData, error: packageServicesError } = await db
        .from('package_services')
        .select('service_id, quantity, services:service_id (id, name, name_ar, description, description_ar, base_price, child_price, duration_minutes, image_url)')
        .eq('package_id', packageId);

      if (packageServicesError) {
        console.error('Error fetching package services:', packageServicesError);
      }

      const services: PackageService[] = (packageServicesData || []).map((ps: any) => ({
        service_id: ps.service_id,
        service_name: ps.services?.name || '',
        service_name_ar: ps.services?.name_ar || '',
        quantity: ps.quantity || 1,
        service: ps.services ? {
          id: ps.services.id,
          name: ps.services.name,
          name_ar: ps.services.name_ar,
          description: ps.services.description || '',
          description_ar: ps.services.description_ar || '',
          base_price: parseFloat(ps.services.base_price || 0),
          child_price: ps.services.child_price !== undefined && ps.services.child_price !== null 
            ? parseFloat(String(ps.services.child_price)) 
            : null,
          duration_minutes: ps.services.duration_minutes || 60,
          image_url: ps.services.image_url || null,
        } : undefined,
      }));

      setPackageServices(services);

      // Parse gallery_urls
      let galleryUrls: string[] = [];
      if (pkgData.gallery_urls) {
        if (Array.isArray(pkgData.gallery_urls)) {
          galleryUrls = pkgData.gallery_urls.filter((img: any) => img && typeof img === 'string');
        } else if (typeof pkgData.gallery_urls === 'string') {
          try {
            const parsed = JSON.parse(pkgData.gallery_urls);
            if (Array.isArray(parsed)) {
              galleryUrls = parsed.filter((img: any) => img && typeof img === 'string');
            }
          } catch {
            galleryUrls = [];
          }
        }
      }
      if (galleryUrls.length === 0 && pkgData.image_url) {
        galleryUrls = [pkgData.image_url];
      }

      setPackageData({
        ...pkgData,
        services: services.map(s => ({
          service_id: s.service_id,
          service_name: s.service_name,
          service_name_ar: s.service_name_ar,
          quantity: s.quantity,
        })),
        gallery_urls: galleryUrls,
        image_url: pkgData.image_url || (galleryUrls.length > 0 ? galleryUrls[0] : null),
      });

      // Initialize selected dates and slots for each service
      const initialDates: Record<string, Date | null> = {};
      const initialSlots: Record<string, Slot | null> = {};
      services.forEach(svc => {
        initialDates[svc.service_id] = null;
        initialSlots[svc.service_id] = null;
      });
      setSelectedDates(initialDates);
      setSelectedSlots(initialSlots);

      // Fetch shifts and slots for each service
      await Promise.all(services.map(svc => fetchServiceSchedule(svc.service_id, tenantData.id)));

    } catch (error: any) {
      console.error('Error fetching package data:', error);
      console.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        tenantSlug,
        packageId,
      });
      
      // Show more specific error message
      let errorMessage = i18n.language === 'ar' ? 'حدث خطأ أثناء تحميل البيانات' : 'Error loading data';
      if (error?.message) {
        errorMessage += `: ${error.message}`;
      }
      
      // Don't show alert if we're redirecting
      if (!tenant || !packageData) {
        // Will be handled by the component's error state
        return;
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function fetchServiceSchedule(serviceId: string, tenantId: string) {
    try {
      // Fetch shifts
      const { data: shiftsData, error: shiftsError } = await db
        .from('shifts')
        .select('id, service_id, days_of_week, start_time_utc, end_time_utc, is_active')
        .eq('service_id', serviceId)
        .eq('is_active', true);

      if (shiftsError) {
        console.error(`Error fetching shifts for service ${serviceId}:`, shiftsError);
        return;
      }

      if (!shiftsData || shiftsData.length === 0) {
        setShifts(prev => ({ ...prev, [serviceId]: [] }));
        setAvailableDates(prev => ({ ...prev, [serviceId]: [] }));
        return;
      }

      setShifts(prev => ({ ...prev, [serviceId]: shiftsData }));

      // Fetch slots for the next 60 days
      const today = startOfDay(new Date());
      const endDate = addDays(today, 60);
      const startDateStr = format(today, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');

      const shiftIds = shiftsData.map((s: any) => s.id);

      const { data: slotsData, error: slotsError } = await db
        .from('slots')
        .select('id, slot_date, start_time, end_time, available_capacity, booked_count, shift_id')
        .eq('tenant_id', tenantId)
        .in('shift_id', shiftIds)
        .gte('slot_date', startDateStr)
        .lte('slot_date', endDateStr)
        .eq('is_available', true)
        .gt('available_capacity', 0)
        .order('slot_date, start_time');

      if (slotsError) {
        console.error(`Error fetching slots for service ${serviceId}:`, slotsError);
        return;
      }

      // Filter slots by shift days_of_week
      let validSlots = (slotsData || []).filter((slot: Slot) => {
        const slotDate = parseISO(slot.slot_date);
        const dayOfWeek = getDay(slotDate); // 0 = Sunday, 6 = Saturday
        const shift = shiftsData.find((s: any) => s.id === slot.shift_id);
        return shift && shift.days_of_week.includes(dayOfWeek);
      });

      // Filter out past time slots for today only
      const now = new Date();
      const todayStr = format(startOfDay(now), 'yyyy-MM-dd');
      const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes since midnight
      
      validSlots = validSlots.filter((slot: Slot) => {
        const slotDateStr = format(parseISO(slot.slot_date), 'yyyy-MM-dd');
        
        // Only filter if it's today
        if (slotDateStr === todayStr) {
          if (!slot.start_time) return true; // Keep slots without start_time
          const [hours, minutes] = slot.start_time.split(':').map(Number);
          if (isNaN(hours) || isNaN(minutes)) return true; // Keep slots with invalid time
          const slotTime = hours * 60 + minutes; // Slot time in minutes since midnight
          // Keep slot if its start time is in the future (at least 1 minute from now)
          return slotTime > currentTime;
        }
        // For future dates, keep all slots
        return true;
      });

      setSlots(prev => ({ ...prev, [serviceId]: validSlots }));

      // Calculate available dates - normalize slot dates for consistency
      const datesMap = new Map<string, { date: Date; slotCount: number }>();
      validSlots.forEach((slot: Slot) => {
        // Normalize the slot_date to ensure consistent format
        let normalizedDateStr: string;
        try {
          if (slot.slot_date.includes('T') || slot.slot_date.includes('Z')) {
            normalizedDateStr = format(parseISO(slot.slot_date), 'yyyy-MM-dd');
          } else {
            normalizedDateStr = slot.slot_date.length > 10 ? slot.slot_date.substring(0, 10) : slot.slot_date;
          }
        } catch (e) {
          normalizedDateStr = slot.slot_date.length > 10 ? slot.slot_date.substring(0, 10) : slot.slot_date;
        }
        
        if (!datesMap.has(normalizedDateStr)) {
          try {
            const dateObj = normalizedDateStr.includes('T') || normalizedDateStr.includes('Z')
              ? parseISO(normalizedDateStr)
              : parseISO(normalizedDateStr + 'T00:00:00');
            datesMap.set(normalizedDateStr, {
              date: dateObj,
              slotCount: 0,
            });
          } catch (e) {
            console.warn(`Failed to parse date: ${normalizedDateStr}`, e);
          }
        }
        if (datesMap.has(normalizedDateStr)) {
          datesMap.get(normalizedDateStr)!.slotCount++;
        }
      });

      const dates: DateAvailability[] = Array.from(datesMap.values()).map(({ date, slotCount }) => ({
        date,
        dateString: format(date, 'yyyy-MM-dd'),
        hasAvailability: slotCount > 0,
        slotCount,
      })).sort((a, b) => a.date.getTime() - b.date.getTime());

      setAvailableDates(prev => ({ ...prev, [serviceId]: dates }));

    } catch (error: any) {
      console.error(`Error fetching schedule for service ${serviceId}:`, error);
    }
  }

  function handleDateSelect(serviceId: string, date: Date) {
    setSelectedDates(prev => ({ ...prev, [serviceId]: date }));
    setSelectedSlots(prev => ({ ...prev, [serviceId]: null })); // Clear slot when date changes
  }

  function handleSlotSelect(serviceId: string, slot: Slot) {
    setSelectedSlots(prev => ({ ...prev, [serviceId]: slot }));
  }

  function canProceed(): boolean {
    // Check if all services have a date and slot selected
    return packageServices.every(svc => {
      const date = selectedDates[svc.service_id];
      const slot = selectedSlots[svc.service_id];
      return date !== null && slot !== null;
    });
  }

  function handleContinue() {
    if (!canProceed()) {
      alert(i18n.language === 'ar' 
        ? 'يرجى اختيار التاريخ والوقت لجميع الخدمات' 
        : 'Please select date and time for all services');
      return;
    }

    if (!packageData || packageServices.length === 0) return;

    // Navigate to checkout with package booking data
    // Use the first service's slot as the primary slot for booking creation
    const firstService = packageServices[0];
    const firstSlot = selectedSlots[firstService.service_id];
    const firstDate = selectedDates[firstService.service_id];

    if (!firstSlot || !firstDate) return;

    // Validate capacity for each service's slot before proceeding
    for (const pkgService of packageServices) {
      const slot = selectedSlots[pkgService.service_id];
      const serviceAdultCount = adultCounts[pkgService.service_id] || 1;
      const serviceChildCount = childCounts[pkgService.service_id] || 0;
      const serviceVisitorCount = serviceAdultCount + serviceChildCount;
      
      if (!slot) {
        alert(
          i18n.language === 'ar'
            ? `يرجى اختيار وقت لخدمة "${i18n.language === 'ar' ? pkgService.service_name_ar : pkgService.service_name}"`
            : `Please select a time for service "${i18n.language === 'ar' ? pkgService.service_name_ar : pkgService.service_name}"`
        );
        return;
      }
      
      if (slot.available_capacity < serviceVisitorCount) {
        alert(
          i18n.language === 'ar'
            ? `لا توجد أماكن كافية لخدمة "${i18n.language === 'ar' ? pkgService.service_name_ar : pkgService.service_name}". المتاح: ${slot.available_capacity}، المطلوب: ${serviceVisitorCount}`
            : `Not enough capacity for service "${i18n.language === 'ar' ? pkgService.service_name_ar : pkgService.service_name}". Available: ${slot.available_capacity}, Requested: ${serviceVisitorCount}`
        );
        return;
      }
    }

    // Calculate total adult and child counts across all services
    const totalAdultCount = packageServices.reduce((sum, svc) => sum + (adultCounts[svc.service_id] || 1), 0);
    const totalChildCount = packageServices.reduce((sum, svc) => sum + (childCounts[svc.service_id] || 0), 0);

    // Build packageServices array with all required data
    const packageServicesData = packageServices.map(svc => {
      const slot = selectedSlots[svc.service_id];
      return {
        serviceId: svc.service_id,
        serviceName: i18n.language === 'ar' ? svc.service_name_ar : svc.service_name,
        serviceName_ar: svc.service_name_ar,
        date: selectedDates[svc.service_id],
        slot: slot,
        slotId: slot?.id,
        adultCount: adultCounts[svc.service_id] || 1,
        childCount: childCounts[svc.service_id] || 0,
      };
    });

    const bookingData = {
      serviceId: firstService.service_id, // Required by CheckoutPage
      packageId: packageData.id,
      slotId: firstSlot.id,
      date: format(firstDate, 'yyyy-MM-dd'),
      time: firstSlot.start_time,
      // Additional package data
      packageName: formatPackageName(packageData, i18n.language),
      totalPrice: packageData.total_price,
      adultCount: totalAdultCount,
      childCount: totalChildCount,
      packageServices: packageServicesData,
    };

    // Check if user is logged in
    if (!isLoggedIn) {
      // Redirect to phone entry page
      navigate(`/${tenantSlug}/book/phone-entry`, {
        state: bookingData,
      });
      return;
    }

    // Navigate to checkout with booking data
    navigate(`/${tenantSlug}/book/checkout`, {
      state: bookingData,
    });
  }

  const weekDays = eachDayOfInterval({
    start: currentWeekStart,
    end: endOfWeek(currentWeekStart, { weekStartsOn: 0 }),
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{i18n.language === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (!packageData || !tenant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">{i18n.language === 'ar' ? 'الحزمة غير موجودة' : 'Package not found'}</p>
          <Button onClick={() => navigate(`/${tenantSlug}/book`)} className="mt-4">
            {i18n.language === 'ar' ? 'العودة' : 'Go Back'}
          </Button>
        </div>
      </div>
    );
  }

  const packageDisplayName = formatPackageName(packageData, i18n.language);
  const packageImage = packageData.image_url || (packageData.gallery_urls && packageData.gallery_urls.length > 0 ? packageData.gallery_urls[0] : null);

  // Get settings for colors
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

  // Normalize slot_date to yyyy-MM-dd format
  const normalizeSlotDate = (slotDate: string): string => {
    if (!slotDate) return '';
    // If it's a timestamp or Date object, parse and format it
    if (slotDate.includes('T') || slotDate.includes('Z')) {
      return format(parseISO(slotDate), 'yyyy-MM-dd');
    } else if (typeof slotDate === 'string' && slotDate.length > 10) {
      // If it's a long string, try to parse it
      try {
        return format(new Date(slotDate), 'yyyy-MM-dd');
      } catch (e) {
        // Keep original if parsing fails, but take first 10 chars
        return slotDate.substring(0, 10);
      }
    }
    // Ensure it's in yyyy-MM-dd format (take first 10 characters if longer)
    return slotDate.length > 10 ? slotDate.substring(0, 10) : slotDate;
  };

  // Format time to 12-hour format (e.g., "7:30am" or "7:30pm")
  const formatTime12Hour = (timeStr: string): string => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours || '0', 10);
    const min = minutes || '00';
    const period = hour >= 12 ? 'pm' : 'am';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${min}${period}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Matching ServiceBookingFlow Style */}
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
                  {i18n.language === 'ar' ? tenant.name_ar : tenant.name}
                </h1>
                <span className="text-sm text-gray-500 font-medium">
                  {i18n.language === 'ar' ? 'احجز حزمتك الآن' : 'Book Your Package'}
                </span>
              </div>
            </div>

            {/* Actions Section */}
            <div className="flex items-center gap-3">
              {isLoggedIn ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/${tenantSlug}/customer/dashboard`)}
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
                  <User className="w-4 h-4 mr-2" />
                  {i18n.language === 'ar' ? 'حسابي' : 'My Account'}
                </Button>
              ) : null}
              <div className="h-6 w-px bg-gray-300"></div>
              <LanguageToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Package Title and Info - Matching reference page style */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                    {packageDisplayName}
                  </h1>
                  {packageData.description && (
                    <p className="text-gray-600 mt-2">
                      {i18n.language === 'ar' ? packageData.description_ar : packageData.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => navigate(`/${tenantSlug}/book`)}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 ml-4 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                  title={i18n.language === 'ar' ? 'تعديل' : 'Edit'}
                >
                  <Calendar className="w-4 h-4" />
                  {i18n.language === 'ar' ? 'تعديل' : 'Edit'}
                </button>
              </div>
            </div>

            {/* Service Schedule Selection */}
            <div className="space-y-6">
          {packageServices.map((pkgService, index) => {
            const service = pkgService.service;
            const serviceSlots = slots[pkgService.service_id] || [];
            const serviceDates = availableDates[pkgService.service_id] || [];
            const selectedDate = selectedDates[pkgService.service_id];
            const selectedSlot = selectedSlots[pkgService.service_id];
            const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
            let availableSlotsForDate = serviceSlots.filter(s => {
              const normalizedSlotDate = normalizeSlotDate(s.slot_date);
              return normalizedSlotDate === dateStr;
            });
            
            // Filter out past time slots for today only
            if (dateStr) {
              const now = new Date();
              const todayStr = format(startOfDay(now), 'yyyy-MM-dd');
              const isToday = dateStr === todayStr;
              
              if (isToday) {
                const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes since midnight
                console.log(`[PackageSchedulePage] Filtering slots for today. Current time: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} (${currentTime} minutes), Date: ${dateStr}`);
                const beforeCount = availableSlotsForDate.length;
                availableSlotsForDate = availableSlotsForDate.filter((slot: Slot) => {
                  if (!slot.start_time) {
                    console.log(`[PackageSchedulePage] Slot ${slot.id} has no start_time, keeping it`);
                    return true; // Keep slots without start_time
                  }
                  // Handle time format: "HH:MM" or "HH:MM:SS"
                  const timeParts = slot.start_time.split(':');
                  const hours = parseInt(timeParts[0] || '0', 10);
                  const minutes = parseInt(timeParts[1] || '0', 10);
                  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                    console.log(`[PackageSchedulePage] Slot ${slot.id} has invalid time format: ${slot.start_time}, keeping it`);
                    return true; // Keep slots with invalid time
                  }
                  const slotTime = hours * 60 + minutes; // Slot time in minutes since midnight
                  const shouldKeep = slotTime > currentTime;
                  console.log(`[PackageSchedulePage] Slot ${slot.id}: ${slot.start_time} (${hours}:${String(minutes).padStart(2, '0')} = ${slotTime} min) vs current (${currentTime} min) - ${shouldKeep ? 'KEEP' : 'FILTER OUT'}`);
                  // Keep slot if its start time is in the future
                  return shouldKeep;
                });
                console.log(`[PackageSchedulePage] Filtered slots: ${beforeCount} -> ${availableSlotsForDate.length}`);
              }
            }
            
            // Debug logging
            if (selectedDate && availableSlotsForDate.length === 0 && serviceSlots.length > 0) {
              console.log(`[PackageSchedule] No slots found for date ${dateStr}`, {
                serviceId: pkgService.service_id,
                serviceName: pkgService.service_name,
                totalSlots: serviceSlots.length,
                slotDates: [...new Set(serviceSlots.map(s => normalizeSlotDate(s.slot_date)))],
                selectedDateStr: dateStr,
              });
            }

            return (
              <div key={pkgService.service_id} className="bg-white rounded-lg shadow-sm p-6">
                <div className="mb-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full font-semibold text-white"
                          style={{ backgroundColor: primaryColor }}>
                          {index + 1}
                        </span>
                        <h3 className="text-xl md:text-2xl font-bold text-gray-900">
                          {i18n.language === 'ar' ? pkgService.service_name_ar : pkgService.service_name}
                        </h3>
                      </div>
                      {selectedDate && selectedSlot && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 mt-2 ml-11">
                          <Calendar className="w-4 h-4" />
                          <span className="font-medium">
                            {format(selectedDate, i18n.language === 'ar' ? 'EEE، d MMM، yyyy' : 'EEE, MMM d, yyyy')}
                          </span>
                          <span className="text-gray-400">•</span>
                          <Clock className="w-4 h-4" />
                          <span className="font-medium">
                            {formatTime12Hour(selectedSlot.start_time)}
                            {selectedSlot.end_time && ` - ${formatTime12Hour(selectedSlot.end_time)}`}
                          </span>
                        </div>
                      )}
                    </div>
                    {selectedDate && (
                      <button
                        onClick={() => {
                          setSelectedDates(prev => ({ ...prev, [pkgService.service_id]: null }));
                          setSelectedSlots(prev => ({ ...prev, [pkgService.service_id]: null }));
                        }}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 ml-4 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                        title={i18n.language === 'ar' ? 'تعديل التاريخ والوقت' : 'Edit date and time'}
                      >
                        <Calendar className="w-4 h-4" />
                        {i18n.language === 'ar' ? 'تعديل' : 'Edit'}
                      </button>
                    )}
                  </div>
                  {service && (
                    <p className="text-sm text-gray-600 ml-11">
                      {i18n.language === 'ar' ? service.description_ar : service.description}
                    </p>
                  )}
                </div>

                {/* Date Selection - Matching ServiceBookingFlow Style */}
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    {i18n.language === 'ar' ? 'اختر التاريخ' : 'Select a date'}
                  </h2>
                  
                  {/* Horizontal scrollable date cards - Always show first 7 */}
                  <div className="relative">
                    <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'thin' }}>
                      {serviceDates.slice(0, 7).map((dateAvail) => {
                        const isSelected = selectedDate && isSameDay(dateAvail.date, selectedDate);
                        return (
                          <button
                            key={dateAvail.dateString}
                            onClick={() => handleDateSelect(pkgService.service_id, dateAvail.date)}
                            className={`flex-shrink-0 flex flex-col items-center justify-center px-3 py-2.5 rounded-md border transition-all min-w-[85px] max-w-[85px] ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 shadow-sm'
                                : 'border-gray-300 hover:border-gray-400 bg-white hover:shadow-sm'
                            }`}
                            style={
                              isSelected
                                ? {
                                    borderColor: primaryColor,
                                    backgroundColor: `${primaryColor}08`,
                                    boxShadow: `0 1px 3px 0 ${primaryColor}20`,
                                  }
                                : {}
                            }
                          >
                            <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider leading-tight">
                              {format(dateAvail.date, 'EEE')}
                            </span>
                            <span className="text-lg font-bold text-gray-900 mt-1">
                              {format(dateAvail.date, 'd')}
                            </span>
                            {dateAvail.slotCount > 0 && (
                              <span className="text-[9px] font-medium text-gray-500 mt-0.5">
                                {dateAvail.slotCount} {i18n.language === 'ar' ? 'مواعيد' : 'slots'}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      
                      {/* More dates button - Show if more than 7 dates */}
                      {serviceDates.length > 7 && (
                        <button
                          onClick={() => {
                            setShowFullCalendar(prev => ({ ...prev, [pkgService.service_id]: true }));
                            // Set calendar month to first available date or current month
                            if (serviceDates.length > 0) {
                              setCalendarMonth(prev => ({ ...prev, [pkgService.service_id]: startOfMonth(serviceDates[0].date) }));
                            }
                          }}
                          className="flex-shrink-0 flex flex-col items-center justify-center px-3 py-2.5 rounded-md border border-gray-300 hover:border-gray-400 bg-white min-w-[85px] max-w-[85px] transition-all hover:shadow-sm"
                        >
                          <span className="text-xs font-medium text-gray-600">
                            {i18n.language === 'ar' ? 'المزيد' : 'More'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Calendar Modal - Full calendar view with month navigation */}
                  {showFullCalendar[pkgService.service_id] && (
                    <div className="fixed inset-0 z-50 overflow-y-auto">
                      <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={() => setShowFullCalendar(prev => ({ ...prev, [pkgService.service_id]: false }))} />
                        
                        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                          {/* Header */}
                          <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-semibold text-gray-900">
                              {i18n.language === 'ar' ? 'اختر التاريخ' : 'Select a date'}
                            </h2>
                            <button
                              onClick={() => setShowFullCalendar(prev => ({ ...prev, [pkgService.service_id]: false }))}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <X className="w-6 h-6" />
                            </button>
                          </div>
                          
                          {/* Calendar Content */}
                          <div className="p-6">
                            {/* Month Navigation */}
                            <div className="flex items-center justify-between mb-6">
                              <button
                                onClick={() => setCalendarMonth(prev => ({ ...prev, [pkgService.service_id]: subMonths(calendarMonth[pkgService.service_id] || new Date(), 1) }))}
                                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                <ChevronLeft className="w-5 h-5 text-gray-600" />
                              </button>
                              <div className="flex items-center gap-8">
                                <h3 className="text-lg font-semibold text-gray-900">
                                  {format(calendarMonth[pkgService.service_id] || new Date(), 'MMMM yyyy')}
                                </h3>
                                <h3 className="text-lg font-semibold text-gray-900">
                                  {format(addMonths(calendarMonth[pkgService.service_id] || new Date(), 1), 'MMMM yyyy')}
                                </h3>
                              </div>
                              <button
                                onClick={() => setCalendarMonth(prev => ({ ...prev, [pkgService.service_id]: addMonths(calendarMonth[pkgService.service_id] || new Date(), 1) }))}
                                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                <ChevronRight className="w-5 h-5 text-gray-600" />
                              </button>
                            </div>
                            
                            {/* Two Month Calendar Grid */}
                            <div className="grid grid-cols-2 gap-8">
                              {/* First Month */}
                              {[calendarMonth[pkgService.service_id] || new Date(), addMonths(calendarMonth[pkgService.service_id] || new Date(), 1)].map((month, monthIndex) => {
                                const monthStart = startOfMonth(month);
                                const monthEnd = endOfMonth(month);
                                const daysInMonth = getDaysInMonth(month);
                                const firstDayOfWeek = monthStart.getDay();
                                
                                // Create date map for quick lookup
                                const dateMap = new Map<string, DateAvailability>();
                                serviceDates.forEach(dateAvail => {
                                  dateMap.set(dateAvail.dateString, dateAvail);
                                });
                                
                                return (
                                  <div key={monthIndex} className="flex flex-col">
                                    {/* Month Header */}
                                    <h4 className="text-base font-semibold text-gray-900 mb-3 text-center">
                                      {format(month, 'MMMM yyyy')}
                                    </h4>
                                    
                                    {/* Days of Week Header */}
                                    <div className="grid grid-cols-7 gap-1 mb-2">
                                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                                        <div key={day} className="text-xs font-medium text-gray-500 text-center py-1">
                                          {day}
                                        </div>
                                      ))}
                                    </div>
                                    
                                    {/* Calendar Grid */}
                                    <div className="grid grid-cols-7 gap-1">
                                      {/* Empty cells for days before month starts */}
                                      {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                                        <div key={`empty-${idx}`} className="aspect-square" />
                                      ))}
                                      
                                      {/* Days of the month */}
                                      {Array.from({ length: daysInMonth }).map((_, dayIndex) => {
                                        const currentDate = addDays(monthStart, dayIndex);
                                        const dateStr = format(currentDate, 'yyyy-MM-dd');
                                        const dateAvail = dateMap.get(dateStr);
                                        const isSelected = selectedDate && isSameDay(currentDate, selectedDate);
                                        const isPast = currentDate < startOfDay(new Date());
                                        
                                        return (
                                          <button
                                            key={dayIndex}
                                            onClick={() => {
                                              if (dateAvail && !isPast) {
                                                handleDateSelect(pkgService.service_id, dateAvail.date);
                                                setShowFullCalendar(prev => ({ ...prev, [pkgService.service_id]: false }));
                                              }
                                            }}
                                            disabled={!dateAvail || isPast}
                                            className={`aspect-square flex flex-col items-center justify-center p-1 rounded-md border transition-all ${
                                              !dateAvail || isPast
                                                ? 'border-transparent bg-gray-50 text-gray-300 cursor-not-allowed'
                                                : isSelected
                                                ? 'border-blue-500 bg-blue-50 shadow-sm'
                                                : 'border-gray-200 hover:border-gray-300 bg-white hover:shadow-sm'
                                            }`}
                                            style={
                                              dateAvail && !isPast && isSelected
                                                ? {
                                                    borderColor: primaryColor,
                                                    backgroundColor: `${primaryColor}08`,
                                                    boxShadow: `0 1px 3px 0 ${primaryColor}20`,
                                                  }
                                                : {}
                                            }
                                          >
                                            <span className={`text-xs font-medium ${!dateAvail || isPast ? 'text-gray-300' : 'text-gray-900'}`}>
                                              {dayIndex + 1}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* No dates available message */}
                  {serviceDates.length === 0 && (
                    <div className="w-full text-center py-8">
                      <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500 mb-2 font-medium">
                        {i18n.language === 'ar' ? 'لا توجد تواريخ متاحة حالياً' : 'No available dates at the moment'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Time Slot Selection - Matching ServiceBookingFlow Style */}
                {selectedDate && (
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      {i18n.language === 'ar' ? 'اختر الوقت' : 'Pick a time'}
                    </h2>
                    {availableSlotsForDate.length > 0 ? (
                      <div>
                        <select
                          value={selectedSlot?.id || ''}
                          onChange={(e) => {
                            const slotId = e.target.value;
                            const slot = availableSlotsForDate.find(s => s.id === slotId);
                            if (slot) {
                              handleSlotSelect(pkgService.service_id, slot);
                            }
                          }}
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg font-medium text-gray-900 bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all"
                          style={{
                            borderColor: selectedSlot ? primaryColor : undefined,
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = `2px solid ${primaryColor}`;
                            e.target.style.outlineOffset = '2px';
                          }}
                          onBlur={(e) => {
                            e.target.style.outline = '';
                            e.target.style.outlineOffset = '';
                          }}
                        >
                          <option value="">
                            {i18n.language === 'ar' ? 'اختر الوقت' : 'Select a time'}
                          </option>
                          {availableSlotsForDate.map((slot) => {
                            const isSelected = selectedSlot?.id === slot.id;
                            const timeDisplay = formatTime12Hour(slot.start_time);
                            const capacityText = slot.available_capacity === 1 
                              ? ` (${i18n.language === 'ar' ? 'تذكرة واحدة متبقية' : '1 ticket left'})`
                              : '';
                            
                            return (
                              <option
                                key={slot.id}
                                value={slot.id}
                                style={{
                                  backgroundColor: isSelected ? `${primaryColor}15` : 'white',
                                }}
                              >
                                {timeDisplay}{capacityText}
                              </option>
                            );
                          })}
                        </select>
                        {selectedSlot && (
                          <div className="mt-2 text-sm text-gray-600 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span>
                              {formatTime12Hour(selectedSlot.start_time)}
                              {selectedSlot.end_time && ` - ${formatTime12Hour(selectedSlot.end_time)}`}
                            </span>
                            {selectedSlot.available_capacity > 0 && (
                              <span className="text-gray-500">
                                • {selectedSlot.available_capacity} {i18n.language === 'ar' ? 'متاح' : 'available'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">
                        {i18n.language === 'ar' ? 'لا توجد مواعيد متاحة لهذا التاريخ' : 'No slots available for this date'}
                      </p>
                    )}
                  </div>
                )}

                {/* Number of Tickets Selection - Show after date and time are selected for this service */}
                {selectedDate && selectedSlot && (
                  <div className="mt-6 bg-gray-50 rounded-lg p-4">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      {i18n.language === 'ar' ? 'اختر عدد التذاكر' : 'Select number of tickets'}
                    </h2>
                    
                    <div className="space-y-4">
                      {/* Adult Tickets */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-600" />
                            <span className="text-sm text-gray-700">
                              {i18n.language === 'ar' ? 'تذاكر الكبار' : 'Adult Tickets'}
                            </span>
                          </div>
                          {service && (
                            <span className="text-sm font-semibold text-gray-900">
                              {parseFloat(String(service.base_price || 0)).toFixed(2)} {t('service.currency') || 'SAR'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setAdultCounts(prev => ({
                              ...prev,
                              [pkgService.service_id]: Math.max(1, (prev[pkgService.service_id] || 1) - 1)
                            }))}
                            disabled={(adultCounts[pkgService.service_id] || 1) === 1}
                            className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <span className="text-lg font-semibold w-12 text-center">
                            {adultCounts[pkgService.service_id] || 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const currentCount = adultCounts[pkgService.service_id] || 1;
                              const currentChildCount = childCounts[pkgService.service_id] || 0;
                              const newTotalTickets = currentCount + currentChildCount + 1;
                              // Check capacity before allowing increase
                              if (selectedSlot && selectedSlot.available_capacity < newTotalTickets) {
                                alert(
                                  i18n.language === 'ar' 
                                    ? `لا توجد أماكن كافية. المتاح: ${selectedSlot.available_capacity}، المطلوب: ${newTotalTickets}`
                                    : `Not enough capacity available. Available: ${selectedSlot.available_capacity}, Requested: ${newTotalTickets}`
                                );
                                return;
                              }
                              setAdultCounts(prev => ({
                                ...prev,
                                [pkgService.service_id]: currentCount + 1
                              }));
                            }}
                            disabled={selectedSlot ? (adultCounts[pkgService.service_id] || 1) + (childCounts[pkgService.service_id] || 0) >= (selectedSlot.available_capacity || 0) : false}
                            className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Users className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Child Tickets - Only show if this service has child_price */}
                      {service && service.child_price !== undefined && service.child_price !== null && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Baby className="w-4 h-4 text-gray-600" />
                              <span className="text-sm text-gray-700">
                                {i18n.language === 'ar' ? 'تذاكر الأطفال' : 'Child Tickets'}
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-gray-900">
                              {parseFloat(String(service.child_price || 0)).toFixed(2)} {t('service.currency') || 'SAR'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setChildCounts(prev => ({
                                ...prev,
                                [pkgService.service_id]: Math.max(0, (prev[pkgService.service_id] || 0) - 1)
                              }))}
                              disabled={(childCounts[pkgService.service_id] || 0) === 0}
                              className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <span className="text-lg font-semibold w-12 text-center">
                              {childCounts[pkgService.service_id] || 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const currentCount = adultCounts[pkgService.service_id] || 1;
                                const currentChildCount = childCounts[pkgService.service_id] || 0;
                                const newTotalTickets = currentCount + currentChildCount + 1;
                                // Check capacity before allowing increase
                                if (selectedSlot && selectedSlot.available_capacity < newTotalTickets) {
                                  alert(
                                    i18n.language === 'ar' 
                                      ? `لا توجد أماكن كافية. المتاح: ${selectedSlot.available_capacity}، المطلوب: ${newTotalTickets}`
                                      : `Not enough capacity available. Available: ${selectedSlot.available_capacity}, Requested: ${newTotalTickets}`
                                  );
                                  return;
                                }
                                setChildCounts(prev => ({
                                  ...prev,
                                  [pkgService.service_id]: currentChildCount + 1
                                }));
                              }}
                              disabled={selectedSlot ? (adultCounts[pkgService.service_id] || 1) + (childCounts[pkgService.service_id] || 0) >= (selectedSlot.available_capacity || 0) : false}
                              className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Users className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Total Visitors Display for this service */}
                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">
                            {i18n.language === 'ar' ? 'إجمالي الزوار لهذه الخدمة' : 'Total Visitors for this service'}
                          </span>
                          <span className="text-lg font-semibold text-gray-900">
                            {(adultCounts[pkgService.service_id] || 1) + (childCounts[pkgService.service_id] || 0)} {i18n.language === 'ar' ? 'زائر' : 'visitor(s)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            );
          })}
            </div>
          </div>

          {/* Sidebar - Booking Summary - Matching reference page style */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-24">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {i18n.language === 'ar' ? 'ملخص الحجز' : 'Booking Summary'}
              </h2>

              <div className="space-y-4">
                {/* Package Name */}
                <div>
                  <div className="text-sm text-gray-600 mb-1">
                    {i18n.language === 'ar' ? 'الحزمة' : 'Package'}
                  </div>
                  <div className="font-medium text-gray-900">
                    {packageDisplayName}
                  </div>
                </div>

                {/* Included Services with Dates/Times */}
                {packageServices.map((pkgService, index) => {
                  const selectedDate = selectedDates[pkgService.service_id];
                  const selectedSlot = selectedSlots[pkgService.service_id];
                  
                  return (
                    <div key={pkgService.service_id} className="pt-3 border-t border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">
                        {i18n.language === 'ar' ? `الخدمة ${index + 1}` : `Service ${index + 1}`}
                      </div>
                      <div className="font-medium text-gray-900 mb-2">
                        {i18n.language === 'ar' ? pkgService.service_name_ar : pkgService.service_name}
                      </div>
                      {selectedDate && (
                        <div className="text-sm text-gray-600 mb-1">
                          {i18n.language === 'ar' ? 'التاريخ' : 'Date'}
                        </div>
                      )}
                      {selectedDate && (
                        <div className="font-medium text-gray-900 mb-2">
                          {format(selectedDate, 'EEE, MMM d, yyyy')}
                        </div>
                      )}
                      {selectedSlot && (
                        <div className="text-sm text-gray-600 mb-1">
                          {i18n.language === 'ar' ? 'الوقت' : 'Time'}
                        </div>
                      )}
                      {selectedSlot && (
                        <div className="font-medium text-gray-900">
                          {formatTime12Hour(selectedSlot.start_time)}
                          {selectedSlot.end_time && ` - ${formatTime12Hour(selectedSlot.end_time)}`}
                        </div>
                      )}
                      {(!selectedDate || !selectedSlot) && (
                        <div className="text-sm text-gray-400 italic">
                          {i18n.language === 'ar' ? 'لم يتم الاختيار بعد' : 'Not selected yet'}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Price Section */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="space-y-3">
                    {/* Calculate total price based on actual ticket counts */}
                    {(() => {
                      // Calculate total visitors across all services
                      const totalVisitors = packageServices.reduce((sum, svc) => {
                        const adultCount = adultCounts[svc.service_id] || 1;
                        const childCount = childCounts[svc.service_id] || 0;
                        return sum + adultCount + childCount;
                      }, 0);

                      // Calculate totals for breakdown
                      const totalAdults = packageServices.reduce((sum, svc) => sum + (adultCounts[svc.service_id] || 1), 0);
                      const totalChildren = packageServices.reduce((sum, svc) => sum + (childCounts[svc.service_id] || 0), 0);
                      
                      // Get the first service for base price display (assuming all services in package have same pricing structure)
                      const firstService = packageServices[0]?.service;
                      const basePrice = firstService ? parseFloat(String(firstService.base_price || 0)) : 0;
                      const originalPrice = firstService ? parseFloat(String(firstService.original_price || firstService.base_price || 0)) : 0;
                      const hasServiceDiscount = originalPrice > basePrice;
                      const serviceDiscountPercent = hasServiceDiscount ? Math.round(((originalPrice - basePrice) / originalPrice) * 100) : 0;
                      
                      // Calculate adult and child subtotals
                      const adultSubtotal = packageServices.reduce((sum, svc) => {
                        const service = svc.service;
                        const adultCount = adultCounts[svc.service_id] || 1;
                        const serviceBasePrice = parseFloat(String(service?.base_price || 0));
                        return sum + (serviceBasePrice * adultCount);
                      }, 0);
                      
                      const childSubtotal = packageServices.reduce((sum, svc) => {
                        const service = svc.service;
                        const childCount = childCounts[svc.service_id] || 0;
                        const childPrice = service?.child_price 
                          ? parseFloat(String(service.child_price)) 
                          : parseFloat(String(service?.base_price || 0));
                        return sum + (childPrice * childCount);
                      }, 0);
                      
                      // Calculate total price: sum of (service_price × ticket_count) for each service
                      const totalPrice = adultSubtotal + childSubtotal;
                      
                      // Calculate original total price (if services have discounts)
                      const originalTotalPrice = packageServices.reduce((sum, svc) => {
                        const service = svc.service;
                        const adultCount = adultCounts[svc.service_id] || 1;
                        const childCount = childCounts[svc.service_id] || 0;
                        const originalBasePrice = parseFloat(String(service?.original_price || service?.base_price || 0));
                        const originalChildPrice = service?.child_price 
                          ? parseFloat(String(service.child_price)) 
                          : originalBasePrice;
                        return sum + (originalBasePrice * adultCount) + (originalChildPrice * childCount);
                      }, 0);
                      
                      // Get child price for display (from first service that has child_price, or use base_price)
                      const displayChildPrice = (() => {
                        const serviceWithChildPrice = packageServices.find(svc => svc.service?.child_price);
                        if (serviceWithChildPrice?.service?.child_price) {
                          return parseFloat(String(serviceWithChildPrice.service.child_price));
                        }
                        return basePrice;
                      })();

                      // Find capacity issues with specific details
                      const capacityIssues = packageServices.filter(svc => {
                        const slot = selectedSlots[svc.service_id];
                        const adultCount = adultCounts[svc.service_id] || 1;
                        const childCount = childCounts[svc.service_id] || 0;
                        const serviceVisitors = adultCount + childCount;
                        return slot && slot.available_capacity < serviceVisitors;
                      });
                      
                      // Get the minimum available capacity across all services
                      const minAvailableCapacity = packageServices.reduce((min, svc) => {
                        const slot = selectedSlots[svc.service_id];
                        if (slot && slot.available_capacity !== undefined) {
                          return Math.min(min, slot.available_capacity);
                        }
                        return min;
                      }, Infinity);

                      return (
                        <>
                          {/* Base Price & Original Price Display */}
                          {firstService && (
                            <div className="space-y-2 pb-3 border-b">
                              <div className="flex items-center justify-between">
                                <div className="text-sm text-gray-600">
                                  {i18n.language === 'ar' ? 'السعر الأساسي' : 'Base Price'}
                                </div>
                                <div className="text-sm font-semibold text-gray-900">
                                  {basePrice.toFixed(2)} {t('service.currency') || 'SAR'}
                                </div>
                              </div>
                              {hasServiceDiscount && (
                                <>
                                  <div className="flex items-center justify-between">
                                    <div className="text-sm text-gray-600">
                                      {i18n.language === 'ar' ? 'السعر الأصلي' : 'Original Price'}
                                    </div>
                                    <div className="text-sm text-gray-400 line-through">
                                      {originalPrice.toFixed(2)} {t('service.currency') || 'SAR'}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="text-sm text-gray-600">
                                      {i18n.language === 'ar' ? 'خصم الخدمة' : 'Service Discount'}
                                    </div>
                                    <div className="text-sm font-semibold text-green-600">
                                      -{serviceDiscountPercent}%
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {/* Detailed Price Breakdown */}
                          <div className="space-y-2 pb-3 border-b">
                            {totalAdults > 0 && (
                              <div className="flex items-center justify-between">
                                <div className="text-sm text-gray-600">
                                  {i18n.language === 'ar' ? 'تذاكر الكبار' : 'Adult Tickets'}
                                </div>
                                <div className="text-sm font-semibold text-gray-900">
                                  {totalAdults} × {basePrice.toFixed(2)} = {adultSubtotal.toFixed(2)} {t('service.currency') || 'SAR'}
                                </div>
                              </div>
                            )}
                            {totalChildren > 0 && (
                              <div className="flex items-center justify-between">
                                <div className="text-sm text-gray-600">
                                  {i18n.language === 'ar' ? 'تذاكر الأطفال' : 'Child Tickets'}
                                </div>
                                <div className="text-sm font-semibold text-gray-900">
                                  {totalChildren} × {displayChildPrice.toFixed(2)} = {childSubtotal.toFixed(2)} {t('service.currency') || 'SAR'}
                                </div>
                              </div>
                            )}
                            <div className="flex items-center justify-between pt-2">
                              <div className="text-sm font-medium text-gray-700">
                                {i18n.language === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}
                              </div>
                              <div className="text-sm font-semibold text-gray-900">
                                {totalPrice.toFixed(2)} {t('service.currency') || 'SAR'}
                              </div>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t">
                              <div className="text-base font-bold text-gray-900">
                                {i18n.language === 'ar' ? 'الإجمالي' : 'Total'}
                              </div>
                              <div className="text-lg font-bold" style={{ color: primaryColor }}>
                                {totalPrice.toFixed(2)} {t('service.currency') || 'SAR'}
                              </div>
                            </div>
                          </div>

                          {/* Capacity Warning with Details */}
                          {capacityIssues.length > 0 && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
                              {capacityIssues.map((svc, idx) => {
                                const slot = selectedSlots[svc.service_id];
                                const adultCount = adultCounts[svc.service_id] || 1;
                                const childCount = childCounts[svc.service_id] || 0;
                                const serviceVisitors = adultCount + childCount;
                                return (
                                  <p key={idx} className="text-sm text-red-700">
                                    ⚠️ {i18n.language === 'ar' 
                                      ? `لا توجد أماكن كافية لخدمة "${i18n.language === 'ar' ? svc.service_name_ar : svc.service_name}". المتاح: ${slot?.available_capacity}, المطلوب: ${serviceVisitors}`
                                      : `Not enough capacity for service "${i18n.language === 'ar' ? svc.service_name_ar : svc.service_name}". Available: ${slot?.available_capacity}, Requested: ${serviceVisitors}`}
                                  </p>
                                );
                              })}
                              {capacityIssues.length === 1 && minAvailableCapacity !== Infinity && (
                                <p className="text-sm text-red-700 font-semibold">
                                  {i18n.language === 'ar' 
                                    ? `⚠️ لا توجد أماكن كافية. المتاح: ${minAvailableCapacity}, المطلوب: ${totalVisitors}`
                                    : `⚠️ Not enough capacity available. Available: ${minAvailableCapacity}, Requested: ${totalVisitors}`}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Continue/Proceed Button */}
                {!canProceed() && packageData.discount_percentage && packageData.discount_percentage > 0 && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                    <p className="text-xs text-blue-800">
                      {i18n.language === 'ar' 
                        ? `باقة الخصم ${packageData.discount_percentage}% تفتح بعد إكمال جميع الاختيارات`
                        : `Your ${packageData.discount_percentage}% combo deal unlocks after all selections`}
                    </p>
                  </div>
                )}
                <Button
                  onClick={handleContinue}
                  disabled={(() => {
                    if (!canProceed()) return true;
                    // Check if any service exceeds capacity
                    return packageServices.some(svc => {
                      const slot = selectedSlots[svc.service_id];
                      const adultCount = adultCounts[svc.service_id] || 1;
                      const childCount = childCounts[svc.service_id] || 0;
                      const serviceVisitors = adultCount + childCount;
                      return slot && slot.available_capacity < serviceVisitors;
                    });
                  })()}
                  className="w-full py-3 text-lg font-semibold"
                  style={{ 
                    backgroundColor: (() => {
                      if (!canProceed()) return '#9CA3AF';
                      const hasCapacityIssue = packageServices.some(svc => {
                        const slot = selectedSlots[svc.service_id];
                        const adultCount = adultCounts[svc.service_id] || 1;
                        const childCount = childCounts[svc.service_id] || 0;
                        const serviceVisitors = adultCount + childCount;
                        return slot && slot.available_capacity < serviceVisitors;
                      });
                      return hasCapacityIssue ? '#EF4444' : primaryColor;
                    })(),
                    cursor: canProceed() ? 'pointer' : 'not-allowed',
                    color: 'white',
                  }}
                  onMouseEnter={(e) => {
                    if (canProceed()) {
                      e.currentTarget.style.backgroundColor = secondaryColor;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (canProceed()) {
                      const hasCapacityIssue = packageServices.some(svc => {
                        const slot = selectedSlots[svc.service_id];
                        const adultCount = adultCounts[svc.service_id] || 1;
                        const childCount = childCounts[svc.service_id] || 0;
                        const serviceVisitors = adultCount + childCount;
                        return slot && slot.available_capacity < serviceVisitors;
                      });
                      e.currentTarget.style.backgroundColor = hasCapacityIssue ? '#EF4444' : primaryColor;
                    }
                  }}
                >
                  {(() => {
                    if (!canProceed()) {
                      return i18n.language === 'ar' ? 'اختر جميع الخدمات' : 'Select All Services';
                    }
                    const hasCapacityIssue = packageServices.some(svc => {
                      const slot = selectedSlots[svc.service_id];
                      const adultCount = adultCounts[svc.service_id] || 1;
                      const childCount = childCounts[svc.service_id] || 0;
                      const serviceVisitors = adultCount + childCount;
                      return slot && slot.available_capacity < serviceVisitors;
                    });
                    if (hasCapacityIssue) {
                      return i18n.language === 'ar' ? 'السعة غير كافية' : 'Insufficient Capacity';
                    }
                    return i18n.language === 'ar' ? 'المتابعة إلى الدفع' : 'Proceed to Checkout';
                  })()}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

