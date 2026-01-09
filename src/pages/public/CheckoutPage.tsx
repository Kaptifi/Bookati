import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { Package, User, Calendar, Clock, Users, CreditCard, CheckCircle, X, ArrowLeft, Percent, ChevronDown, Baby } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { AnimatedRating } from '../../components/ui/AnimatedRating';
import { countryCodes, validatePhoneNumberByCountry } from '../../lib/countryCodes';

interface BookingData {
  serviceId: string;
  packageId?: string | null;
  offerId?: string | null;
  slotId: string;
  date: string;
  time: string;
}

interface ServiceOffer {
  id: string;
  service_id: string;
  name: string;
  name_ar?: string;
  price: number;
  original_price?: number;
  discount_percentage?: number;
}

interface Service {
  id: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  base_price: number; // This is the final adult price (discounted if discount exists)
  original_price?: number;
  discount_percentage?: number;
  child_price?: number; // Mandatory, set by service provider
  duration_minutes: number;
  image_url?: string;
  gallery_urls?: string[];
  original_price?: number;
  discount_percentage?: number;
}

interface ServicePackage {
  id: string;
  name: string;
  name_ar: string;
  total_price: number;
  original_price?: number | null;
  discount_percentage?: number | null;
  image_url?: string | null;
  gallery_urls?: string[] | null;
  services?: Array<{
    service_id: string;
    service_name: string;
    service_name_ar: string;
    quantity: number;
  }>;
}

// Helper function to format package name
function formatPackageName(
  pkg: ServicePackage,
  language: string
): string {
  // Format: "Combo (Save X%): Service1 + Service2 + ..."
  const serviceNames = pkg.services
    ? pkg.services.map(svc => language === 'ar' ? svc.service_name_ar : svc.service_name).join(' + ')
    : '';
  
  // Calculate save percentage
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

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
}

