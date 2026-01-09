import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { Calendar, Clock, MapPin, ChevronRight, ChevronLeft, Edit2, Check, AlertCircle, X, Trash2, Package, User, Users, Baby } from 'lucide-react';
import { format, addDays, startOfWeek, isSameDay, parseISO, getDay, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getDaysInMonth } from 'date-fns';
import { StarRating } from '../../components/ui/StarRating';
import { AnimatedRating } from '../../components/ui/AnimatedRating';
import { TestimonialForm } from '../../components/reviews/TestimonialForm';
import { ReviewImageStory } from '../../components/reviews/ReviewImageStory';

interface Tenant {
  id: string;
  name: string;
  name_ar: string;
  slug: string;
  landing_page_settings: any;
}

interface Service {
  id: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  base_price: number;
  child_price?: number | null;
  duration_minutes: number;
  service_duration_minutes?: number;
  gallery_urls?: string[];
  badges?: Array<{ type: string; label?: string }>;
  average_rating?: number;
  total_reviews?: number;
  original_price?: number;
  discount_percentage?: number;
  image_url?: string;
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

interface ServiceOffer {
  id: string;
  service_id: string;
  tenant_id: string;
  name: string;
  name_ar?: string;
  description?: string;
  description_ar?: string;
  price: number;
  original_price?: number;
  discount_percentage?: number;
  duration_minutes?: number;
  perks?: string[];
  perks_ar?: string[];
  badge?: string;
  badge_ar?: string;
  closing_time?: string;
  meeting_point?: string;
  meeting_point_ar?: string;
  is_active: boolean;
}

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  available_capacity: number;
  booked_count: number;
  employee_id: string;
  users: {
    full_name: string;
    full_name_ar: string;
  };
}

interface DateAvailability {
  date: Date;
  dateString: string;
  minPrice: number;
  hasAvailability: boolean;
  slotCount: number;
}

interface Shift {
  id: string;
  service_id: string;
  days_of_week: number[];
  start_time_utc: string;
  end_time_utc: string;
  is_active: boolean;
}

export function ServiceBookingFlow() {
  const { tenantSlug, serviceId } = useParams<{ tenantSlug: string; serviceId: string }>();
  const [searchParams] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams();
  });
  const preselectedOfferId = searchParams.get('offer');
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const isLoggedIn = userProfile?.role === 'customer';
  const isServiceProvider = userProfile?.role === 'tenant_admin' || userProfile?.role === 'receptionist' || userProfile?.role === 'cashier';

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [offers, setOffers] = useState<ServiceOffer[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [availableDates, setAvailableDates] = useState<DateAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTestimonialForm, setShowTestimonialForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'reviews'>('details');
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});
  const [storyModal, setStoryModal] = useState<{
    isOpen: boolean;
    images: string[];
    review: any;
  }>({ isOpen: false, images: [], review: null });
  const [editingReview, setEditingReview] = useState<any | null>(null);

  // Selection state
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ServicePackage | null | undefined>(undefined);
  const [selectedOffer, setSelectedOffer] = useState<ServiceOffer | null | undefined>(undefined); // null = basic service, undefined = not selected
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [showTimeSelection, setShowTimeSelection] = useState(false);
  const [adultCount, setAdultCount] = useState(1);
  const [childCount, setChildCount] = useState(0);
  const [hasShifts, setHasShifts] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [datesToShow, setDatesToShow] = useState(7); // Show 7 days initially
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date()); // Current month for calendar modal

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  async function fetchReviews() {
    if (!serviceId) return;
    
    try {
      setReviewsLoading(true);
      const response = await fetch(`${API_URL}/reviews/service/${serviceId}?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setReviews(data);
      } else {
        console.error('Failed to fetch reviews');
        setReviews([]);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
      setReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }

  useEffect(() => {
    if (tenantSlug && serviceId) {
      fetchData();
      fetchReviews();
    }
  }, [tenantSlug, serviceId]);

  // Fetch reviews when switching to reviews tab
  useEffect(() => {
    if (activeTab === 'reviews' && serviceId && reviews.length === 0 && !reviewsLoading) {
      fetchReviews();
    }
  }, [activeTab, serviceId]);

  async function fetchData() {
    if (!tenantSlug || !serviceId) return;

    try {
      setLoading(true);
      setDebugInfo('Fetching data...');

      // Fetch tenant
      const { data: tenantData, error: tenantError } = await db
        .from('tenants')
        .select('id, name, name_ar, slug, landing_page_settings, is_active, maintenance_mode')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (tenantError) throw tenantError;
      if (!tenantData) {
        alert('Tenant not found');
        navigate(`/${tenantSlug}/book`);
        return;
      }

      // Check if tenant account is active
      if (tenantData.is_active === false) {
        alert('This service provider account has been deactivated. Please contact support.');
        navigate(`/${tenantSlug}/book`);
        return;
      }

      setTenant(tenantData);
      setDebugInfo('Tenant loaded');

      // Fetch service
      const { data: serviceData, error: serviceError } = await db
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .eq('tenant_id', tenantData.id)
        .eq('is_active', true)
        .eq('is_public', true)
        .maybeSingle();

      if (serviceError) throw serviceError;
      if (!serviceData) {
        alert('Service not found');
        navigate(`/${tenantSlug}/book`);
        return;
      }

      // Parse service data
      let galleryUrls = serviceData.gallery_urls || [];
      if (typeof galleryUrls === 'string') {
        try {
          galleryUrls = JSON.parse(galleryUrls);
        } catch {
          galleryUrls = [];
        }
      }
      if (!Array.isArray(galleryUrls)) galleryUrls = [];

      let badges = serviceData.badges || [];
      if (typeof badges === 'string') {
        try {
          badges = JSON.parse(badges);
        } catch {
          badges = [];
        }
      }
      if (!Array.isArray(badges)) badges = [];

      setService({
        ...serviceData,
        gallery_urls: galleryUrls,
        badges: badges,
      });
      setDebugInfo('Service loaded');

      // Fetch service offers (gracefully handle if table doesn't exist yet)
      try {
        const { data: offersData, error: offersError } = await db
          .from('service_offers')
          .select('*')
          .eq('service_id', serviceId)
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (!offersError && offersData) {
          // Parse perks if they're stored as JSON strings
          const parsedOffers = offersData.map((offer: any) => {
            let perks = offer.perks || [];
            let perks_ar = offer.perks_ar || [];
            if (typeof perks === 'string') {
              try {
                perks = JSON.parse(perks);
              } catch {
                perks = [];
              }
            }
            if (typeof perks_ar === 'string') {
              try {
                perks_ar = JSON.parse(perks_ar);
              } catch {
                perks_ar = [];
              }
            }
            return {
              ...offer,
              perks: Array.isArray(perks) ? perks : [],
              perks_ar: Array.isArray(perks_ar) ? perks_ar : [],
            };
          });
          setOffers(parsedOffers);
          
          // Auto-select offer if preselected from URL
          if (preselectedOfferId) {
            const preselectedOffer = parsedOffers.find((o: ServiceOffer) => o.id === preselectedOfferId);
            if (preselectedOffer) {
              setSelectedOffer(preselectedOffer);
            }
          }
        } else if (offersError) {
          // If table doesn't exist or other error, just log and continue
          console.warn('Could not fetch service offers (table may not exist yet):', offersError.message);
          setOffers([]);
        }
      } catch (offersErr: any) {
        // Gracefully handle if service_offers table doesn't exist
        console.warn('Error fetching service offers (table may not exist yet):', offersErr?.message || offersErr);
        setOffers([]);
      }

      // Fetch available packages that include this service
      try {
        const { data: packagesData, error: packagesError } = await db
          .from('service_packages')
          .select('id, name, name_ar, description, description_ar, total_price, original_price, discount_percentage, is_active, tenant_id, created_at, updated_at')
          .eq('tenant_id', tenantData.id)
          .eq('is_active', true);

        if (packagesError) {
          console.warn('Error fetching packages:', packagesError);
          setPackages([]);
        } else if (packagesData && packagesData.length > 0) {
          // Fetch package services to see which packages include this service
          const packagesWithServices = await Promise.all(
            packagesData.map(async (pkg: any) => {
              try {
                const { data: packageServices, error: packageServicesError } = await db
                  .from('package_services')
                  .select('service_id, quantity, services (id, name, name_ar)')
                  .eq('package_id', pkg.id);

                if (packageServicesError) {
                  console.warn(`Error fetching services for package ${pkg.id}:`, packageServicesError);
                  return null;
                }

                if (!packageServices || packageServices.length === 0) {
                  return null;
                }

                const includesService = packageServices.some(
                  (ps: any) => ps.service_id === serviceId
                );

                if (includesService) {
                  return {
                    ...pkg,
                    services: packageServices.map((ps: any) => ({
                      service_id: ps.service_id,
                      service_name: ps.services?.name || '',
                      service_name_ar: ps.services?.name_ar || '',
                      quantity: ps.quantity,
                    })),
                  };
                }
                return null;
              } catch (pkgErr: any) {
                console.warn(`Error processing package ${pkg.id}:`, pkgErr?.message || pkgErr);
                return null;
              }
            })
          );

          setPackages(packagesWithServices.filter((p): p is ServicePackage => p !== null));
        } else {
          setPackages([]);
        }
      } catch (packagesErr: any) {
        console.warn('Error fetching packages:', packagesErr?.message || packagesErr);
        setPackages([]);
      }

      // Fetch available slots for the next 60 days
      try {
        await fetchAvailableSlots(serviceData.id, tenantData.id);
      } catch (slotsErr: any) {
        console.error('Error fetching slots:', slotsErr);
        setDebugInfo(`Error fetching slots: ${slotsErr?.message || 'Unknown error'}`);
        // Don't throw - allow page to load even without slots
        setSlots([]);
        setAvailableDates([]);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      console.error('Full error object:', JSON.stringify(err, null, 2));
      
      // Extract error message from various possible structures
      let errorMessage = 'Unknown error';
      if (typeof err === 'string') {
        errorMessage = err;
      } else if (err?.message) {
        errorMessage = err.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      } else if (err?.error) {
        errorMessage = String(err.error);
      } else if (err?.toString) {
        errorMessage = err.toString();
      }
      
      setDebugInfo(`Error: ${errorMessage}`);
      
      // Provide more helpful error messages
      if (errorMessage.includes('service_offers') || errorMessage.includes('does not exist')) {
        console.warn('service_offers table may not exist yet. Please run the migration: 20251130000000_create_service_offers.sql');
        // Continue without offers - the page should still work
      } else {
        alert(`Failed to load booking page: ${errorMessage}. Please check the console for details.`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchAvailableSlots(serviceId: string, tenantId: string) {
    try {
      const today = startOfDay(new Date());
      const endDate = addDays(today, 60);
      const startDateStr = format(today, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');

      setDebugInfo(`Fetching shifts for service ${serviceId}...`);

      // First get shifts for this service with full details
      const { data: shiftsData, error: shiftsError } = await db
        .from('shifts')
        .select('id, service_id, days_of_week, start_time_utc, end_time_utc, is_active')
        .eq('service_id', serviceId)
        .eq('is_active', true);

      if (shiftsError) {
        console.error('Error fetching shifts:', shiftsError);
        setDebugInfo(`Error fetching shifts: ${shiftsError.message || 'Unknown error'}`);
        setHasShifts(false);
        setShifts([]);
        setSlots([]);
        setAvailableDates([]);
        return; // Don't throw, just return empty
      }

      console.log('Shifts found:', shiftsData?.length || 0, 'for service:', serviceId);
      setDebugInfo(`Found ${shiftsData?.length || 0} shifts`);

      if (!shiftsData || shiftsData.length === 0) {
        console.warn('No shifts found for service:', serviceId);
        setHasShifts(false);
        setShifts([]);
        setSlots([]);
        setAvailableDates([]);
        return;
      }

      setHasShifts(true);
      setShifts(shiftsData);
      const shiftIds = shiftsData.map((s: any) => s.id);


      // Then get slots for these shifts
      // NOTE: We fetch slots with available_capacity > 0 OR booked_count > 0
      // This ensures we get all slots that might have capacity, even if currently full
      // We'll filter by available_capacity later if needed
      console.log(`[ServiceBookingFlow] Fetching slots for shifts: ${shiftIds.join(', ')}`);
      console.log(`[ServiceBookingFlow] Date range: ${startDateStr} to ${endDateStr}`);
      let { data: slotsData, error: slotsError } = await db
        .from('slots')
        .select(`
          id,
          slot_date,
          start_time,
          end_time,
          available_capacity,
          booked_count,
          employee_id,
          shift_id,
          users:employee_id (full_name, full_name_ar)
        `)
        .eq('tenant_id', tenantId)
        .in('shift_id', shiftIds)
        .gte('slot_date', startDateStr)
        .lte('slot_date', endDateStr)
        .eq('is_available', true)
        // Remove the .gt('available_capacity', 0) filter to get all available slots
        // We'll filter by capacity later if needed
        .order('slot_date')
        .order('start_time');
      
      console.log(`[ServiceBookingFlow] Raw slots fetched from DB: ${slotsData?.length || 0}`);

      if (slotsError) {
        console.error('Error fetching slots:', slotsError);
        setDebugInfo(`Error fetching slots: ${slotsError.message || 'Unknown error'}`);
        setSlots([]);
        setAvailableDates([]);
        return; // Don't throw, just return empty
      }

      console.log('Slots found:', slotsData?.length || 0);

      // Fetch active locks to exclude locked slots
      const slotIds = (slotsData || []).map((s: any) => s.id);
      let lockedSlotIds: string[] = [];
      
      if (slotIds.length > 0) {
        try {
          // Use POST to avoid 431 error (Request Header Fields Too Large) when there are many slots
          const locksResponse = await fetch(
            `${API_URL}/bookings/locks`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ slot_ids: slotIds }),
            }
          );
          if (locksResponse.ok) {
            const locks = await locksResponse.json();
            lockedSlotIds = locks.map((l: any) => l.slot_id);
          } else {
            console.warn('Failed to fetch locks:', locksResponse.status, locksResponse.statusText);
          }
        } catch (err) {
          console.warn('Failed to fetch locks:', err);
        }
      }

      // Filter out locked slots
      let availableSlots = (slotsData || []).filter(
        (slot: any) => !lockedSlotIds.includes(slot.id)
      );
      
      console.log(`[ServiceBookingFlow] After removing locked slots: ${availableSlots.length} slots`);
      console.log(`[ServiceBookingFlow] Sample slots:`, availableSlots.slice(0, 3).map((s: any) => ({
        id: s.id,
        slot_date: s.slot_date,
        start_time: s.start_time,
        available_capacity: s.available_capacity,
        booked_count: s.booked_count
      })));

      // CRITICAL FIX: Filter slots to only include those that match shift days_of_week
      // This prevents showing slots for days that don't match the shift schedule
      if (shiftsData && shiftsData.length > 0) {
        // Create a map of shift_id -> days_of_week for quick lookup
        const shiftDaysMap = new Map<string, number[]>();
        shiftsData.forEach((shift: any) => {
          shiftDaysMap.set(shift.id, shift.days_of_week);
        });

        // Filter slots: only keep slots where the slot_date's day_of_week matches the shift's days_of_week
        console.log(`[ServiceBookingFlow] Filtering by days_of_week. Total slots before: ${availableSlots.length}`);
        availableSlots = availableSlots.filter((slot: any) => {
          const slotDate = slot.slot_date;
          const slotShiftId = slot.shift_id;
          
          if (!slotDate || !slotShiftId) {
            console.log(`[ServiceBookingFlow] Slot ${slot.id} missing date or shift_id, filtering out`);
            return false;
          }

          // Get the shift's days_of_week
          const shiftDays = shiftDaysMap.get(slotShiftId);
          if (!shiftDays || shiftDays.length === 0) {
            console.warn(`[ServiceBookingFlow] Slot ${slot.id} has invalid shift_id: ${slotShiftId}`);
            return false;
          }

          // Parse the date and get day of week (0 = Sunday, 1 = Monday, etc.)
          let dateObj: Date;
          if (typeof slotDate === 'string') {
            if (slotDate.includes('T') || slotDate.includes('Z')) {
              dateObj = parseISO(slotDate);
            } else {
              dateObj = parseISO(slotDate + 'T00:00:00');
            }
          } else {
            dateObj = new Date(slotDate);
          }

          const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, etc.
          const normalizedDate = format(dateObj, 'yyyy-MM-dd');
          console.log(`[ServiceBookingFlow] Slot ${slot.id}: date="${slotDate}" -> "${normalizedDate}", DOW=${dayOfWeek}, shift_days=[${shiftDays.join(', ')}]`);

          // Check if this day matches the shift's days_of_week
          if (shiftDays.includes(dayOfWeek)) {
            console.log(`[ServiceBookingFlow] Slot ${slot.id} matches shift days - KEEP`);
            return true;
          }

          // Day doesn't match the shift's days_of_week, filter it out
          console.warn(`[ServiceBookingFlow] Filtering out slot ${slot.id} on ${slotDate} (DOW=${dayOfWeek}) - doesn't match shift ${slotShiftId} days [${shiftDays.join(', ')}]`);
          return false;
        });
        console.log(`[ServiceBookingFlow] After days_of_week filtering: ${availableSlots.length} slots`);
      }

      // Filter out past time slots for today only
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes since midnight
      console.log(`[ServiceBookingFlow] Filtering slots. Current time: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} (${currentTime} minutes), Today: ${todayStr}`);
      console.log(`[ServiceBookingFlow] Total slots before time filtering: ${availableSlots.length}`);
      
      const beforeCount = availableSlots.length;
      availableSlots = availableSlots.filter((slot: any) => {
        const slotDateStr = slot.slot_date;
        if (typeof slotDateStr === 'string') {
          // Normalize date string - handle both "2025-12-08" and "2025-12-08T22:00:00.000Z"
          let normalizedDate: string;
          if (slotDateStr.includes('T') || slotDateStr.includes('Z')) {
            try {
              normalizedDate = format(parseISO(slotDateStr), 'yyyy-MM-dd');
            } catch (e) {
              normalizedDate = slotDateStr.substring(0, 10);
            }
          } else {
            normalizedDate = slotDateStr.substring(0, 10);
          }
          
          console.log(`[ServiceBookingFlow] Slot ${slot.id}: slot_date="${slotDateStr}" -> normalized="${normalizedDate}", today="${todayStr}", match=${normalizedDate === todayStr}`);
          
          // Only filter if it's today
          if (normalizedDate === todayStr) {
            if (!slot.start_time) {
              console.log(`[ServiceBookingFlow] Slot ${slot.id} has no start_time, keeping it`);
              return true; // Keep slots without start_time
            }
            // Handle time format: "HH:MM" or "HH:MM:SS"
            const timeParts = slot.start_time.split(':');
            const hours = parseInt(timeParts[0] || '0', 10);
            const minutes = parseInt(timeParts[1] || '0', 10);
            if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
              console.log(`[ServiceBookingFlow] Slot ${slot.id} has invalid time format: ${slot.start_time}, keeping it`);
              return true; // Keep slots with invalid time
            }
            const slotTime = hours * 60 + minutes; // Slot time in minutes since midnight
            const shouldKeep = slotTime > currentTime;
            console.log(`[ServiceBookingFlow] Slot ${slot.id}: ${slot.start_time} (${hours}:${String(minutes).padStart(2, '0')} = ${slotTime} min) vs current (${currentTime} min) - ${shouldKeep ? 'KEEP' : 'FILTER OUT'}`);
            // Keep slot if its start time is in the future
            return shouldKeep;
          }
        }
        // For future dates, keep all slots
        return true;
      });
      console.log(`[ServiceBookingFlow] Filtered slots: ${beforeCount} -> ${availableSlots.length}`);

      // IMPORTANT: Don't filter by available_capacity here!
      // We want to show ALL slots (even with capacity = 0) so users can see what's available
      // The capacity check will happen when they try to book
      // Only filter out slots that are in the past AND have no capacity
      const nowForCapacity = new Date();
      const todayStrForCapacity = format(nowForCapacity, 'yyyy-MM-dd');
      const currentTimeForCapacity = nowForCapacity.getHours() * 60 + nowForCapacity.getMinutes();
      
      console.log(`[ServiceBookingFlow] Before capacity filtering: ${availableSlots.length} slots`);
      const slotsWithCapacity = availableSlots.filter((slot: any) => {
        // Always keep slots with available_capacity > 0
        if (slot.available_capacity > 0) {
          console.log(`[ServiceBookingFlow] Slot ${slot.id} has capacity ${slot.available_capacity} - KEEP`);
          return true;
        }
        
        // For slots with capacity = 0, check if they're in the future
        const slotDateStr = slot.slot_date;
        if (typeof slotDateStr === 'string') {
          let normalizedDate: string;
          if (slotDateStr.includes('T') || slotDateStr.includes('Z')) {
            try {
              normalizedDate = format(parseISO(slotDateStr), 'yyyy-MM-dd');
            } catch (e) {
              normalizedDate = slotDateStr.substring(0, 10);
            }
          } else {
            normalizedDate = slotDateStr.substring(0, 10);
          }
          
          // If it's today and the slot time has passed, filter it out (no point showing past full slots)
          if (normalizedDate === todayStrForCapacity && slot.start_time) {
            const timeParts = slot.start_time.split(':');
            const hours = parseInt(timeParts[0] || '0', 10);
            const minutes = parseInt(timeParts[1] || '0', 10);
            if (!isNaN(hours) && !isNaN(minutes)) {
              const slotTime = hours * 60 + minutes;
              // Keep if slot is in the future (even if capacity is 0, for display - user will see it's full)
              const keep = slotTime > currentTimeForCapacity;
              console.log(`[ServiceBookingFlow] Slot ${slot.id} (capacity=0, time=${slot.start_time}, date=${normalizedDate}) - ${keep ? 'KEEP (future)' : 'FILTER OUT (past)'}`);
              return keep;
            }
          }
          
          // For future dates, keep slots even if capacity is 0 (for display - user will see it's full)
          if (normalizedDate > todayStrForCapacity) {
            console.log(`[ServiceBookingFlow] Slot ${slot.id} (capacity=0, date=${normalizedDate}) - KEEP (future date)`);
            return true;
          }
        }
        
        // Filter out past slots with no capacity
        console.log(`[ServiceBookingFlow] Slot ${slot.id} (capacity=0) - FILTER OUT (past)`);
        return false;
      });
      
      console.log(`[ServiceBookingFlow] After capacity filtering: ${availableSlots.length} -> ${slotsWithCapacity.length}`);
      availableSlots = slotsWithCapacity;

      console.log('Available slots after all filtering:', availableSlots.length);
      // Normalize dates for display
      const normalizedDates = [...new Set(availableSlots.map((s: any) => {
        const dateStr = s.slot_date;
        if (dateStr && (dateStr.includes('T') || dateStr.includes('Z'))) {
          try {
            return format(parseISO(dateStr), 'yyyy-MM-dd');
          } catch (e) {
            return dateStr.substring(0, 10);
          }
        }
        return dateStr?.substring(0, 10) || dateStr;
      }))].sort();
      console.log('Slot dates (normalized):', normalizedDates);

      setSlots(availableSlots);

      // Group slots by date and calculate availability
      const dateMap = new Map<string, Slot[]>();
      availableSlots.forEach((slot: any) => {
        // Normalize slot_date to yyyy-MM-dd format
        let dateStr = slot.slot_date;
        if (dateStr) {
          // If it's a timestamp or Date object, parse and format it
          if (dateStr.includes('T') || dateStr.includes('Z')) {
            dateStr = format(parseISO(dateStr), 'yyyy-MM-dd');
          } else if (typeof dateStr === 'string' && dateStr.length > 10) {
            // If it's a long string, try to parse it
            try {
              dateStr = format(new Date(dateStr), 'yyyy-MM-dd');
            } catch (e) {
              // Keep original if parsing fails
            }
          }
          // Ensure it's in yyyy-MM-dd format (take first 10 characters if longer)
          if (dateStr.length > 10) {
            dateStr = dateStr.substring(0, 10);
          }
        }
        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, []);
        }
        dateMap.get(dateStr)!.push(slot);
      });

      // Only create date entries for dates that actually have available slots
      const dates: DateAvailability[] = [];
      const sortedDateStrings = Array.from(dateMap.keys()).sort();
      
      // Calculate minimum price from service and packages
      const servicePrice = service?.base_price || 0;
      const packagePrices = packages.map(pkg => pkg.total_price || 0).filter(price => price > 0);
      const allPrices = [servicePrice, ...packagePrices].filter(price => price > 0);
      const overallMinPrice = allPrices.length > 0 ? Math.min(...allPrices) : servicePrice;
      
      console.log('Price calculation:', {
        servicePrice,
        packagePrices,
        allPrices,
        overallMinPrice
      });
      
      sortedDateStrings.forEach((dateStr) => {
        const daySlots = dateMap.get(dateStr) || [];
        if (daySlots.length > 0) {
          const date = parseISO(dateStr);
          // Use the minimum price from service and packages
          const minPrice = overallMinPrice > 0 ? overallMinPrice : servicePrice;
          dates.push({
            date,
            dateString: dateStr,
            minPrice: minPrice > 0 ? minPrice : servicePrice, // Ensure price is always set
            hasAvailability: true,
            slotCount: daySlots.length,
          });
        }
      });

      console.log('Available dates:', dates.length);
      setAvailableDates(dates);

      // Auto-select first available date if none selected
      if (!selectedDate && dates.length > 0) {
        setSelectedDate(dates[0].date);
      }
    } catch (err) {
      console.error('Error fetching slots:', err);
      setDebugInfo(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setSlots([]);
      setAvailableDates([]);
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

  // Get slots for selected date
  const getSlotsForDate = (date: Date | null): Slot[] => {
    if (!date) return [];
    const dateStr = format(date, 'yyyy-MM-dd');
    console.log(`[ServiceBookingFlow getSlotsForDate] Getting slots for date: ${dateStr}, total slots: ${slots.length}`);
    let dateSlots = slots.filter((slot) => {
      const normalizedSlotDate = normalizeSlotDate(slot.slot_date);
      const matches = normalizedSlotDate === dateStr;
      if (matches) {
        console.log(`[ServiceBookingFlow getSlotsForDate] Slot ${slot.id} matches: ${slot.start_time} - ${slot.end_time}, capacity: ${slot.available_capacity}`);
      }
      return matches;
    });
    console.log(`[ServiceBookingFlow getSlotsForDate] Found ${dateSlots.length} slots for date ${dateStr}`);
    
    // Filter out past time slots for today only
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const isToday = dateStr === todayStr;
    
    if (isToday) {
      const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes since midnight
      console.log(`[ServiceBookingFlow getSlotsForDate] Filtering for today. Current time: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} (${currentTime} minutes), Date: ${dateStr}`);
      const beforeCount = dateSlots.length;
      dateSlots = dateSlots.filter((slot) => {
        if (!slot.start_time) {
          console.log(`[ServiceBookingFlow getSlotsForDate] Slot ${slot.id} has no start_time, keeping it`);
          return true; // Keep slots without start_time
        }
        // Handle time format: "HH:MM" or "HH:MM:SS"
        const timeParts = slot.start_time.split(':');
        const hours = parseInt(timeParts[0] || '0', 10);
        const minutes = parseInt(timeParts[1] || '0', 10);
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          console.log(`[ServiceBookingFlow getSlotsForDate] Slot ${slot.id} has invalid time format: ${slot.start_time}, keeping it`);
          return true; // Keep slots with invalid time
        }
        const slotTime = hours * 60 + minutes; // Slot time in minutes since midnight
        const shouldKeep = slotTime > currentTime;
        console.log(`[ServiceBookingFlow getSlotsForDate] Slot ${slot.id}: ${slot.start_time} (${hours}:${String(minutes).padStart(2, '0')} = ${slotTime} min) vs current (${currentTime} min) - ${shouldKeep ? 'KEEP' : 'FILTER OUT'}`);
        // Keep slot if its start time is in the future
        return shouldKeep;
      });
      console.log(`[ServiceBookingFlow getSlotsForDate] Filtered slots: ${beforeCount} -> ${dateSlots.length}`);
    }
    
    console.log(`getSlotsForDate: date=${dateStr}, total slots=${slots.length}, matching slots=${dateSlots.length}`);
    if (dateSlots.length === 0 && slots.length > 0) {
      const uniqueDates = [...new Set(slots.map(s => normalizeSlotDate(s.slot_date)))];
      console.log('Available slot dates (normalized):', uniqueDates);
    }
    return dateSlots;
  };

  // Group slots by time
  const getGroupedSlots = (dateSlots: Slot[]): Map<string, Slot[]> => {
    const grouped = new Map<string, Slot[]>();
    dateSlots.forEach((slot) => {
      const timeKey = `${slot.start_time}-${slot.end_time}`;
      if (!grouped.has(timeKey)) {
        grouped.set(timeKey, []);
      }
      grouped.get(timeKey)!.push(slot);
    });
    return grouped;
  };

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    // Check if there are slots for this date
    const dateStr = format(date, 'yyyy-MM-dd');
    const slotsForDate = slots.filter((slot) => {
      const normalizedSlotDate = normalizeSlotDate(slot.slot_date);
      return normalizedSlotDate === dateStr;
    });
    // If a package/offer/service is already selected, show time selection if slots exist
    if ((selectedPackage !== undefined || selectedOffer !== undefined) && slotsForDate.length > 0) {
      setShowTimeSelection(true);
    } else {
      setShowTimeSelection(false);
    }
  };

  // Handle package/service selection
  const handlePackageSelect = (pkg: ServicePackage | null) => {
    setSelectedPackage(pkg);
    setSelectedOffer(undefined); // Clear offer selection when package is selected
    // Show time selection if date is already selected and slots exist
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const slotsForDate = slots.filter((slot) => {
        const normalizedSlotDate = normalizeSlotDate(slot.slot_date);
        return normalizedSlotDate === dateStr;
      });
      if (slotsForDate.length > 0) {
        setShowTimeSelection(true);
      }
    }
  };

  // Handle offer selection (null = basic service, ServiceOffer = specific offer)
  const handleOfferSelect = (offer: ServiceOffer | null) => {
    setSelectedOffer(offer);
    setSelectedPackage(undefined); // Clear package selection when offer is selected
    // Show time selection if date is already selected and slots exist
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const slotsForDate = slots.filter((slot) => {
        const normalizedSlotDate = normalizeSlotDate(slot.slot_date);
        return normalizedSlotDate === dateStr;
      });
      if (slotsForDate.length > 0) {
        setShowTimeSelection(true);
      }
    }
  };

  // Handle slot selection
  const handleSlotSelect = (slot: Slot) => {
    setSelectedSlot(slot);
  };

  // Handle proceed to checkout
  const handleProceedToCheckout = () => {
    if (!selectedDate || !selectedSlot) {
      alert(i18n.language === 'ar' ? 'يرجى اختيار التاريخ والوقت' : 'Please select a date and time slot');
      return;
    }

    // Require selection of either basic service (null) or an offer
    if (offers.length > 0 && selectedOffer === undefined) {
      alert(i18n.language === 'ar' ? 'يرجى اختيار خيار من الخيارات المتاحة' : 'Please select an option from the available offers');
      return;
    }

    const bookingData = {
      serviceId: service?.id,
      packageId: selectedPackage?.id || null,
      offerId: selectedOffer?.id || null, // null means basic service was selected
      slotId: selectedSlot.id,
      date: format(selectedDate, 'yyyy-MM-dd'),
      time: selectedSlot.start_time,
      adultCount: adultCount,
      childCount: childCount,
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
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: primaryColor }}></div>
          <p className="text-gray-600">{debugInfo || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (!tenant || !service) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Service not found</h1>
          <p className="text-gray-600 mt-2">The service you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate(`/${tenantSlug}/book`)}
            className="mt-4 px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const dateSlots = getSlotsForDate(selectedDate);
  const groupedSlots = getGroupedSlots(dateSlots);

  // Calculate overall rating from reviews
  const calculatedRating = reviews.length > 0
    ? reviews.reduce((sum, review) => sum + (review.rating || 0), 0) / reviews.length
    : service?.average_rating || 0;
  
  const displayRating = calculatedRating > 0 ? Math.round(calculatedRating * 10) / 10 : 0;
  const displayReviewCount = reviews.length > 0 ? reviews.length : (service?.total_reviews || 0);

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
                  {i18n.language === 'ar' ? 'احجز خدماتك الآن' : 'Book Your Services'}
                </span>
              </div>
            </div>

            {/* Center: Animated Rating */}
            {displayRating > 0 && displayReviewCount > 0 && (
              <div className="hidden md:flex items-center">
                <div 
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-pink-50 to-blue-50 border border-pink-200/50 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105"
                  style={{
                    borderColor: `${primaryColor}30`,
                    background: `linear-gradient(135deg, ${primaryColor}15 0%, ${secondaryColor}15 100%)`,
                  }}
                >
                  <AnimatedRating
                    rating={displayRating}
                    reviewCount={displayReviewCount}
                    primaryColor={primaryColor}
                    secondaryColor={secondaryColor}
                  />
                </div>
              </div>
            )}

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
        {/* Debug Info - Remove in production */}
        {debugInfo && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <strong>Debug:</strong> {debugInfo}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - Similar to reference page structure */}
          <div className="lg:col-span-2 space-y-6">
            {/* Service Title and Selected Date - Modern design with edit capability */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                    {i18n.language === 'ar' ? service.name_ar : service.name}
                  </h1>
                  {selectedDate && selectedSlot && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-2">
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
                      setSelectedDate(null);
                      setSelectedPackage(undefined);
                      setSelectedSlot(null);
                      setShowTimeSelection(false);
                    }}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 ml-4 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                    title={i18n.language === 'ar' ? 'تعديل التاريخ والوقت' : 'Edit date and time'}
                  >
                    <Edit2 className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {i18n.language === 'ar' ? 'تعديل' : 'Edit'}
                    </span>
                  </button>
                )}
              </div>

              {/* Select an option button - EXACTLY like reference page */}
              {!selectedPackage && selectedOffer === undefined && (
                <button
                  onClick={() => setShowTimeSelection(false)}
                  className="w-full text-left px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors bg-gray-50"
                >
                  <span className="text-gray-600 font-medium">
                    {i18n.language === 'ar' ? 'اختر خياراً' : 'Select an option'}
                  </span>
                </button>
              )}
            </div>

            {/* Date Selection - Matching reference website style */}
            <div className="bg-white rounded-lg shadow-sm p-6" data-dates-section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {i18n.language === 'ar' ? 'اختر التاريخ' : 'Select a date'}
              </h2>
              
              {/* Horizontal scrollable date cards - Always show first 7 */}
              <div className="relative">
                <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'thin' }}>
                  {availableDates.slice(0, 7).map((dateAvail) => {
                    const isSelected = selectedDate && isSameDay(dateAvail.date, selectedDate);
                    return (
                      <button
                        key={dateAvail.dateString}
                        onClick={() => handleDateSelect(dateAvail.date)}
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
                        <span className="text-sm font-bold text-gray-900 mt-1 leading-tight">
                          {format(dateAvail.date, 'MMM d')}
                        </span>
                        {dateAvail.minPrice > 0 && (
                          <span className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                            {dateAvail.minPrice} {t('service.currency') || 'SAR'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  
                  {/* More dates button - Show if more than 7 dates */}
                  {availableDates.length > 7 && (
                    <button
                      onClick={() => {
                        setShowFullCalendar(true);
                        // Set calendar month to first available date or current month
                        if (availableDates.length > 0) {
                          setCalendarMonth(startOfMonth(availableDates[0].date));
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
              {showFullCalendar && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                  <div className="flex min-h-screen items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={() => setShowFullCalendar(false)} />
                    
                    <div className="relative bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                      {/* Header */}
                      <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
                        <h2 className="text-xl font-semibold text-gray-900">
                          {i18n.language === 'ar' ? 'اختر التاريخ' : 'Select a date'}
                        </h2>
                        <button
                          onClick={() => setShowFullCalendar(false)}
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
                            onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <ChevronLeft className="w-5 h-5 text-gray-600" />
                          </button>
                          <div className="flex items-center gap-8">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {format(calendarMonth, 'MMMM yyyy')}
                            </h3>
                            <h3 className="text-lg font-semibold text-gray-900">
                              {format(addMonths(calendarMonth, 1), 'MMMM yyyy')}
                            </h3>
                          </div>
                          <button
                            onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <ChevronRight className="w-5 h-5 text-gray-600" />
                          </button>
                        </div>
                        
                        {/* Two Month Calendar Grid */}
                        <div className="grid grid-cols-2 gap-8">
                          {/* First Month */}
                          {[calendarMonth, addMonths(calendarMonth, 1)].map((month, monthIndex) => {
                            const monthStart = startOfMonth(month);
                            const monthEnd = endOfMonth(month);
                            const daysInMonth = getDaysInMonth(month);
                            const firstDayOfWeek = monthStart.getDay();
                            
                            // Create date map for quick lookup
                            const dateMap = new Map<string, DateAvailability>();
                            availableDates.forEach(dateAvail => {
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
                                            handleDateSelect(dateAvail.date);
                                            setShowFullCalendar(false);
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
                                        {dateAvail && !isPast && dateAvail.minPrice > 0 && (
                                          <span className="text-[9px] font-semibold mt-0.5" style={{ color: primaryColor }}>
                                            {dateAvail.minPrice} {t('service.currency') || 'SAR'}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Footer Note */}
                        <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-2 text-sm text-gray-500">
                          <span className="text-xs">
                            {i18n.language === 'ar' 
                              ? `جميع الأسعار بالعملة المحلية (${t('service.currency') || 'SAR'})`
                              : `All prices are in ${t('service.currency') || 'SAR'}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* No dates available message */}
              {availableDates.length === 0 && (
                  <div className="w-full text-center py-8">
                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-2 font-medium">
                      {i18n.language === 'ar' ? 'لا توجد تواريخ متاحة حالياً' : 'No available dates at the moment'}
                    </p>
                    {hasShifts ? (
                      <p className="text-sm text-gray-400 mb-2">
                        {i18n.language === 'ar' 
                          ? 'تم العثور على shifts لكن لا توجد slots متاحة حالياً.' 
                          : 'Shifts found but no slots available at the moment.'}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-gray-400 mb-2">
                          {i18n.language === 'ar' 
                            ? 'يرجى التواصل مع مزود الخدمة لإضافة تواريخ متاحة' 
                            : 'Please contact the service provider to add available dates'}
                        </p>
                        <p className="text-xs text-gray-300">
                          {i18n.language === 'ar' 
                            ? 'ملاحظة: يجب على مزود الخدمة إنشاء Shifts لهذه الخدمة في لوحة التحكم' 
                            : 'Note: Service provider needs to create Shifts for this service in the admin panel'}
                        </p>
                      </>
                    )}
                  </div>
              )}
            </div>

            {/* Offers/Service Options - Only show if date is selected - EXACTLY like reference page */}
            {selectedDate && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {i18n.language === 'ar' ? 'اختر خيارك' : 'Select your option'}
                </h2>

                <div className="space-y-4">
                  {/* Show offers if available, otherwise show packages */}
                  {offers.length > 0 ? (
                    <div>
                      {/* Base Service Option */}
                      <div
                        className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
                          selectedOffer === null
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                        style={
                          selectedOffer === null
                            ? {
                                borderColor: primaryColor,
                                backgroundColor: `${primaryColor}15`,
                              }
                            : {}
                        }
                        onClick={() => handleOfferSelect(null)}
                      >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {i18n.language === 'ar' ? service.name_ar : service.name}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>{i18n.language === 'ar' ? 'وقت الإغلاق:' : 'Closing time:'} 12:00am</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            <span>{i18n.language === 'ar' ? 'نقطة اللقاء' : 'Meeting point'}</span>
                          </div>
                        </div>
                        <ul className="space-y-1 text-sm text-gray-600">
                          <li>• {i18n.language === 'ar' ? service.description_ar : service.description}</li>
                        </ul>
                      </div>
                      <div className="ml-4 text-right">
                        <div className="mb-2">
                          <span className="text-sm text-gray-500">from</span>
                        </div>
                        <div className="text-2xl font-bold" style={{ color: primaryColor }}>
                          {service.base_price} {t('service.currency') || 'SAR'}
                        </div>
                        <button
                          className={`mt-3 px-6 py-2 rounded-lg font-medium transition-all ${
                            selectedOffer === null
                              ? 'text-white'
                              : 'border-2 text-gray-700 hover:bg-gray-50'
                          }`}
                          style={
                            selectedOffer === null
                              ? { backgroundColor: primaryColor }
                              : { borderColor: primaryColor, color: primaryColor }
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOfferSelect(null);
                          }}
                        >
                          {selectedOffer === null ? (
                            <span className="flex items-center gap-2">
                              <Check className="w-4 h-4" />
                              {i18n.language === 'ar' ? 'محدد' : 'Selected'}
                            </span>
                          ) : (
                            i18n.language === 'ar' ? 'اختر' : 'Select'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Offer Options */}
                  {offers.map((offer) => (
                    <div
                      key={offer.id}
                      className={`border-2 rounded-lg p-6 cursor-pointer transition-all relative ${
                        selectedOffer?.id === offer.id
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                      style={
                        selectedOffer?.id === offer.id
                          ? {
                              borderColor: primaryColor,
                              backgroundColor: `${primaryColor}15`,
                            }
                          : {}
                      }
                      onClick={() => {
                        handleOfferSelect(offer);
                        if (selectedDate) {
                          const dateStr = format(selectedDate, 'yyyy-MM-dd');
                          const slotsForDate = slots.filter((slot) => {
                            const normalizedSlotDate = normalizeSlotDate(slot.slot_date);
                            return normalizedSlotDate === dateStr;
                          });
                          if (slotsForDate.length > 0) {
                            setShowTimeSelection(true);
                          }
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-6">
                        {/* Left: Features Section */}
                        <div className="flex-1 pr-4">
                          {/* Badge - Positioned at top of features section, not overlapping pricing */}
                          {offer.badge && (
                            <div className="mb-3">
                              <span className="inline-block px-3 py-1.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 shadow-sm">
                                {i18n.language === 'ar' ? offer.badge_ar || offer.badge : offer.badge}
                              </span>
                            </div>
                          )}
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {i18n.language === 'ar' ? offer.name_ar || offer.name : offer.name}
                          </h3>
                          {offer.description && (
                            <p className="text-sm text-gray-600 mb-3">
                              {i18n.language === 'ar' ? offer.description_ar || offer.description : offer.description}
                            </p>
                          )}
                          {offer.perks && offer.perks.length > 0 && (
                            <ul className="space-y-1.5 text-sm text-gray-600">
                              {(i18n.language === 'ar' ? offer.perks_ar || offer.perks : offer.perks).map((perk, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className="text-purple-600 mt-1">•</span>
                                  <span>{perk}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="flex items-center gap-4 text-sm text-gray-600 mt-3">
                            {offer.closing_time && (
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                <span>{i18n.language === 'ar' ? 'وقت الإغلاق:' : 'Closing time:'} {formatTime12Hour(offer.closing_time)}</span>
                              </div>
                            )}
                            {offer.meeting_point && (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                <span>{i18n.language === 'ar' ? offer.meeting_point_ar || offer.meeting_point : offer.meeting_point}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Right: Pricing Section - No overlap with badge */}
                        <div className="ml-4 text-right flex-shrink-0 min-w-[160px]">
                          {offer.original_price && offer.original_price > offer.price && (
                            <div className="mb-1">
                              <div className="flex items-center justify-end gap-2 flex-wrap">
                                <span className="text-sm text-gray-400 line-through">
                                  {offer.original_price} {t('service.currency') || 'SAR'}
                                </span>
                                {offer.discount_percentage && (
                                  <span className="text-xs font-semibold text-red-600">
                                    {offer.discount_percentage}% {i18n.language === 'ar' ? 'خصم' : 'off'}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="mb-1">
                            <span className="text-xs text-gray-500">{i18n.language === 'ar' ? 'من' : 'from'}</span>
                          </div>
                          <div className="text-2xl font-bold mb-3" style={{ color: primaryColor }}>
                            {offer.price} {t('service.currency') || 'SAR'}
                          </div>
                          <button
                            className={`w-full px-6 py-2.5 rounded-lg font-medium transition-all ${
                              selectedOffer?.id === offer.id
                                ? 'text-white shadow-md'
                                : 'border-2 text-gray-700 hover:bg-gray-50'
                            }`}
                            style={
                              selectedOffer?.id === offer.id
                                ? { backgroundColor: primaryColor }
                                : { borderColor: primaryColor, color: primaryColor }
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOfferSelect(offer);
                              if (selectedDate) {
                                const dateStr = format(selectedDate, 'yyyy-MM-dd');
                                const slotsForDate = slots.filter((slot) => {
                                  const normalizedSlotDate = normalizeSlotDate(slot.slot_date);
                                  return normalizedSlotDate === dateStr;
                                });
                                if (slotsForDate.length > 0) {
                                  setShowTimeSelection(true);
                                }
                              }
                            }}
                          >
                            {selectedOffer?.id === offer.id ? (
                              <span className="flex items-center justify-center gap-2">
                                <Check className="w-4 h-4" />
                                {i18n.language === 'ar' ? 'محدد' : 'Selected'}
                              </span>
                            ) : (
                              i18n.language === 'ar' ? 'اختر' : 'Select'
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                    </div>
                  ) : (
                    <div>
                      {/* Base Service Option (when no offers) */}
                      <div
                        className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
                          selectedPackage === null
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                        style={
                          selectedPackage === null
                            ? {
                                borderColor: primaryColor,
                                backgroundColor: `${primaryColor}15`,
                              }
                            : {}
                        }
                        onClick={() => handlePackageSelect(null)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                              {i18n.language === 'ar' ? service.name_ar : service.name}
                            </h3>
                            <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                <span>{i18n.language === 'ar' ? 'وقت الإغلاق:' : 'Closing time:'} 12:00am</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                <span>{i18n.language === 'ar' ? 'نقطة اللقاء' : 'Meeting point'}</span>
                              </div>
                            </div>
                            <ul className="space-y-1 text-sm text-gray-600">
                              <li>• {i18n.language === 'ar' ? service.description_ar : service.description}</li>
                            </ul>
                          </div>
                          <div className="ml-4 text-right">
                            <div className="mb-2">
                              <span className="text-sm text-gray-500">from</span>
                            </div>
                            <div className="text-2xl font-bold" style={{ color: primaryColor }}>
                              {service.base_price} {t('service.currency') || 'SAR'}
                            </div>
                            <button
                              className={`mt-3 px-6 py-2 rounded-lg font-medium transition-all ${
                                selectedPackage === null
                                  ? 'text-white'
                                  : 'border-2 text-gray-700 hover:bg-gray-50'
                              }`}
                              style={
                                selectedPackage === null
                                  ? { backgroundColor: primaryColor }
                                  : { borderColor: primaryColor, color: primaryColor }
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePackageSelect(null);
                              }}
                            >
                              {selectedPackage === null ? (
                                <span className="flex items-center gap-2">
                                  <Check className="w-4 h-4" />
                                  {i18n.language === 'ar' ? 'محدد' : 'Selected'}
                                </span>
                              ) : (
                                i18n.language === 'ar' ? 'اختر' : 'Select'
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Package Options */}
                      {packages.map((pkg) => (
                        <div
                          key={pkg.id}
                          className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
                            selectedPackage?.id === pkg.id
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                          style={
                            selectedPackage?.id === pkg.id
                              ? {
                                  borderColor: primaryColor,
                                  backgroundColor: `${primaryColor}15`,
                                }
                              : {}
                          }
                          onClick={() => {
                            handlePackageSelect(pkg);
                            if (selectedDate) {
                              const dateStr = format(selectedDate, 'yyyy-MM-dd');
                              const slotsForDate = slots.filter((slot) => {
                                const normalizedSlotDate = normalizeSlotDate(slot.slot_date);
                                return normalizedSlotDate === dateStr;
                              });
                              if (slotsForDate.length > 0) {
                                setShowTimeSelection(true);
                              }
                            }
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                {formatPackageName(pkg, i18n.language)}
                              </h3>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  <span>{i18n.language === 'ar' ? 'وقت الإغلاق:' : 'Closing time:'} 12:00am</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-4 h-4" />
                                  <span>{i18n.language === 'ar' ? 'نقطة اللقاء' : 'Meeting point'}</span>
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 mb-3">
                                {i18n.language === 'ar' ? pkg.description_ar : pkg.description}
                              </p>
                              {pkg.services && pkg.services.length > 0 && (
                                <ul className="space-y-1 text-sm text-gray-600">
                                  {pkg.services.map((svc, idx) => (
                                    <li key={idx}>
                                      • {i18n.language === 'ar' ? svc.service_name_ar : svc.service_name} ({svc.quantity}x)
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="ml-4 text-right">
                              {pkg.original_price && pkg.original_price > pkg.total_price && (
                                <div className="mb-1">
                                  <span className="text-sm text-gray-400 line-through">
                                    {pkg.original_price} {t('service.currency') || 'SAR'}
                                  </span>
                                </div>
                              )}
                              <div className="mb-2">
                                <span className="text-sm text-gray-500">from</span>
                              </div>
                              <div className="text-2xl font-bold" style={{ color: primaryColor }}>
                                {pkg.total_price} {t('service.currency') || 'SAR'}
                              </div>
                              {pkg.original_price && pkg.original_price > pkg.total_price && (
                                <div className="mt-1">
                                  <span className="text-sm font-semibold text-green-600">
                                    {i18n.language === 'ar' ? 'وفر' : 'Save'} {Math.round(((pkg.original_price - pkg.total_price) / pkg.original_price) * 100)}%
                                  </span>
                                </div>
                              )}
                              <button
                                className={`mt-3 px-6 py-2 rounded-lg font-medium transition-all ${
                                  selectedPackage?.id === pkg.id
                                    ? 'text-white'
                                    : 'border-2 text-gray-700 hover:bg-gray-50'
                                }`}
                                style={
                                  selectedPackage?.id === pkg.id
                                    ? { backgroundColor: primaryColor }
                                    : { borderColor: primaryColor, color: primaryColor }
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePackageSelect(pkg);
                                  if (selectedDate) {
                                    const dateStr = format(selectedDate, 'yyyy-MM-dd');
                                    const slotsForDate = slots.filter((slot) => {
                                      const normalizedSlotDate = normalizeSlotDate(slot.slot_date);
                                      return normalizedSlotDate === dateStr;
                                    });
                                    if (slotsForDate.length > 0) {
                                      setShowTimeSelection(true);
                                    }
                                  }
                                }}
                              >
                                {selectedPackage?.id === pkg.id ? (
                                  <span className="flex items-center gap-2">
                                    <Check className="w-4 h-4" />
                                    {i18n.language === 'ar' ? 'محدد' : 'Selected'}
                                  </span>
                                ) : (
                                  i18n.language === 'ar' ? 'اختر' : 'Select'
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Number of Tickets Selection - Show if package/offer/service is selected */}
            {selectedDate && (selectedPackage !== undefined || selectedOffer !== undefined) && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {i18n.language === 'ar' ? 'عدد التذاكر' : 'Number of Tickets'}
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
                      <span className="text-sm font-semibold text-gray-900">
                        {(() => {
                          let price: number = service.base_price || 0;
                          if (selectedPackage) {
                            price = parseFloat(String(selectedPackage.total_price || 0));
                          } else if (selectedOffer !== undefined && selectedOffer !== null) {
                            price = parseFloat(String(selectedOffer.price || 0));
                          } else {
                            price = parseFloat(String(service.base_price || 0));
                          }
                          return `${price.toFixed(2)} ${t('service.currency') || 'SAR'}`;
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setAdultCount(Math.max(1, adultCount - 1))}
                        disabled={adultCount === 1}
                        className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <span className="text-lg font-semibold w-12 text-center">{adultCount}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newCount = adultCount + 1;
                          if (selectedSlot && selectedSlot.available_capacity < (newCount + childCount)) {
                            alert(
                              i18n.language === 'ar'
                                ? `لا توجد أماكن كافية. المتاح: ${selectedSlot.available_capacity}، المطلوب: ${newCount + childCount}`
                                : `Not enough capacity available. Available: ${selectedSlot.available_capacity}, Requested: ${newCount + childCount}`
                            );
                            return;
                          }
                          setAdultCount(newCount);
                        }}
                        disabled={selectedSlot !== null && selectedSlot.available_capacity !== null && (adultCount + childCount) >= selectedSlot.available_capacity}
                        className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Users className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Child Tickets - Only show if child_price is defined */}
                  {service?.child_price !== undefined && service.child_price !== null && (
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
                          onClick={() => setChildCount(Math.max(0, childCount - 1))}
                          disabled={childCount === 0}
                          className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <span className="text-lg font-semibold w-12 text-center">{childCount}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newCount = childCount + 1;
                            if (selectedSlot && selectedSlot.available_capacity < (adultCount + newCount)) {
                              alert(
                                i18n.language === 'ar'
                                  ? `لا توجد أماكن كافية. المتاح: ${selectedSlot.available_capacity}، المطلوب: ${adultCount + newCount}`
                                  : `Not enough capacity available. Available: ${selectedSlot.available_capacity}, Requested: ${adultCount + newCount}`
                              );
                              return;
                            }
                            setChildCount(newCount);
                          }}
                          disabled={selectedSlot !== null && selectedSlot.available_capacity !== null && (adultCount + childCount) >= selectedSlot.available_capacity}
                          className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Total Visitors Display */}
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        {i18n.language === 'ar' ? 'إجمالي الزوار' : 'Total Visitors'}
                      </span>
                      <span className="text-lg font-semibold text-gray-900">
                        {adultCount + childCount} {i18n.language === 'ar' ? 'زائر' : 'visitor(s)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Time Selection - Show if package/offer/service is selected AND date is selected - EXACTLY like reference page */}
            {selectedDate && (selectedPackage !== undefined || selectedOffer !== undefined) && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {i18n.language === 'ar' ? 'اختر الوقت' : 'Pick a time'}
                </h2>
                {dateSlots.length > 0 && groupedSlots.size > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={selectedSlot?.id || ''}
                      onChange={(e) => {
                        const slotId = e.target.value;
                        const slot = dateSlots.find(s => s.id === slotId);
                        if (slot) {
                          handleSlotSelect(slot);
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
                      {Array.from(groupedSlots.entries()).map(([timeKey, timeSlots]) => {
                        const firstSlot = timeSlots[0];
                        const totalCapacity = timeSlots.reduce((sum, s) => sum + s.available_capacity, 0);
                        const isSelected = selectedSlot && timeSlots.some((s) => s.id === selectedSlot.id);
                        
                        // Format time display - show start time in 12-hour format
                        const timeDisplay = formatTime12Hour(firstSlot.start_time);

                        // Show capacity information
                        let capacityText = '';
                        if (totalCapacity === 0) {
                          capacityText = ` (${i18n.language === 'ar' ? 'ممتلئ' : 'Full'})`;
                        } else if (totalCapacity === 1) {
                          capacityText = ` (${i18n.language === 'ar' ? 'تذكرة واحدة متبقية' : '1 ticket left'})`;
                        } else if (totalCapacity <= 5) {
                          capacityText = ` (${totalCapacity} ${i18n.language === 'ar' ? 'تذاكر متبقية' : 'tickets left'})`;
                        }

                        return (
                          <option
                            key={timeKey}
                            value={firstSlot.id}
                            disabled={totalCapacity === 0}
                            style={{
                              backgroundColor: isSelected ? `${primaryColor}15` : totalCapacity === 0 ? '#f3f4f6' : 'white',
                              color: totalCapacity === 0 ? '#9ca3af' : undefined,
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
                          {selectedSlot.available_capacity === 1 && (
                            <span className="ml-2 text-orange-600 font-medium">
                              ({i18n.language === 'ar' ? 'تذكرة واحدة متبقية' : '1 ticket left'})
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-2">
                      {i18n.language === 'ar' ? 'لا توجد أوقات متاحة لهذا التاريخ' : 'No available times for this date'}
                    </p>
                    {debugInfo && (
                      <p className="text-xs text-gray-400 mb-2 font-mono bg-gray-50 p-2 rounded">
                        Debug: {debugInfo}
                      </p>
                    )}
                    {slots.length > 0 && (
                      <p className="text-xs text-gray-400 mb-2">
                        {i18n.language === 'ar' 
                          ? `ملاحظة: يوجد ${slots.length} slot متاح في تواريخ أخرى` 
                          : `Note: There are ${slots.length} slots available on other dates`}
                      </p>
                    )}
                    <p className="text-sm text-gray-400">
                      {i18n.language === 'ar' 
                        ? 'يرجى اختيار تاريخ آخر أو التواصل مع مزود الخدمة' 
                        : 'Please select another date or contact the service provider'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar - Booking Summary - EXACTLY like reference page */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-24">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {i18n.language === 'ar' ? 'ملخص الحجز' : 'Booking Summary'}
              </h2>

              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-600 mb-1">
                    {i18n.language === 'ar' ? 'الخدمة' : 'Service'}
                  </div>
                  <div className="font-medium text-gray-900">
                    {selectedOffer !== undefined
                      ? selectedOffer === null
                        ? i18n.language === 'ar'
                          ? service.name_ar
                          : service.name
                        : i18n.language === 'ar'
                        ? selectedOffer.name_ar || selectedOffer.name
                        : selectedOffer.name
                      : selectedPackage
                      ? formatPackageName(selectedPackage, i18n.language)
                      : i18n.language === 'ar'
                      ? service.name_ar
                      : service.name}
                  </div>
                </div>

                {selectedDate && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">
                      {i18n.language === 'ar' ? 'التاريخ' : 'Date'}
                    </div>
                    <div className="font-medium text-gray-900">
                      {format(selectedDate, 'EEE, MMM d, yyyy')}
                    </div>
                  </div>
                )}

                {selectedSlot && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">
                      {i18n.language === 'ar' ? 'الوقت' : 'Time'}
                    </div>
                    <div className="font-medium text-gray-900">
                      {selectedSlot.start_time} - {selectedSlot.end_time}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-200">
                  <div className="space-y-3">
                    {(() => {
                      // Determine the price based on selection
                      let pricePerTicket: number;
                      let originalPrice: number | null = null;
                      
                      if (selectedPackage) {
                        pricePerTicket = parseFloat(String(selectedPackage.total_price || 0));
                        originalPrice = selectedPackage.original_price ? parseFloat(String(selectedPackage.original_price)) : null;
                      } else if (selectedOffer !== undefined && selectedOffer !== null) {
                        // Offer is selected
                        pricePerTicket = parseFloat(String(selectedOffer.price || 0));
                        originalPrice = selectedOffer.original_price ? parseFloat(String(selectedOffer.original_price)) : null;
                      } else {
                        // Basic service
                        pricePerTicket = parseFloat(String(service.base_price || 0));
                        originalPrice = service.original_price ? parseFloat(String(service.original_price)) : null;
                      }

                      const totalVisitors = adultCount + childCount;
                      const childPrice = service.child_price ? parseFloat(String(service.child_price)) : pricePerTicket;
                      const adultSubtotal = pricePerTicket * adultCount;
                      const childSubtotal = childPrice * childCount;
                      const subtotal = adultSubtotal + childSubtotal;
                      const originalSubtotal = originalPrice ? (originalPrice * adultCount) + (childPrice * childCount) : null;

                      return (
                        <>
                          {/* Price per ticket */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">
                              {i18n.language === 'ar' ? 'السعر لكل تذكرة' : 'Price per ticket'}
                            </span>
                            <div className="text-right">
                              {originalPrice && originalPrice > pricePerTicket && (
                                <div className="text-sm text-gray-400 line-through mb-1">
                                  {originalPrice.toFixed(2)} {t('service.currency') || 'SAR'}
                                </div>
                              )}
                              <span className="text-sm font-semibold text-gray-900">
                                {pricePerTicket.toFixed(2)} {t('service.currency') || 'SAR'}
                              </span>
                              {originalPrice && originalPrice > pricePerTicket && selectedOffer && selectedOffer.discount_percentage && (
                                <div className="text-xs text-green-600 mt-1">
                                  {i18n.language === 'ar' ? 'وفر' : 'Save'} {selectedOffer.discount_percentage}%
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Ticket breakdown */}
                          {adultCount > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">
                                {i18n.language === 'ar' ? 'تذاكر الكبار' : 'Adult Tickets'}
                              </span>
                              <span className="text-gray-900 font-medium">
                                {adultCount} × {pricePerTicket.toFixed(2)} = {adultSubtotal.toFixed(2)} {t('service.currency') || 'SAR'}
                              </span>
                            </div>
                          )}
                          {childCount > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">
                                {i18n.language === 'ar' ? 'تذاكر الأطفال' : 'Child Tickets'}
                              </span>
                              <span className="text-gray-900 font-medium">
                                {childCount} × {childPrice.toFixed(2)} = {childSubtotal.toFixed(2)} {t('service.currency') || 'SAR'}
                              </span>
                            </div>
                          )}

                          {/* Subtotal */}
                          <div className="pt-2 border-t">
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-gray-600">
                                {i18n.language === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}
                              </span>
                              <span className="text-gray-900 font-medium">
                                {subtotal.toFixed(2)} {t('service.currency') || 'SAR'}
                              </span>
                            </div>
                          </div>

                          {/* Total */}
                          <div className="pt-2 border-t">
                            <div className="flex items-center justify-between">
                              <span className="text-base font-semibold text-gray-900">
                                {i18n.language === 'ar' ? 'الإجمالي' : 'Total'}
                              </span>
                              <span className="text-xl font-bold" style={{ color: primaryColor }}>
                                {subtotal.toFixed(2)} {t('service.currency') || 'SAR'}
                              </span>
                            </div>
                          </div>

                          {/* Capacity Warning */}
                          {selectedSlot && selectedSlot.available_capacity < totalVisitors && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                              <p className="text-sm text-red-700">
                                ⚠️ {i18n.language === 'ar' 
                                  ? `لا توجد أماكن كافية. المتاح: ${selectedSlot.available_capacity}، المطلوب: ${totalVisitors}`
                                  : `Not enough capacity available. Available: ${selectedSlot.available_capacity}, Requested: ${totalVisitors}`}
                              </p>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <button
                  onClick={handleProceedToCheckout}
                  disabled={(() => {
                    if (!selectedDate || !selectedSlot) return true;
                    const totalVisitors = adultCount + childCount;
                    if (selectedSlot.available_capacity < totalVisitors) return true;
                    return false;
                  })()}
                  className="w-full py-3 rounded-lg font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ 
                    backgroundColor: (() => {
                      if (!selectedDate || !selectedSlot) return primaryColor;
                      const totalVisitors = adultCount + childCount;
                      if (selectedSlot.available_capacity < totalVisitors) return '#EF4444';
                      return primaryColor;
                    })(),
                  }}
                >
                  {(() => {
                    if (!selectedDate || !selectedSlot) {
                      return i18n.language === 'ar' ? 'اختر التاريخ والوقت' : 'Select Date & Time';
                    }
                    const totalVisitors = adultCount + childCount;
                    if (selectedSlot.available_capacity < totalVisitors) {
                      return i18n.language === 'ar' ? 'السعة غير كافية' : 'Insufficient Capacity';
                    }
                    return i18n.language === 'ar' ? 'المتابعة للدفع' : 'Proceed to Checkout';
                  })()}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Service Details Section - Similar to reference page */}
        <div className="mt-12 bg-white rounded-lg shadow-sm">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <div className="flex items-center gap-4 px-6">
              <button 
                onClick={() => setActiveTab('details')}
                className={`px-4 py-4 font-medium transition-colors ${
                  activeTab === 'details' 
                    ? 'text-gray-900 border-b-2' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                style={activeTab === 'details' ? { borderColor: primaryColor } : {}}
              >
                {i18n.language === 'ar' ? 'التفاصيل' : 'Details'}
              </button>
              <button 
                onClick={() => setActiveTab('reviews')}
                className={`px-4 py-4 font-medium transition-colors ${
                  activeTab === 'reviews' 
                    ? 'text-gray-900 border-b-2' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                style={activeTab === 'reviews' ? { borderColor: primaryColor } : {}}
              >
                {i18n.language === 'ar' ? 'المراجعات' : 'Reviews'}
                {reviews.length > 0 && (
                  <span className="ml-2 text-sm text-gray-500">({reviews.length})</span>
                )}
              </button>
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'details' ? (
              <div className="prose max-w-none">
                <p className="text-gray-700 leading-relaxed mb-4">
                  {i18n.language === 'ar' ? service.description_ar : service.description}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {reviewsLoading ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">{i18n.language === 'ar' ? 'جاري التحميل...' : 'Loading reviews...'}</p>
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">
                      {i18n.language === 'ar' 
                        ? 'لا توجد مراجعات بعد. كن أول من يكتب مراجعة!' 
                        : 'No reviews yet. Be the first to write a review!'}
                    </p>
                  </div>
                ) : (
                  reviews.map((review) => {
                    const isExpanded = expandedReviews[review.id] || false;
                    const reviewText = i18n.language === 'ar' 
                      ? (review.comment_ar || review.comment || '')
                      : (review.comment || review.comment_ar || '');
                    const shouldTruncate = reviewText.length > 200;
                    const displayText = isExpanded || !shouldTruncate 
                      ? reviewText 
                      : reviewText.substring(0, 200) + '...';
                    
                    // Parse image_url - could be a single image or multiple images (JSON array or comma-separated)
                    let images: string[] = [];
                    if (review.image_url) {
                      console.log('Review image_url found:', review.image_url.substring(0, 100) + '...');
                      try {
                        // Check if it's already a data URL (starts with data:)
                        if (review.image_url.startsWith('data:')) {
                          images = [review.image_url];
                          console.log('Image is data URL, added to images array');
                        } else {
                          // Try to parse as JSON array
                          const parsed = JSON.parse(review.image_url);
                          if (Array.isArray(parsed)) {
                            images = parsed;
                            console.log('Image is JSON array, parsed:', images.length, 'images');
                          } else {
                            images = [review.image_url];
                            console.log('Image is single string, added to array');
                          }
                        }
                      } catch (e) {
                        console.log('Error parsing image_url, trying comma-separated:', e);
                        // If not JSON, check if it's comma-separated
                        if (review.image_url.includes(',') && !review.image_url.startsWith('data:')) {
                          images = review.image_url.split(',').map((img: string) => img.trim());
                          console.log('Image is comma-separated, split into:', images.length, 'images');
                        } else {
                          images = [review.image_url];
                          console.log('Image is single string (fallback), added to array');
                        }
                      }
                    } else {
                      console.log('No image_url for review:', review.id);
                    }
                    console.log('Final images array length:', images.length);

                    return (
                      <div key={review.id} className="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0">
                        <div className="flex items-start gap-4">
                          {/* User Avatar - Green circle like reference */}
                          <div className="flex-shrink-0">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-sm">
                              <span className="text-white font-bold text-lg">
                                {(review.customer_name || review.customer_name_ar || 'U').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          
                          {/* Review Content */}
                          <div className="flex-1">
                            {/* Name, Date, Verified, Edit/Delete buttons */}
                            <div className="mb-2">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-gray-900">
                                    {i18n.language === 'ar' 
                                      ? (review.customer_name_ar || review.customer_name || 'مستخدم')
                                      : (review.customer_name || review.customer_name_ar || 'User')}
                                  </h4>
                                  <span className="text-xs text-gray-500">
                                    {review.created_at ? format(new Date(review.created_at), i18n.language === 'ar' ? 'MMM yyyy' : 'MMM yyyy') : ''}
                                  </span>
                                  {review.booking_id && (
                                    <span className="text-xs text-green-600 font-medium">
                                      • {i18n.language === 'ar' ? 'حجز مؤكد' : 'Verified booking'}
                                    </span>
                                  )}
                                </div>
                                {/* Edit/Delete buttons - Show for current user's reviews OR service provider */}
                                {((isLoggedIn && userProfile?.id === review.customer_id) || isServiceProvider) && (
                                  <div className="flex items-center gap-2">
                                    {/* Edit button - Only for review owner */}
                                    {isLoggedIn && userProfile?.id === review.customer_id && (
                                      <button
                                        onClick={() => {
                                          // Parse existing images
                                          let existingImages: string[] = [];
                                          if (review.image_url) {
                                            try {
                                              if (review.image_url.startsWith('data:')) {
                                                existingImages = [review.image_url];
                                              } else {
                                                const parsed = JSON.parse(review.image_url);
                                                existingImages = Array.isArray(parsed) ? parsed : [review.image_url];
                                              }
                                            } catch {
                                              existingImages = [review.image_url];
                                            }
                                          }
                                          setEditingReview({
                                            id: review.id,
                                            rating: review.rating,
                                            comment: review.comment,
                                            comment_ar: review.comment_ar,
                                            images: existingImages,
                                          });
                                        }}
                                        className="text-gray-500 hover:text-blue-600 transition-colors p-1"
                                        aria-label="Edit review"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                    )}
                                    {/* Delete button - For review owner OR service provider */}
                                    <button
                                      onClick={async () => {
                                        const confirmMessage = isServiceProvider && userProfile?.id !== review.customer_id
                                          ? (i18n.language === 'ar' ? 'هل أنت متأكد من حذف هذه المراجعة؟ (أنت تحذف كـ service provider)' : 'Are you sure you want to delete this review? (You are deleting as service provider)')
                                          : (i18n.language === 'ar' ? 'هل أنت متأكد من حذف هذه المراجعة؟' : 'Are you sure you want to delete this review?');
                                        if (window.confirm(confirmMessage)) {
                                          try {
                                            const token = localStorage.getItem('auth_token');
                                            const response = await fetch(`${API_URL}/reviews/${review.id}`, {
                                              method: 'DELETE',
                                              headers: {
                                                'Authorization': `Bearer ${token}`,
                                              },
                                            });
                                            if (response.ok) {
                                              fetchReviews(); // Refresh reviews
                                              if (service) {
                                                fetchData(); // Refresh service data to update average rating/total reviews
                                              }
                                            } else {
                                              const data = await response.json();
                                              alert(data.error || 'Failed to delete review');
                                            }
                                          } catch (error: any) {
                                            alert('Failed to delete review: ' + error.message);
                                          }
                                        }
                                      }}
                                      className="text-gray-500 hover:text-red-600 transition-colors p-1"
                                      aria-label="Delete review"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              {/* Star Rating - Pink stars like reference */}
                              <div className="flex items-center gap-1">
                                <StarRating rating={review.rating} size="sm" />
                                <span className="text-sm text-gray-500 ml-1">
                                  {review.rating}/5
                                </span>
                              </div>
                            </div>
                            
                            {/* Review Text with Read More */}
                            {reviewText && (
                              <div className="mb-3">
                                <p className="text-gray-700 leading-relaxed text-sm">
                                  {displayText}
                                </p>
                                {shouldTruncate && (
                                  <button
                                    onClick={() => setExpandedReviews(prev => ({ ...prev, [review.id]: !isExpanded }))}
                                    className="text-sm text-blue-600 hover:text-blue-700 mt-1 font-medium"
                                  >
                                    {isExpanded 
                                      ? (i18n.language === 'ar' ? 'اقرأ أقل -' : 'Read less -')
                                      : (i18n.language === 'ar' ? 'اقرأ المزيد +' : 'Read more +')}
                                  </button>
                                )}
                              </div>
                            )}
                            
                            {/* Images Grid - 3 small images in a row like reference */}
                            {images.length > 0 && (
                              <div className="mt-4">
                                <div className={`flex gap-2 ${
                                  images.length === 1 ? 'justify-start' :
                                  images.length === 2 ? 'justify-start' :
                                  'justify-start'
                                }`}>
                                  {images.slice(0, 3).map((imageUrl, idx) => (
                                    <div 
                                      key={idx}
                                      className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity group flex-shrink-0"
                                      onClick={() => {
                                        setStoryModal({
                                          isOpen: true,
                                          images: images,
                                          review: review,
                                        });
                                      }}
                                    >
                                      <img 
                                        src={imageUrl} 
                                        alt={`Review ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          console.error('Failed to load review image:', imageUrl);
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                        onLoad={() => {
                                          console.log('Review image loaded successfully:', imageUrl);
                                        }}
                                      />
                                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity" />
                                    </div>
                                  ))}
                                </div>
                                {images.length > 3 && (
                                  <p className="text-xs text-gray-500 mt-2">
                                    +{images.length - 3} {i18n.language === 'ar' ? 'صور إضافية' : 'more images'}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Write a Review Section - Only for logged-in users */}
        {isLoggedIn && service && tenant ? (
          <div className="mt-8 bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {i18n.language === 'ar' ? 'اكتب مراجعة' : 'Write a Review'}
            </h3>
            <p className="text-gray-600 mb-4">
              {i18n.language === 'ar' 
                ? 'شاركنا تجربتك مع هذه الخدمة' 
                : 'Share your experience with this service'}
            </p>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('📝 Opening review form...', {
                  serviceId: service?.id,
                  tenantId: tenant?.id,
                  isLoggedIn,
                  userProfile: userProfile?.id
                });
                setShowTestimonialForm(true);
              }}
              variant="primary"
              type="button"
            >
              {i18n.language === 'ar' ? 'اكتب مراجعة' : 'Write a Review'}
            </Button>
          </div>
        ) : (
          !isLoggedIn && (
            <div className="mt-8 bg-blue-50 rounded-lg shadow-sm p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {i18n.language === 'ar' ? 'اكتب مراجعة' : 'Write a Review'}
              </h3>
              <p className="text-gray-600 mb-4">
                {i18n.language === 'ar' 
                  ? 'يرجى تسجيل الدخول لكتابة مراجعة' 
                  : 'Please log in to write a review'}
              </p>
              <Button
                onClick={() => navigate(`/${tenantSlug}/customer/login`)}
                variant="primary"
                type="button"
              >
                {i18n.language === 'ar' ? 'تسجيل الدخول' : 'Log In'}
              </Button>
            </div>
          )
        )}

        {/* Comments/Notes Section at the bottom - Similar to reference page */}
        <div className="mt-8 bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {i18n.language === 'ar' ? 'معلومات مهمة' : 'Important Information'}
          </h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                {i18n.language === 'ar' ? 'ما يجب إحضاره' : 'What to bring'}
              </h4>
              <ul className="space-y-1 text-sm text-gray-600 ml-4">
                <li>• {i18n.language === 'ar' ? 'يرجى إحضار هوية صالحة (فيزيائية أو رقمية) لتقديمها عند مدخل المكان' : 'Please bring a valid physical or digital copy of your ID to be shown at the entrance'}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                {i18n.language === 'ar' ? 'ما غير مسموح' : 'What\'s not allowed'}
              </h4>
              <ul className="space-y-1 text-sm text-gray-600 ml-4">
                <li>• {i18n.language === 'ar' ? 'لا يُسمح بإحضار أمتعة كبيرة، ولكن يمكنك إيداعها في منطقة الأمتعة الآمنة في الطابق الأرضي' : 'No large pieces of luggage are allowed inside, but you can check them in at the Secure Baggage Area'}</li>
                <li>• {i18n.language === 'ar' ? 'لا يُسمح بإحضار طعام أو مشروبات من الخارج' : 'No outside food or beverages are allowed'}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                {i18n.language === 'ar' ? 'معلومات إضافية' : 'Additional information'}
              </h4>
              <ul className="space-y-1 text-sm text-gray-600 ml-4">
                <li>• {i18n.language === 'ar' ? 'يرجى الوصول قبل 15 دقيقة من وقت الحجز المحدد لتجنب أي تأخير' : 'Please arrive 15 minutes before your scheduled time to avoid any delays'}</li>
                <li>• {i18n.language === 'ar' ? 'يمكن إلغاء الحجز أو إعادة جدولته حتى 24 ساعة قبل الموعد المحدد' : 'You can cancel or reschedule your booking up to 24 hours before the scheduled time'}</li>
                <li>• {i18n.language === 'ar' ? 'سيتم إرسال تأكيد الحجز إلى بريدك الإلكتروني فوراً' : 'Your booking confirmation will be emailed to you instantly'}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Testimonial Form Modal */}
      {showTestimonialForm && service && tenant && (
        <TestimonialForm
          serviceId={service.id}
          tenantId={tenant.id}
          onClose={() => {
            console.log('📝 Closing review form...');
            setShowTestimonialForm(false);
          }}
          onSuccess={() => {
            console.log('✅ Review submitted successfully!');
            setShowTestimonialForm(false);
            // Refresh reviews and service data
            fetchReviews();
            if (service) {
              fetchData();
            }
          }}
        />
      )}

      {/* Review Image Story Modal */}
      {storyModal.isOpen && storyModal.review && (
        <ReviewImageStory
          isOpen={storyModal.isOpen}
          onClose={() => setStoryModal({ isOpen: false, images: [], review: null })}
          images={storyModal.images}
          review={storyModal.review}
          language={i18n.language as 'en' | 'ar'}
          autoPlayInterval={5000}
        />
      )}

      {/* Edit Review Modal */}
      {editingReview && service && tenant && (
        <TestimonialForm
          serviceId={service.id}
          tenantId={tenant.id}
          reviewId={editingReview.id}
          initialRating={editingReview.rating}
          initialComment={editingReview.comment}
          initialCommentAr={editingReview.comment_ar}
          initialImages={editingReview.images}
          onClose={() => setEditingReview(null)}
          onSuccess={() => {
            setEditingReview(null);
            fetchReviews(); // Refresh reviews after editing
            if (service) {
              fetchData(); // Refresh service data to update average rating
            }
          }}
        />
      )}
    </div>
  );
}