export function CheckoutPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const isLoggedIn = userProfile?.role === 'customer';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tenant, setTenant] = useState<any>(null);
  const [service, setService] = useState<Service | null>(null);
  const [servicePackage, setServicePackage] = useState<ServicePackage | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<ServiceOffer | null>(null);
  const [packageServiceDetails, setPackageServiceDetails] = useState<Array<{
    serviceId: string;
    serviceName: string;
    serviceName_ar: string;
    base_price: number;
    child_price?: number;
    adultCount: number;
    childCount: number;
  }>>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slotCapacity, setSlotCapacity] = useState<number | null>(null); // Track current slot capacity
  // Get ticket counts from booking data if provided, otherwise default to 1 adult
  const bookingDataFromState = location.state as any;
  const initialAdultCount = bookingDataFromState?.adultCount || 1;
  const initialChildCount = bookingDataFromState?.childCount || 0;
  
  const [visitorCount, setVisitorCount] = useState(initialAdultCount + initialChildCount);
  const [adultCount, setAdultCount] = useState(initialAdultCount);
  const [childCount, setChildCount] = useState(initialChildCount);
  const [countryCode, setCountryCode] = useState('+966'); // Default to Saudi Arabia (kept for backward compatibility)
  const [customerPhoneFull, setCustomerPhoneFull] = useState(userProfile?.phone || ''); // Full phone number with country code
  const [phoneError, setPhoneError] = useState<string | null>(null);
  
  // OTP verification state for guest bookings
  const [otpStep, setOtpStep] = useState<'phone' | 'otp' | 'verified'>('phone'); // 'phone' | 'otp' | 'verified'
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [phoneUniquenessChecked, setPhoneUniquenessChecked] = useState(false);
  const [phoneUniquenessError, setPhoneUniquenessError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Get customer info from state if provided (from phone entry page)
  const locationState = location.state as any;
  const customerInfoFromState = locationState?.customerInfo;

  // Customer information form
  const [customerInfo, setCustomerInfo] = useState({
    name: customerInfoFromState?.name || userProfile?.full_name || '',
    email: customerInfoFromState?.email || userProfile?.email || '',
    phone: customerInfoFromState?.phone || userProfile?.phone || '',
  });

  // Update customer info if provided from state (from phone entry page)
  useEffect(() => {
    if (customerInfoFromState) {
      const phone = customerInfoFromState.phone || '';
      setCustomerInfo({
        name: customerInfoFromState.name || '',
        email: customerInfoFromState.email || '',
        phone: phone,
      });
      // Set the full phone number for OTP flow
      if (phone) {
        setCustomerPhoneFull(phone);
        // Extract country code from phone
        for (const country of countryCodes) {
          if (phone.startsWith(country.code)) {
            setCountryCode(country.code);
            break;
          }
        }
        // Mark OTP as verified since phone was already verified in phone entry page
        setOtpStep('verified');
      }
    }
  }, [customerInfoFromState]);

  // Phone number validation based on country code (using unified validation function)
  function validatePhoneNumber(phone: string, code: string): { valid: boolean; error?: string } {
    return validatePhoneNumberByCountry(phone, code, i18n.language as 'en' | 'ar');
  }

  // Send OTP function (reusable for initial send and resend)
  const sendOTPToPhone = async () => {
    if (!customerPhoneFull || phoneError) return;
    
    setOtpLoading(true);
    setPhoneUniquenessError(null);
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/auth/guest/verify-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: customerPhoneFull,
          tenant_id: tenant?.id,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP');
      }
      
      setOtpSent(true);
      setOtpStep('otp');
      setPhoneUniquenessChecked(true);
      setResendCooldown(60); // Set cooldown to 60 seconds
      if (data.phoneExists) {
        // Phone was used before, but allow it (informational)
        console.log('Phone number was used before');
      }
    } catch (err: any) {
      setPhoneUniquenessError(err.message || (i18n.language === 'ar' ? 'فشل إرسال رمز التحقق' : 'Failed to send verification code'));
    } finally {
      setOtpLoading(false);
    }
  };

  // Get booking data from navigation state or URL params
  const bookingData: BookingData | null = locationState || (() => {
    const params = new URLSearchParams(location.search);
    if (params.get('serviceId') && params.get('slotId') && params.get('date') && params.get('time')) {
      return {
        serviceId: params.get('serviceId')!,
        packageId: params.get('packageId') || null,
        slotId: params.get('slotId')!,
        date: params.get('date')!,
        time: params.get('time')!,
      };
    }
    return null;
  });

  useEffect(() => {
    if (!bookingData) {
      navigate(`/${tenantSlug}/book`);
      return;
    }

    fetchCheckoutData();
  }, [tenantSlug, bookingData]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  async function fetchCheckoutData() {
    if (!bookingData || !tenantSlug) return;

    try {
      setLoading(true);

      // Fetch tenant
      const { data: tenantData } = await db
        .from('tenants')
        .select('id, name, name_ar, slug, landing_page_settings, is_active')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (!tenantData || !tenantData.is_active) {
        alert('Tenant not found or inactive');
        navigate(`/${tenantSlug}/book`);
        return;
      }

      setTenant(tenantData);

      // Fetch service
      const { data: serviceData } = await db
        .from('services')
        .select('*')
        .eq('id', bookingData.serviceId)
        .eq('tenant_id', tenantData.id)
        .eq('is_active', true)
        .eq('is_public', true)
        .maybeSingle();

      if (!serviceData) {
        alert('Service not found');
        navigate(`/${tenantSlug}/book`);
        return;
      }

      setService({
        id: serviceData.id,
        name: serviceData.name || '',
        name_ar: serviceData.name_ar || '',
        description: serviceData.description || '',
        description_ar: serviceData.description_ar || '',
        base_price: parseFloat(serviceData.base_price?.toString() || '0'),
        // adult_price is not stored - it's auto-calculated from base_price
        child_price: serviceData.child_price !== null && serviceData.child_price !== undefined ? parseFloat(serviceData.child_price.toString()) : undefined,
        original_price: serviceData.original_price ? parseFloat(serviceData.original_price.toString()) : undefined,
        discount_percentage: serviceData.discount_percentage ? parseFloat(serviceData.discount_percentage.toString()) : undefined,
        duration_minutes: serviceData.duration_minutes || serviceData.service_duration_minutes || 0,
        image_url: serviceData.image_url || null,
        gallery_urls: Array.isArray(serviceData.gallery_urls) ? serviceData.gallery_urls : [],
      });

      // Fetch offer if offerId is provided
      if (bookingData.offerId) {
        try {
          const { data: offerData, error: offerError } = await db
            .from('service_offers')
            .select('*')
            .eq('id', bookingData.offerId)
            .eq('service_id', bookingData.serviceId)
            .eq('is_active', true)
            .maybeSingle();

          if (!offerError && offerData) {
            setSelectedOffer({
              id: offerData.id,
              service_id: offerData.service_id,
              name: offerData.name || '',
              name_ar: offerData.name_ar || '',
              price: parseFloat(offerData.price?.toString() || '0'),
              original_price: offerData.original_price ? parseFloat(offerData.original_price.toString()) : undefined,
              discount_percentage: offerData.discount_percentage ? parseFloat(offerData.discount_percentage.toString()) : undefined,
            });
            console.log('Offer loaded:', offerData);
          } else if (offerError) {
            console.warn('Could not fetch offer:', offerError);
          }
        } catch (offerErr: any) {
          console.warn('Error fetching offer:', offerErr);
        }
      }

      // Fetch package if applicable
      if (bookingData.packageId) {
        const { data: packageData } = await db
          .from('service_packages')
          .select('*')
          .eq('id', bookingData.packageId)
          .eq('tenant_id', tenantData.id)
          .maybeSingle();

        if (packageData) {
          // Get package services with ticket counts from booking data if available
          const bookingPackageServices = bookingDataFromState?.packageServices || [];
          
          console.log('=== PACKAGE PRICING DEBUG ===');
          console.log('bookingDataFromState:', bookingDataFromState);
          console.log('bookingPackageServices:', bookingPackageServices);
          console.log('adultCount from state:', bookingDataFromState?.adultCount);
          console.log('childCount from state:', bookingDataFromState?.childCount);
          
          // Fetch package services to format name correctly and get prices
          const { data: packageServices, error: packageServicesError } = await db
            .from('package_services')
            .select('service_id, quantity, services (id, name, name_ar, base_price, child_price)')
            .eq('package_id', bookingData.packageId);

          if (packageServicesError) {
            console.error('Error fetching package services:', packageServicesError);
          }

          console.log('Package services fetched from DB:', packageServices);
          console.log('Number of services:', packageServices?.length || 0);

          // Handle both array and single object responses
          const servicesArray = Array.isArray(packageServices) ? packageServices : (packageServices ? [packageServices] : []);
          
          const services = servicesArray.map((ps: any) => {
            // Handle nested services object - it might be in different formats
            const serviceData = ps.services || (typeof ps === 'object' && 'services' in ps ? ps.services : {});
            return {
              service_id: ps.service_id,
              service_name: serviceData?.name || serviceData?.services_rel_name || '',
              service_name_ar: serviceData?.name_ar || serviceData?.services_rel_name_ar || '',
              quantity: ps.quantity || 1,
            };
          }).filter(s => s.service_id); // Filter out any invalid entries

          console.log('Processed services:', services);
          console.log('Number of processed services:', services.length);

          // Build package service details with prices and ticket counts
          // Match booking services with package services by serviceId
          const serviceDetails = servicesArray.map((ps: any) => {
            const serviceData = ps.services || {};
            
            // Find matching booking service - try multiple matching strategies
            const bookingService = bookingPackageServices.find((bs: any) => {
              const bsServiceId = bs.serviceId || bs.service_id;
              return bsServiceId === ps.service_id;
            });
            
            // Use ticket counts from bookingService if found, otherwise use defaults
            const adultCount = bookingService?.adultCount !== undefined && bookingService?.adultCount !== null
              ? bookingService.adultCount
              : 1;
            const childCount = bookingService?.childCount !== undefined && bookingService?.childCount !== null
              ? bookingService.childCount
              : 0;
            
            console.log(`Matching service ${ps.service_id}:`, {
              found: !!bookingService,
              adultCount,
              childCount,
              bookingService
            });
            
            return {
              serviceId: ps.service_id,
              serviceName: serviceData?.name || '',
              serviceName_ar: serviceData?.name_ar || '',
              base_price: parseFloat(serviceData?.base_price?.toString() || '0'),
              child_price: serviceData?.child_price !== null && serviceData?.child_price !== undefined 
                ? parseFloat(serviceData.child_price.toString()) 
                : undefined,
              adultCount: adultCount,
              childCount: childCount,
            };
          });
          
          // If no matches found but we have total counts, apply to all services
          const hasMatches = serviceDetails.some(s => {
            const bookingService = bookingPackageServices.find((bs: any) => {
              const bsServiceId = bs.serviceId || bs.service_id;
              return bsServiceId === s.serviceId;
            });
            return !!bookingService;
          });
          
          if (!hasMatches && bookingDataFromState) {
            const totalAdultsFromState = bookingDataFromState.adultCount || 0;
            const totalChildrenFromState = bookingDataFromState.childCount || 0;
            
            if (totalAdultsFromState > 0 || totalChildrenFromState > 0) {
              // If single service, apply all counts to it
              if (serviceDetails.length === 1) {
                serviceDetails[0].adultCount = totalAdultsFromState || 1;
                serviceDetails[0].childCount = totalChildrenFromState || 0;
              } else {
                // If multiple services, distribute evenly
                const adultsPerService = Math.floor(totalAdultsFromState / serviceDetails.length) || 1;
                const childrenPerService = Math.floor(totalChildrenFromState / serviceDetails.length) || 0;
                const adultsRemainder = totalAdultsFromState % serviceDetails.length;
                
                serviceDetails.forEach((svc, index) => {
                  svc.adultCount = adultsPerService + (index === 0 ? adultsRemainder : 0);
                  svc.childCount = childrenPerService;
                });
              }
            }
          }
          
          console.log('Service details after processing:', serviceDetails.map(s => {
            const childPrice = s.child_price !== undefined ? s.child_price : s.base_price;
            const serviceTotal = (s.base_price * s.adultCount) + (childPrice * s.childCount);
            return {
              name: s.serviceName,
              adultCount: s.adultCount,
              childCount: s.childCount,
              base_price: s.base_price,
              child_price: s.child_price,
              serviceTotal: serviceTotal
            };
          }));

          const calculatedTotal = serviceDetails.reduce((sum, s) => {
            const childPrice = s.child_price !== undefined ? s.child_price : s.base_price;
            return sum + (s.base_price * s.adultCount) + (childPrice * s.childCount);
          }, 0);
          
          console.log('Calculated total from serviceDetails:', calculatedTotal);
          console.log('Total adults:', serviceDetails.reduce((sum, s) => sum + s.adultCount, 0));
          console.log('Total children:', serviceDetails.reduce((sum, s) => sum + s.childCount, 0));
          console.log('=== END PACKAGE PRICING DEBUG ===');
          setPackageServiceDetails(serviceDetails);

          // Parse gallery_urls if it's a string
          let galleryUrls: string[] = [];
          if (packageData.gallery_urls) {
            if (Array.isArray(packageData.gallery_urls)) {
              galleryUrls = packageData.gallery_urls.filter((img: any) => img && typeof img === 'string');
            } else if (typeof packageData.gallery_urls === 'string') {
              try {
                const parsed = JSON.parse(packageData.gallery_urls);
                if (Array.isArray(parsed)) {
                  galleryUrls = parsed.filter((img: any) => img && typeof img === 'string');
                }
              } catch {
                galleryUrls = [];
              }
            }
          }

          setServicePackage({
            id: packageData.id,
            name: packageData.name || '',
            name_ar: packageData.name_ar || '',
            total_price: parseFloat(packageData.total_price?.toString() || '0'),
            original_price: packageData.original_price ? parseFloat(packageData.original_price.toString()) : null,
            discount_percentage: packageData.discount_percentage || null,
            image_url: packageData.image_url || null,
            gallery_urls: galleryUrls.length > 0 ? galleryUrls : null,
            services: services,
          });
        }
      }

      // Fetch slot details including capacity
      const { data: slotData } = await db
        .from('slots')
        .select('id, slot_date, start_time, end_time, available_capacity')
        .eq('id', bookingData.slotId)
        .maybeSingle();

      if (slotData) {
        setSlot({
          id: slotData.id,
          slot_date: slotData.slot_date,
          start_time: slotData.start_time,
          end_time: slotData.end_time,
        });
        setSlotCapacity(slotData.available_capacity || 0);
      }

      // Get visitor count from URL params if available
      const params = new URLSearchParams(location.search);
      const paxParam = params.get('pax.general') || params.get('pax');
      if (paxParam) {
        const count = parseInt(paxParam, 10);
        if (!isNaN(count) && count > 0) {
          setVisitorCount(count);
        }
      }
    } catch (error) {
      console.error('Error fetching checkout data:', error);
      alert('Failed to load checkout page');
      navigate(`/${tenantSlug}/book`);
    } finally {
      setLoading(false);
    }
  }

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

  // Calculate prices with adult/child pricing
  // If offer is selected, use offer price; otherwise use base_price
  const adultPrice = selectedOffer ? selectedOffer.price : (service?.base_price || 0);
  // Child price is mandatory and set by service provider (not affected by offers)
  const childPrice = service?.child_price || adultPrice; // Fallback to adult price if child_price not set
  const basePrice = servicePackage ? servicePackage.total_price : adultPrice;
  const originalPrice = selectedOffer 
    ? (selectedOffer.original_price || selectedOffer.price)
    : (service?.original_price || basePrice);
  const serviceDiscount = selectedOffer?.discount_percentage || service?.discount_percentage || 0;
  
  // For packages, calculate total based on individual service prices * ticket counts
  // For services, total is (adultPrice * adultCount) + (childPrice * childCount)
  let subtotal: number;
  let total: number;
  
  if (servicePackage && packageServiceDetails.length > 0) {
    // Package booking: sum up all services with their ticket counts
    subtotal = packageServiceDetails.reduce((sum, svc) => {
      // For packages, use service base_price (offers don't apply to packages)
      const adultPriceForService = svc.base_price || 0;
      const childPriceForService = svc.child_price !== undefined ? svc.child_price : adultPriceForService;
      // Ensure we have valid ticket counts (default to 1 adult if undefined)
      const svcAdultCount = svc.adultCount !== undefined && svc.adultCount !== null ? svc.adultCount : 1;
      const svcChildCount = svc.childCount !== undefined && svc.childCount !== null ? svc.childCount : 0;
      const serviceTotal = (adultPriceForService * svcAdultCount) + (childPriceForService * svcChildCount);
      console.log(`Service ${svc.serviceName}: ${svcAdultCount} adults × ${adultPriceForService} + ${svcChildCount} children × ${childPriceForService} = ${serviceTotal}`);
      return sum + serviceTotal;
    }, 0);
    total = subtotal;
  } else if (servicePackage && packageServiceDetails.length === 0) {
    // Package but service details not loaded yet - use total counts as fallback
    // This handles the case where the user selected tickets but packageServiceDetails is empty
    const totalAdults = bookingDataFromState?.adultCount || adultCount || 1;
    const totalChildren = bookingDataFromState?.childCount || childCount || 0;
    // For packages, we need to estimate based on individual service prices
    // If we can't get service prices, use package price as fallback
    const pricePerTicket = servicePackage.total_price || 0;
    subtotal = pricePerTicket * (totalAdults + totalChildren);
    total = subtotal;
    console.log('Package pricing fallback (service details not loaded):', {
      totalAdults,
      totalChildren,
      pricePerTicket,
      subtotal
    });
  } else {
    // Regular service booking - use offer price if selected, otherwise base_price
    subtotal = (adultPrice * adultCount) + (childPrice * childCount);
    total = subtotal;
  }
  
  console.log('Final pricing calculation:', {
    servicePackage: !!servicePackage,
    packageServiceDetailsCount: packageServiceDetails.length,
    subtotal,
    total,
    adultCount,
    childCount,
    bookingDataFromState: {
      adultCount: bookingDataFromState?.adultCount,
      childCount: bookingDataFromState?.childCount,
      packageServices: bookingDataFromState?.packageServices?.length || 0
    },
    packageServiceDetails: packageServiceDetails.map(s => ({
      name: s.serviceName,
      adultCount: s.adultCount,
      childCount: s.childCount,
      base_price: s.base_price
    }))
  });
  
  // Update visitor count based on actual ticket counts
  useEffect(() => {
    if (servicePackage && packageServiceDetails.length > 0) {
      // For packages, sum up all ticket counts from packageServiceDetails
      const totalVisitors = packageServiceDetails.reduce((sum, svc) => {
        const svcAdultCount = svc.adultCount !== undefined && svc.adultCount !== null ? svc.adultCount : 1;
        const svcChildCount = svc.childCount !== undefined && svc.childCount !== null ? svc.childCount : 0;
        return sum + svcAdultCount + svcChildCount;
      }, 0);
      setVisitorCount(totalVisitors);
      // Also update adultCount and childCount totals for display
      const totalAdults = packageServiceDetails.reduce((sum, svc) => sum + (svc.adultCount || 1), 0);
      const totalChildren = packageServiceDetails.reduce((sum, svc) => sum + (svc.childCount || 0), 0);
      setAdultCount(totalAdults);
      setChildCount(totalChildren);
    } else {
      // For regular services, use adultCount + childCount
      setVisitorCount(adultCount + childCount);
    }
  }, [packageServiceDetails, adultCount, childCount, servicePackage]);

  // Handle booking submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!service || !slot || !customerInfo.name || !customerInfo.phone) {
      alert(i18n.language === 'ar' ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill in all required fields');
      return;
    }

    // For guest bookings, require OTP verification
    if (!isLoggedIn && otpStep !== 'verified') {
      alert(i18n.language === 'ar' ? 'يرجى التحقق من رقم الهاتف أولاً' : 'Please verify your phone number first');
      return;
    }

    // Validate phone number before submission
    const phoneValidation = validatePhoneNumber(customerInfo.phone, countryCode);
    if (!phoneValidation.valid) {
      setPhoneError(phoneValidation.error || null);
      alert(phoneValidation.error || (i18n.language === 'ar' ? 'رقم الهاتف غير صحيح' : 'Invalid phone number'));
      return;
    }

    // Ensure at least one adult ticket
    if (adultCount === 0 && childCount === 0) {
      alert(i18n.language === 'ar' ? 'يرجى اختيار تذكرة واحدة على الأقل' : 'Please select at least one ticket');
      return;
    }

    setSubmitting(true);

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const token = localStorage.getItem('auth_token');

      // Calculate actual visitor count
      const actualVisitorCount = servicePackage && packageServiceDetails.length > 0
        ? packageServiceDetails.reduce((sum, svc) => {
            const svcAdultCount = svc.adultCount !== undefined && svc.adultCount !== null ? svc.adultCount : 1;
            const svcChildCount = svc.childCount !== undefined && svc.childCount !== null ? svc.childCount : 0;
            return sum + svcAdultCount + svcChildCount;
          }, 0)
        : (adultCount + childCount);

      // Acquire booking lock first
      const lockResponse = await fetch(`${API_URL}/bookings/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          slot_id: slot.id,
          reserved_capacity: actualVisitorCount,
        }),
      });

      if (!lockResponse.ok) {
        const errorData = await lockResponse.json();
        throw new Error(errorData.error || 'Failed to reserve slot');
      }

      const lockData = await lockResponse.json();

      // Create booking
      const bookingResponse = await fetch(`${API_URL}/bookings/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          tenant_id: tenant.id,
          service_id: service.id,
          slot_id: slot.id,
          customer_name: customerInfo.name,
          customer_email: customerInfo.email || null,
          customer_phone: customerPhoneFull || `${countryCode}${customerInfo.phone}`, // Use full phone number
          visitor_count: actualVisitorCount,
          adult_count: servicePackage && packageServiceDetails.length > 0
            ? packageServiceDetails.reduce((sum, svc) => sum + (svc.adultCount || 1), 0)
            : adultCount,
          child_count: servicePackage && packageServiceDetails.length > 0
            ? packageServiceDetails.reduce((sum, svc) => sum + (svc.childCount || 0), 0)
            : childCount,
          total_price: total,
          notes: null,
          lock_id: lockData.lock_id,
          session_id: lockData.session_id,
          package_id: servicePackage?.id || null, // Include package_id if booking is for a package
          offer_id: selectedOffer?.id || null, // Include offer_id if offer is selected
          language: i18n.language // Customer's selected language
        }),
      });

      if (!bookingResponse.ok) {
        const errorData = await bookingResponse.json();
        throw new Error(errorData.error || 'Failed to create booking');
      }

      const bookingResult = await bookingResponse.json();

      // Navigate to success page
      navigate(`/${tenantSlug}/book/success`, {
        state: {
          bookingId: bookingResult.booking.id,
          booking: bookingResult.booking,
        },
      });
    } catch (error: any) {
      console.error('Error creating booking:', error);
      alert(error.message || 'Failed to complete booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: primaryColor }}></div>
          <p className="text-gray-600">Loading checkout...</p>
        </div>
      </div>
    );
  }

  if (!service || !slot || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Booking information not found</h1>
          <p className="text-gray-600 mt-2">Please select a service and time slot again.</p>
          <Button
            onClick={() => navigate(`/${tenantSlug}/book`)}
            className="mt-4"
            style={{ backgroundColor: primaryColor }}
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
                  {i18n.language === 'ar' ? tenant.name_ar : tenant.name}
                </h1>
                <span className="text-sm text-gray-500 font-medium">
                  {i18n.language === 'ar' ? 'إتمام الحجز' : 'Complete Your Booking'}
                </span>
              </div>
            </div>

            {/* Actions Section */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/${tenantSlug}/book/${service.id}`)}
                className="transition-all duration-300 hover:scale-105"
                style={{ 
                  color: primaryColor,
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {i18n.language === 'ar' ? 'رجوع' : 'Back'}
              </Button>
              <div className="h-6 w-px bg-gray-300"></div>
              <LanguageToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - Customer Information & Booking Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Booking Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" style={{ color: primaryColor }} />
                  {i18n.language === 'ar' ? 'ملخص الحجز' : 'Booking Summary'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Service/Package Name */}
                <div className="flex items-start gap-4">
                  {(servicePackage?.image_url || servicePackage?.gallery_urls?.[0] || service.image_url) && (
                    <img
                      src={
                        servicePackage?.image_url || 
                        servicePackage?.gallery_urls?.[0] || 
                        service.image_url
                      }
                      alt={
                        servicePackage 
                          ? (i18n.language === 'ar' ? servicePackage.name_ar : servicePackage.name)
                          : (i18n.language === 'ar' ? service.name_ar : service.name)
                      }
                      className="w-20 h-20 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {servicePackage 
                        ? formatPackageName(servicePackage, i18n.language)
                        : selectedOffer
                        ? (i18n.language === 'ar' ? selectedOffer.name_ar || selectedOffer.name : selectedOffer.name)
                        : (i18n.language === 'ar' ? service.name_ar : service.name)
                      }
                    </h3>
                    {servicePackage && (
                      <p className="text-sm text-gray-500 mt-1">
                        {i18n.language === 'ar' ? servicePackage.name_ar : servicePackage.name}
                      </p>
                    )}
                    {!servicePackage && selectedOffer && (
                      <p className="text-sm text-gray-500 mt-1">
                        {i18n.language === 'ar' ? service.name_ar : service.name}
                      </p>
                    )}
                  </div>
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-500">{i18n.language === 'ar' ? 'التاريخ' : 'Date'}</p>
                      <p className="text-sm font-medium text-gray-900">
                        {format(new Date(bookingData.date), 'EEEE, MMMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-500">{i18n.language === 'ar' ? 'الوقت' : 'Time'}</p>
                      <p className="text-sm font-medium text-gray-900">
                        {slot.start_time} - {slot.end_time}
                      </p>
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* Customer Information Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" style={{ color: primaryColor }} />
                  {i18n.language === 'ar' ? 'معلومات العميل' : 'Customer Information'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    label={i18n.language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                    value={customerInfo.name}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                    required
                    placeholder={i18n.language === 'ar' ? 'أدخل اسمك الكامل' : 'Enter your full name'}
                  />

                  {/* Phone Number with OTP Verification for Guests */}
                  {!isLoggedIn && otpStep === 'phone' && (
                    <>
                      <PhoneInput
                        label={i18n.language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                        value={customerPhoneFull}
                        onChange={(value) => {
                          setCustomerPhoneFull(value);
                          // Extract country code and phone number for backward compatibility
                          let phoneNumber = value;
                          let code = '+966';
                          for (const country of countryCodes) {
                            if (value.startsWith(country.code)) {
                              code = country.code;
                              phoneNumber = value.replace(country.code, '');
                              break;
                            }
                          }
                          setCountryCode(code);
                          setCustomerInfo({ ...customerInfo, phone: phoneNumber });
                          // Validate phone number
                          if (phoneNumber.length > 0) {
                            const validation = validatePhoneNumber(phoneNumber, code);
                            setPhoneError(validation.valid ? null : validation.error || null);
                          } else {
                            setPhoneError(null);
                          }
                          // Reset OTP state when phone changes
                          setOtpSent(false);
                          setOtpStep('phone');
                        }}
                        defaultCountry="+966"
                        required
                        error={phoneError || phoneUniquenessError || undefined}
                        disabled={otpLoading}
                      />
                      
                      {/* Send OTP Button */}
                      <Button
                        type="button"
                        onClick={sendOTPToPhone}
                        disabled={!customerPhoneFull || !!phoneError || otpLoading || !customerInfo.name}
                        fullWidth
                        style={{ backgroundColor: primaryColor }}
                      >
                        {otpLoading 
                          ? (i18n.language === 'ar' ? 'جاري الإرسال...' : 'Sending...')
                          : (i18n.language === 'ar' ? 'إرسال رمز التحقق' : 'Send Verification Code')
                        }
                      </Button>
                    </>
                  )}

                  {/* OTP Input Step */}
                  {!isLoggedIn && otpStep === 'otp' && (
                    <>
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800 mb-2">
                          {i18n.language === 'ar' 
                            ? `تم إرسال رمز التحقق إلى ${customerPhoneFull}. يرجى إدخال الرمز أدناه.`
                            : `Verification code sent to ${customerPhoneFull}. Please enter the code below.`
                          }
                        </p>
                      </div>
                      
                      <Input
                        type="text"
                        label={i18n.language === 'ar' ? 'رمز التحقق' : 'Verification Code'}
                        value={otpCode}
                        onChange={(e) => {
                          const code = e.target.value.replace(/[^\d]/g, '').slice(0, 6);
                          setOtpCode(code);
                        }}
                        placeholder={i18n.language === 'ar' ? 'أدخل الرمز المكون من 6 أرقام' : 'Enter 6-digit code'}
                        required
                        maxLength={6}
                        className="text-center text-2xl tracking-widest"
                      />
                      
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setOtpStep('phone');
                            setOtpCode('');
                            setOtpSent(false);
                          }}
                          fullWidth
                        >
                          {i18n.language === 'ar' ? 'تغيير الرقم' : 'Change Number'}
                        </Button>
                        <Button
                          type="button"
                          onClick={async () => {
                            if (otpCode.length !== 6) {
                              setPhoneUniquenessError(i18n.language === 'ar' ? 'الرمز يجب أن يكون 6 أرقام' : 'Code must be 6 digits');
                              return;
                            }
                            
                            setOtpLoading(true);
                            setPhoneUniquenessError(null);
                            
                            try {
                              const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
                              const response = await fetch(`${API_URL}/auth/guest/verify-otp`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  phone: customerPhoneFull,
                                  otp: otpCode,
                                }),
                              });
                              
                              const data = await response.json();
                              
                              if (!response.ok) {
                                throw new Error(data.error || 'Invalid verification code');
                              }
                              
                              setOtpStep('verified');
                              setPhoneUniquenessChecked(true);
                            } catch (err: any) {
                              setPhoneUniquenessError(err.message || (i18n.language === 'ar' ? 'رمز التحقق غير صحيح' : 'Invalid verification code'));
                            } finally {
                              setOtpLoading(false);
                            }
                          }}
                          disabled={otpCode.length !== 6 || otpLoading}
                          fullWidth
                          style={{ backgroundColor: primaryColor }}
                        >
                          {otpLoading 
                            ? (i18n.language === 'ar' ? 'جاري التحقق...' : 'Verifying...')
                            : (i18n.language === 'ar' ? 'التحقق' : 'Verify')
                          }
                        </Button>
                      </div>

                      <div className="text-center mt-4">
                        <button
                          type="button"
                          onClick={sendOTPToPhone}
                          disabled={resendCooldown > 0 || otpLoading}
                          className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed underline"
                        >
                          {otpLoading 
                            ? (i18n.language === 'ar' ? 'جارٍ الإرسال...' : 'Sending...')
                            : resendCooldown > 0
                            ? (i18n.language === 'ar' 
                                ? `إعادة الإرسال (${resendCooldown}ث)`
                                : `Resend code (${resendCooldown}s)`)
                            : (i18n.language === 'ar' ? 'إعادة إرسال رمز التحقق' : 'Resend verification code')
                          }
                        </button>
                      </div>
                    </>
                  )}

                  {/* Phone Verified (for guests) or Regular Input (for logged-in users) */}
                  {((isLoggedIn) || (otpStep === 'verified')) && (
                    <PhoneInput
                      label={i18n.language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                      value={customerPhoneFull}
                      onChange={(value) => {
                        setCustomerPhoneFull(value);
                        let phoneNumber = value;
                        let code = '+966';
                        for (const country of countryCodes) {
                          if (value.startsWith(country.code)) {
                            code = country.code;
                            phoneNumber = value.replace(country.code, '');
                            break;
                          }
                        }
                        setCountryCode(code);
                        setCustomerInfo({ ...customerInfo, phone: phoneNumber });
                        if (phoneNumber.length > 0) {
                          const validation = validatePhoneNumber(phoneNumber, code);
                          setPhoneError(validation.valid ? null : validation.error || null);
                        } else {
                          setPhoneError(null);
                        }
                      }}
                      defaultCountry="+966"
                      required
                      error={phoneError || undefined}
                      disabled={!isLoggedIn && otpStep === 'verified'} // Disable if verified (guest)
                    />
                  )}

                  {/* Verified Badge for Guests */}
                  {!isLoggedIn && otpStep === 'verified' && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="text-sm text-green-800">
                        {i18n.language === 'ar' ? 'تم التحقق من رقم الهاتف بنجاح' : 'Phone number verified successfully'}
                      </span>
                    </div>
                  )}

                  <Input
                    type="email"
                    label={i18n.language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                    value={customerInfo.email}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                    placeholder={i18n.language === 'ar' ? 'your@email.com' : 'your@email.com'}
                  />
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Order Summary & Pricing */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" style={{ color: primaryColor }} />
                  {i18n.language === 'ar' ? 'ملخص الطلب' : 'Order Summary'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Package Services List */}
                {servicePackage && servicePackage.services && servicePackage.services.length > 0 && (
                  <div className="mb-4 pb-4 border-b">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      {i18n.language === 'ar' ? 'الخدمات المتضمنة' : 'Included Services'}
                    </h4>
                    <div className="space-y-2">
                      {servicePackage.services.map((svc, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {i18n.language === 'ar' ? svc.service_name_ar : svc.service_name}
                            {svc.quantity > 1 && ` (×${svc.quantity})`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price Breakdown */}
                <div className="space-y-3">
                  {servicePackage && packageServiceDetails.length > 0 ? (
                    <>
                      {/* Package Pricing - Show breakdown per service */}
                      {packageServiceDetails.map((svc, idx) => {
                        const adultPriceForService = svc.base_price || 0;
                        const childPriceForService = svc.child_price !== undefined ? svc.child_price : adultPriceForService;
                        // Ensure we use valid ticket counts
                        const svcAdultCount = svc.adultCount !== undefined && svc.adultCount !== null ? svc.adultCount : 1;
                        const svcChildCount = svc.childCount !== undefined && svc.childCount !== null ? svc.childCount : 0;
                        const serviceTotal = (adultPriceForService * svcAdultCount) + (childPriceForService * svcChildCount);
                        
                        return (
                          <div key={idx} className="pb-3 border-b last:border-b-0 last:pb-0">
                            <div className="text-sm font-medium text-gray-700 mb-2">
                              {i18n.language === 'ar' ? svc.serviceName_ar : svc.serviceName}
                            </div>
                            {svcAdultCount > 0 && (
                              <div className="flex justify-between text-xs text-gray-600 mb-1">
                                <span>
                                  {i18n.language === 'ar' ? 'كبار' : 'Adults'} × {svcAdultCount}
                                </span>
                                <span>
                                  {adultPriceForService.toFixed(2)} × {svcAdultCount} = {(adultPriceForService * svcAdultCount).toFixed(2)} {t('service.currency') || 'SAR'}
                                </span>
                              </div>
                            )}
                            {svcChildCount > 0 && (
                              <div className="flex justify-between text-xs text-gray-600 mb-1">
                                <span>
                                  {i18n.language === 'ar' ? 'أطفال' : 'Children'} × {svcChildCount}
                                </span>
                                <span>
                                  {childPriceForService.toFixed(2)} × {svcChildCount} = {(childPriceForService * svcChildCount).toFixed(2)} {t('service.currency') || 'SAR'}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm font-medium text-gray-900 mt-2">
                              <span>{i18n.language === 'ar' ? 'المجموع' : 'Subtotal'}</span>
                              <span>{serviceTotal.toFixed(2)} {t('service.currency') || 'SAR'}</span>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex justify-between items-center pt-3 border-t-2 border-gray-300 mt-3">
                        <span className="text-lg font-semibold text-gray-900">
                          {i18n.language === 'ar' ? 'السعر الإجمالي' : 'Total Price'}
                        </span>
                        <span className="text-xl font-bold" style={{ color: primaryColor }}>
                          {total.toFixed(2)} {t('service.currency') || 'SAR'}
                        </span>
                      </div>
                    </>
                  ) : servicePackage ? (
                    <>
                      {/* Fallback to package price if service details not loaded */}
                      {servicePackage.original_price && servicePackage.original_price > servicePackage.total_price && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600 line-through">
                            {i18n.language === 'ar' ? 'السعر الأصلي' : 'Original Price'}
                          </span>
                          <span className="text-gray-500 line-through">
                            {servicePackage.original_price.toFixed(2)} {t('service.currency') || 'SAR'}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-gray-900">
                          {i18n.language === 'ar' ? 'السعر الإجمالي' : 'Total Price'}
                        </span>
                        <span className="text-xl font-bold" style={{ color: primaryColor }}>
                          {total.toFixed(2)} {t('service.currency') || 'SAR'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Selected Offer Display */}
                      {selectedOffer && (
                        <div className="mb-4 pb-3 border-b">
                          <div className="text-sm font-semibold text-gray-700 mb-2">
                            {i18n.language === 'ar' ? 'العرض المحدد' : 'Selected Offer'}
                          </div>
                          <div className="text-sm text-gray-900">
                            {i18n.language === 'ar' ? selectedOffer.name_ar || selectedOffer.name : selectedOffer.name}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm text-gray-600">
                              {i18n.language === 'ar' ? 'سعر العرض' : 'Offer Price'}
                            </span>
                            <div className="text-right">
                              {selectedOffer.original_price && selectedOffer.original_price > selectedOffer.price && (
                                <div className="text-xs text-gray-400 line-through mb-1">
                                  {selectedOffer.original_price.toFixed(2)} {t('service.currency') || 'SAR'}
                                </div>
                              )}
                              <span className="text-sm font-semibold text-gray-900">
                                {selectedOffer.price.toFixed(2)} {t('service.currency') || 'SAR'}
                              </span>
                              {selectedOffer.discount_percentage && selectedOffer.discount_percentage > 0 && (
                                <div className="text-xs text-green-600 mt-1">
                                  -{selectedOffer.discount_percentage}%
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Base Price Display (only if no offer) */}
                      {!selectedOffer && (
                        <div className="mb-4 pb-3 border-b">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-600">
                              {i18n.language === 'ar' ? 'السعر الأساسي' : 'Base Price'}
                            </span>
                            <span className="text-gray-900">
                              {basePrice.toFixed(2)} {t('service.currency') || 'SAR'}
                            </span>
                          </div>
                          {service?.original_price && service.original_price > service.base_price && (
                            <>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600 line-through">
                                  {i18n.language === 'ar' ? 'السعر الأصلي' : 'Original Price'}
                                </span>
                                <span className="text-gray-500 line-through">
                                  {originalPrice.toFixed(2)} {t('service.currency') || 'SAR'}
                                </span>
                              </div>
                              {serviceDiscount > 0 && (
                                <div className="flex justify-between text-sm text-green-600">
                                  <span className="flex items-center gap-1">
                                    <Percent className="w-3 h-3" />
                                    {i18n.language === 'ar' ? 'خصم الخدمة' : 'Service Discount'}
                                  </span>
                                  <span>-{serviceDiscount}%</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Base Price & Original Price Display (for services with discounts, no offer) */}
                      {!selectedOffer && service && service.original_price && service.original_price > service.base_price && (
                        <div className="mb-4 pb-3 border-b space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">{i18n.language === 'ar' ? 'السعر الأساسي' : 'Base Price'}</span>
                            <span className="text-gray-900">{service.base_price.toFixed(2)} {t('service.currency') || 'SAR'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">{i18n.language === 'ar' ? 'السعر الأصلي' : 'Original Price'}</span>
                            <span className="text-gray-400 line-through">{service.original_price.toFixed(2)} {t('service.currency') || 'SAR'}</span>
                          </div>
                          {service.discount_percentage && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">{i18n.language === 'ar' ? 'خصم الخدمة' : 'Service Discount'}</span>
                              <span className="text-green-600 font-semibold">-{service.discount_percentage}%</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Adult/Child Breakdown */}
                      {service?.child_price !== undefined && (
                        <>
                          {adultCount > 0 && (
                            <div className="flex justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <Users className="w-3 h-3 text-gray-600" />
                                <span className="text-gray-600">
                                  {i18n.language === 'ar' ? 'تذاكر الكبار' : 'Adult Tickets'}
                                </span>
                              </div>
                              <span className="text-gray-900">
                                {adultCount} × {adultPrice.toFixed(2)} = {(adultCount * adultPrice).toFixed(2)} {t('service.currency') || 'SAR'}
                              </span>
                            </div>
                          )}
                          {childCount > 0 && (
                            <div className="flex justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <Baby className="w-3 h-3 text-gray-600" />
                                <span className="text-gray-600">
                                  {i18n.language === 'ar' ? 'تذاكر الأطفال' : 'Child Tickets'}
                                </span>
                              </div>
                              <span className="text-gray-900">
                                {childCount} × {childPrice.toFixed(2)} = {(childCount * childPrice).toFixed(2)} {t('service.currency') || 'SAR'}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      
                      {service?.child_price === undefined && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {i18n.language === 'ar' ? 'الكمية' : 'Quantity'}
                          </span>
                          <span className="text-gray-900">× {visitorCount}</span>
                        </div>
                      )}

                      <div className="pt-3 border-t">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-600">
                            {i18n.language === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}
                          </span>
                          <span className="text-gray-900 font-medium">
                            {subtotal.toFixed(2)} {t('service.currency') || 'SAR'}
                          </span>
                        </div>

                        <div className="pt-3 border-t">
                          <div className="flex justify-between items-center">
                            <span className="text-lg font-semibold text-gray-900">
                              {i18n.language === 'ar' ? 'الإجمالي' : 'Total'}
                            </span>
                            <span 
                              className="text-2xl font-bold"
                              style={{ color: primaryColor }}
                            >
                              {total.toFixed(2)} {t('service.currency') || 'SAR'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Capacity Warning */}
                {(() => {
                  const actualVisitorCount = servicePackage && packageServiceDetails.length > 0
                    ? packageServiceDetails.reduce((sum, svc) => {
                        const svcAdultCount = svc.adultCount !== undefined && svc.adultCount !== null ? svc.adultCount : 1;
                        const svcChildCount = svc.childCount !== undefined && svc.childCount !== null ? svc.childCount : 0;
                        return sum + svcAdultCount + svcChildCount;
                      }, 0)
                    : visitorCount;
                  
                  return slotCapacity !== null && slotCapacity < actualVisitorCount ? (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">
                        {i18n.language === 'ar' 
                          ? `⚠️ لا توجد أماكن كافية. المتاح: ${slotCapacity}، المطلوب: ${actualVisitorCount}`
                          : `⚠️ Not enough capacity available. Available: ${slotCapacity}, Requested: ${actualVisitorCount}`
                        }
                      </p>
                    </div>
                  ) : null;
                })()}

                {/* CTA Button */}
                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  onClick={handleSubmit}
                  disabled={(() => {
                    const actualVisitorCount = servicePackage && packageServiceDetails.length > 0
                      ? packageServiceDetails.reduce((sum, svc) => {
                          const svcAdultCount = svc.adultCount !== undefined && svc.adultCount !== null ? svc.adultCount : 1;
                          const svcChildCount = svc.childCount !== undefined && svc.childCount !== null ? svc.childCount : 0;
                          return sum + svcAdultCount + svcChildCount;
                        }, 0)
                      : visitorCount;
                    
                    return submitting || 
                      !customerInfo.name || 
                      !customerInfo.phone || 
                      !!phoneError ||
                      (slotCapacity !== null && slotCapacity < actualVisitorCount) ||
                      total <= 0 ||
                      (!isLoggedIn && otpStep !== 'verified') || // Require OTP verification for guests
                      (adultCount === 0 && childCount === 0); // Require at least one ticket
                  })()}
                  className="mt-6"
                  style={{ 
                    backgroundColor: primaryColor,
                    borderColor: primaryColor,
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
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      {i18n.language === 'ar' ? 'جاري المعالجة...' : 'Processing...'}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      {i18n.language === 'ar' ? 'إتمام الحجز والدفع' : 'Complete Booking & Pay'}
                    </>
                  )}
                </Button>

                {/* Terms & Conditions */}
                <p className="text-xs text-gray-500 text-center mt-4">
                  {i18n.language === 'ar' 
                    ? 'بالضغط على "إتمام الحجز"، أنت توافق على الشروط والأحكام'
                    : 'By clicking "Complete Booking", you agree to our Terms & Conditions'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

