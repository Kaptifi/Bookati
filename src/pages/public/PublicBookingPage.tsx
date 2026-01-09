import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { Calendar, Clock, CheckCircle, Phone, Mail, MapPin, Facebook, Twitter, Instagram, User, Edit2, Trash2, UserPlus, Package, X, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ImageCarousel } from '../../components/ui/ImageCarousel';
import { ImageGallery } from '../../components/ui/ImageGallery';
import { StarRating } from '../../components/ui/StarRating';
import { AnimatedRating } from '../../components/ui/AnimatedRating';
import { ServiceBadges, BadgeType } from '../../components/ui/ServiceBadge';
import { VideoEmbed } from '../../components/ui/VideoEmbed';
import { TestimonialsCarousel, Testimonial } from '../../components/ui/TestimonialsCarousel';
import { FAQ, FAQItem } from '../../components/ui/FAQ';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { TestimonialForm } from '../../components/reviews/TestimonialForm';
import { ReviewsCarousel } from '../../components/reviews/ReviewsCarousel';

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
  duration_minutes: number;
  gallery_urls?: string[];
  badges?: Array<{ type: string; label?: string }>;
  average_rating?: number;
  total_reviews?: number;
  original_price?: number;
  discount_percentage?: number;
  image_url?: string;
  is_offer?: boolean;
  offer_id?: string;
  service_id?: string; // For offers, this is the parent service ID
  perks?: string[];
  perks_ar?: string[];
  badge?: string;
  badge_ar?: string;
  closing_time?: string;
  meeting_point?: string;
  meeting_point_ar?: string;
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

interface AggregatedSlot {
  timeRange: string;
  start_time: string;
  end_time: string;
  totalCapacity: number;
  slots: Slot[];
}

interface ServicePackage {
  id: string;
  name: string;
  name_ar: string;
  description?: string;
  description_ar?: string;
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

// Helper function to format package name (consistent across all pages)
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

export function PublicBookingPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const isLoggedIn = userProfile?.role === 'customer';
  const isServiceProvider = userProfile?.role === 'tenant_admin' || userProfile?.role === 'receptionist' || userProfile?.role === 'cashier';
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [aggregatedSlots, setAggregatedSlots] = useState<AggregatedSlot[]>([]);
  const [selectedAggregatedSlot, setSelectedAggregatedSlot] = useState<AggregatedSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  const [bookingForm, setBookingForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    visitor_count: 1,
    notes: '',
    booking_option: 'consecutive' as 'consecutive' | 'parallel'
  });
  const [showCreateAccountPrompt, setShowCreateAccountPrompt] = useState(false);
  
  // Booking lock state
  const [bookingLock, setBookingLock] = useState<{
    lock_id: string;
    session_id: string;
    slot_id: string;
    expires_at: string;
    seconds_remaining: number;
  } | null>(null);
  const [lockValidationInterval, setLockValidationInterval] = useState<NodeJS.Timeout | null>(null);
  const [serviceReviews, setServiceReviews] = useState<Record<string, any[]>>({});
  const [allReviews, setAllReviews] = useState<any[]>([]);
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});
  const [expandedServices, setExpandedServices] = useState<Record<string, boolean>>({});
  const [serviceDetailModal, setServiceDetailModal] = useState<{
    isOpen: boolean;
    service: Service | null;
  }>({ isOpen: false, service: null });
  const [storyModal, setStoryModal] = useState<{
    isOpen: boolean;
    images: string[];
    review: any;
  }>({ isOpen: false, images: [], review: null });
  const [editingReview, setEditingReview] = useState<any | null>(null);
  const [recommendedServices, setRecommendedServices] = useState<Service[]>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6); // Show 6 services per page
  const [imageLoadingStates, setImageLoadingStates] = useState<Record<string, boolean>>({});
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  // Filter services based on search query
  const filteredServices = services.filter(service => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const name = (service.name || '').toLowerCase();
    const nameAr = (service.name_ar || '').toLowerCase();
    const description = (service.description || '').toLowerCase();
    const descriptionAr = (service.description_ar || '').toLowerCase();
    return name.includes(query) || nameAr.includes(query) || 
           description.includes(query) || descriptionAr.includes(query);
  });

  // Calculate pagination for filtered services
  const totalPages = Math.ceil(filteredServices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedServices = filteredServices.slice(startIndex, endIndex);

  // Reset to page 1 when services or search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [services.length, searchQuery]);

  // Image Skeleton Component
  const ImageSkeleton = () => (
    <div className="w-full h-full bg-gray-200 animate-pulse flex items-center justify-center">
      <div className="w-16 h-16 bg-gray-300 rounded-full animate-pulse"></div>
    </div>
  );

  // Handle image load
  const handleImageLoad = (serviceId: string) => {
    setImageLoadingStates(prev => ({ ...prev, [serviceId]: false }));
  };

  // Set loading state when image starts loading
  const handleImageStartLoad = (serviceId: string) => {
    setImageLoadingStates(prev => ({ ...prev, [serviceId]: true }));
  };

  // Initialize loading state for paginated services
  useEffect(() => {
    paginatedServices.forEach(service => {
      if (service.image_url || (service.gallery_urls && service.gallery_urls.length > 0)) {
        if (imageLoadingStates[service.id] === undefined) {
          setImageLoadingStates(prev => ({ ...prev, [service.id]: true }));
        }
      }
    });
  }, [paginatedServices, currentPage]);

  useEffect(() => {
    fetchTenantAndServices();
  }, [tenantSlug]);

  // Track service view
  useEffect(() => {
    if (selectedService?.id) {
      trackServiceView(selectedService.id);
    }
  }, [selectedService]);

  // Fetch recommended services when services are loaded
  useEffect(() => {
    if (services.length > 0 && tenant?.id) {
      fetchRecommendedServices();
    }
  }, [services, tenant, userProfile]);

  // Fetch all reviews for all services
  useEffect(() => {
    if (services.length > 0) {
      fetchAllReviews();
    }
  }, [services]);

  useEffect(() => {
    if (selectedService && selectedDate) {
      fetchAvailableSlots();
    }
  }, [selectedService, selectedDate]);

  useEffect(() => {
    aggregateSlots();
  }, [slots]);

  // Auto-fill customer info if logged in
  useEffect(() => {
    if (isLoggedIn && userProfile) {
      setBookingForm(prev => ({
        ...prev,
        customer_name: userProfile.full_name || prev.customer_name,
        customer_email: userProfile.email || prev.customer_email,
        customer_phone: userProfile.phone || prev.customer_phone,
      }));
    }
  }, [isLoggedIn, userProfile]);

  // Cleanup lock on unmount
  useEffect(() => {
    return () => {
      if (bookingLock) {
        releaseLock(bookingLock.lock_id, bookingLock.session_id).catch(console.error);
      }
      if (lockValidationInterval) {
        clearInterval(lockValidationInterval);
      }
    };
  }, [bookingLock, lockValidationInterval]);

  async function fetchTenantAndServices() {
    if (!tenantSlug) return;

    try {
      setLoading(true);
      const { data: tenantData, error: tenantError } = await db
        .from('tenants')
        .select('id, name, name_ar, slug, landing_page_settings, is_active, maintenance_mode')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (tenantError) {
        console.error('Error fetching tenant:', tenantError);
        const errorMessage = tenantError?.message || 'Unknown error';
        console.error('Full tenant error:', tenantError);
        
        if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          alert('Network error. Please check if the backend server is running on port 3001.');
        } else {
          alert(`Failed to load tenant: ${errorMessage}. Please check the console for details.`);
        }
        setLoading(false);
        return;
      }
      if (!tenantData) {
        console.error('Tenant not found:', tenantSlug);
        alert(`Tenant "${tenantSlug}" not found. Please check the URL.`);
        setLoading(false);
        return;
      }

      // Check if tenant account is active
      if (tenantData.is_active === false) {
        console.error('Tenant account is deactivated:', tenantSlug);
        alert('This service provider account has been deactivated. Please contact support.');
        setLoading(false);
        navigate('/');
        return;
      }

      // Check if tenant is in maintenance mode
      if (tenantData.maintenance_mode === true) {
        console.log('Tenant is in maintenance mode:', tenantSlug);
        // Don't block the page, but we'll show a message and disable booking
      }

      setTenant(tenantData);

      // Try to select all fields, but handle missing columns gracefully
      const { data: servicesData, error: servicesError } = await db
        .from('services')
        .select('*')
        .eq('tenant_id', tenantData.id)
        .eq('is_active', true)
        .eq('is_public', true)
        .order('name');

      if (servicesError) {
        console.error('Error fetching services:', servicesError);
        const errorMessage = servicesError?.message || 'Unknown error';
        
        // If it's a column error, it means the migration hasn't been run
        if (errorMessage.includes('column') && errorMessage.includes('does not exist')) {
          console.warn('Database columns missing - migration may not have been applied');
          console.warn('Continuing with empty services list. Please run: database/migrations/add_modern_landing_page_features.sql');
          // Continue with empty services - page will still load
          setServices([]);
        } else {
          // For other errors, show a warning but continue
          console.warn('Error loading services, continuing with empty list:', errorMessage);
          setServices([]);
        }
        // Don't return - let the page render with empty services
      }
      
      // Parse JSON fields if they come as strings
      const parsedServices = (servicesData || []).map((service: any) => {
        try {
          // Debug: Log raw service data
          console.log('🔍 [Service Fetch] Raw service data:', {
            id: service.id,
            name: service.name,
            base_price: service.base_price,
            original_price: service.original_price,
            discount_percentage: service.discount_percentage,
            base_price_type: typeof service.base_price,
            original_price_type: typeof service.original_price,
            discount_percentage_type: typeof service.discount_percentage,
          });
          
          // Parse gallery_urls if it's a string
          let galleryUrls = service.gallery_urls || service.gallery_urls || null;
          if (typeof galleryUrls === 'string') {
            try {
              galleryUrls = JSON.parse(galleryUrls);
            } catch {
              galleryUrls = [];
            }
          }
          if (!Array.isArray(galleryUrls)) {
            galleryUrls = [];
          }
          
          // Parse badges if it's a string
          let badges = service.badges || null;
          if (typeof badges === 'string') {
            try {
              badges = JSON.parse(badges);
            } catch {
              badges = [];
            }
          }
          if (!Array.isArray(badges)) {
            badges = [];
          }
          
          // Parse pricing fields
          const originalPrice = service.original_price !== null && service.original_price !== undefined 
            ? parseFloat(String(service.original_price)) 
            : null;
          const discountPercentage = service.discount_percentage !== null && service.discount_percentage !== undefined 
            ? parseInt(String(service.discount_percentage)) 
            : null;
          
          const parsedService = {
            id: service.id,
            name: service.name || '',
            name_ar: service.name_ar || '',
            description: service.description || '',
            description_ar: service.description_ar || '',
            base_price: service.base_price ? parseFloat(String(service.base_price)) : 0,
            duration_minutes: service.duration_minutes || service.service_duration_minutes || 0,
            average_rating: service.average_rating || 0,
            total_reviews: service.total_reviews || 0,
            gallery_urls: galleryUrls,
            badges: badges,
            original_price: originalPrice,
            discount_percentage: discountPercentage,
            image_url: service.image_url || null,
          };
          
          console.log('🔍 [Service Fetch] Parsed service:', {
            id: parsedService.id,
            name: parsedService.name,
            base_price: parsedService.base_price,
            original_price: parsedService.original_price,
            discount_percentage: parsedService.discount_percentage,
          });
          
          return parsedService;
        } catch (parseError) {
          console.error('Error parsing service data:', parseError, service);
          return {
            id: service.id,
            name: service.name || '',
            name_ar: service.name_ar || '',
            description: service.description || '',
            description_ar: service.description_ar || '',
            base_price: service.base_price || 0,
            duration_minutes: service.duration_minutes || service.service_duration_minutes || 0,
            average_rating: 0,
            total_reviews: 0,
            gallery_urls: [],
            badges: [],
            original_price: null,
            discount_percentage: null,
            image_url: service.image_url || null,
          };
        }
      });
      
      // Filter out offers from services (offers should be displayed separately)
      const regularServices = parsedServices.filter((s: any) => !s.is_offer);
      setServices(regularServices);

      // Fetch packages
      try {
        const { data: packagesData, error: packagesError } = await db
          .from('service_packages')
          .select('id, name, name_ar, description, description_ar, total_price, original_price, discount_percentage, image_url, gallery_urls, is_active')
          .eq('tenant_id', tenantData.id)
          .eq('is_active', true);

        if (!packagesError && packagesData) {
          // Fetch package services for each package
          const packagesWithServices = await Promise.all(
            packagesData.map(async (pkg: any) => {
              try {
                const { data: packageServices, error: packageServicesError } = await db
                  .from('package_services')
                  .select('service_id, quantity, services (id, name, name_ar)')
                  .eq('package_id', pkg.id);

                if (packageServicesError) {
                  console.error(`Error fetching services for package ${pkg.id}:`, packageServicesError);
                }

                console.log(`Package ${pkg.id} services:`, packageServices);

                // Parse gallery_urls
                let galleryUrls: string[] = [];
                if (pkg.gallery_urls) {
                  if (Array.isArray(pkg.gallery_urls)) {
                    galleryUrls = pkg.gallery_urls.filter((img: any) => img && typeof img === 'string');
                  } else if (typeof pkg.gallery_urls === 'string') {
                    try {
                      const parsed = JSON.parse(pkg.gallery_urls);
                      if (Array.isArray(parsed)) {
                        galleryUrls = parsed.filter((img: any) => img && typeof img === 'string');
                      }
                    } catch {
                      galleryUrls = [];
                    }
                  }
                }
                if (galleryUrls.length === 0 && pkg.image_url) {
                  galleryUrls = [pkg.image_url];
                }

                // Map package services - handle nested structure
                const mappedServices = (packageServices || []).map((ps: any) => {
                  // Handle nested services object from Supabase
                  const serviceData = ps.services || {};
                  return {
                    service_id: ps.service_id,
                    service_name: serviceData.name || '',
                    service_name_ar: serviceData.name_ar || '',
                    quantity: ps.quantity || 1,
                  };
                }).filter((s: any) => s.service_id); // Filter out any invalid entries

                console.log(`Mapped services for package ${pkg.id}:`, mappedServices);

                return {
                  ...pkg,
                  gallery_urls: galleryUrls,
                  image_url: pkg.image_url || (galleryUrls.length > 0 ? galleryUrls[0] : null),
                  services: mappedServices,
                };
              } catch (err) {
                console.error(`Error fetching services for package ${pkg.id}:`, err);
                return {
                  ...pkg,
                  services: [],
                };
              }
            })
          );

          setPackages(packagesWithServices);
        } else if (packagesError) {
          console.warn('Error fetching packages:', packagesError);
          setPackages([]);
        }
      } catch (packagesErr: any) {
        console.warn('Error fetching packages:', packagesErr);
        setPackages([]);
      }
    } catch (err: any) {
      console.error('Error fetching tenant and services:', err);
      const errorMessage = err?.message || 'Unknown error';
      console.error('Full error details:', err);
      
      // Show more specific error message
      if (errorMessage.includes('column') || errorMessage.includes('does not exist')) {
        alert('Database schema mismatch. Please run the migration: database/migrations/add_modern_landing_page_features.sql');
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        alert('Network error. Please check if the backend server is running on port 3001.');
      } else {
        alert(`Failed to load page: ${errorMessage}. Please check the console for details.`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllReviews() {
    try {
      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Fetch reviews for all services - increase limit to get more reviews
      const reviewPromises = services.map(async (service) => {
        try {
          const response = await fetch(`${API_URL}/reviews/service/${service.id}?limit=50`, {
            headers,
          });
          if (response.ok) {
            const data = await response.json();
            return { serviceId: service.id, reviews: data };
          }
          return { serviceId: service.id, reviews: [] };
        } catch (error) {
          console.error(`Error fetching reviews for service ${service.id}:`, error);
          return { serviceId: service.id, reviews: [] };
        }
      });

      const results = await Promise.all(reviewPromises);
      const reviewsMap: Record<string, any[]> = {};
      const allReviewsList: any[] = [];
      
      results.forEach(({ serviceId, reviews }) => {
        reviewsMap[serviceId] = reviews;
        allReviewsList.push(...reviews);
      });

      console.log('📊 Reviews fetched:', {
        totalServices: services.length,
        totalReviews: allReviewsList.length,
        reviewsPerService: results.map(r => ({ serviceId: r.serviceId, count: r.reviews.length }))
      });

      setServiceReviews(reviewsMap);
      setAllReviews(allReviewsList);
    } catch (error) {
      console.error('Error fetching all reviews:', error);
    }
  }

  async function fetchAvailableSlots() {
    if (!tenant?.id || !selectedService?.id) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    const { data: shifts } = await db
      .from('shifts')
      .select('id, days_of_week')
      .eq('service_id', selectedService.id)
      .eq('is_active', true);

    const shiftIds = shifts?.map(s => s.id) || [];

    if (shiftIds.length === 0) {
      setSlots([]);
      return;
    }

    const { data } = await db
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
      .eq('tenant_id', tenant.id)
      .in('shift_id', shiftIds)
      .eq('slot_date', dateStr)
      .eq('is_available', true)
      .gt('available_capacity', 0)
      .order('start_time');

    // Fetch active locks for these slots to exclude locked ones
    const slotIds = (data || []).map(s => s.id);
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
    let availableSlots = (data || []).filter(slot =>
      slot.available_capacity > 0 && !lockedSlotIds.includes(slot.id)
    );

    // CRITICAL FIX: Filter slots to only include those that match shift days_of_week
    // This prevents showing slots for days that don't match the shift schedule
    if (shifts && shifts.length > 0) {
      // Create a map of shift_id -> days_of_week for quick lookup
      const shiftDaysMap = new Map<string, number[]>();
      shifts.forEach((shift: any) => {
        shiftDaysMap.set(shift.id, shift.days_of_week);
      });

      // Get day of week for selected date (0 = Sunday, 1 = Monday, etc.)
      const dayOfWeek = selectedDate.getDay();

      // Filter slots: only keep slots where the day matches the shift's days_of_week
      availableSlots = availableSlots.filter((slot: any) => {
        const slotShiftId = slot.shift_id;
        if (!slotShiftId) return false;

        const shiftDays = shiftDaysMap.get(slotShiftId);
        if (!shiftDays || shiftDays.length === 0) {
          return false;
        }

        // Check if this day matches the shift's days_of_week
        if (shiftDays.includes(dayOfWeek)) {
          return true;
        }

        // Day doesn't match the shift's days_of_week, filter it out
        console.warn(`Filtering out slot ${slot.id} on ${dateStr} (DOW=${dayOfWeek}) - doesn't match shift ${slotShiftId} days [${shiftDays.join(', ')}]`);
        return false;
      });
    }

    // Filter out past time slots for today only
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const isToday = dateStr === todayStr;
    
    if (isToday) {
      const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes since midnight
      console.log(`[PublicBookingPage] Filtering slots for today. Current time: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} (${currentTime} minutes), Date: ${dateStr}`);
      const beforeCount = availableSlots.length;
      availableSlots = availableSlots.filter((slot: any) => {
        if (!slot.start_time) {
          console.log(`[PublicBookingPage] Slot ${slot.id} has no start_time, keeping it`);
          return true; // Keep slots without start_time
        }
        // Handle time format: "HH:MM" or "HH:MM:SS"
        const timeParts = slot.start_time.split(':');
        const hours = parseInt(timeParts[0] || '0', 10);
        const minutes = parseInt(timeParts[1] || '0', 10);
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          console.log(`[PublicBookingPage] Slot ${slot.id} has invalid time format: ${slot.start_time}, keeping it`);
          return true; // Keep slots with invalid time
        }
        const slotTime = hours * 60 + minutes; // Slot time in minutes since midnight
        const shouldKeep = slotTime > currentTime;
        console.log(`[PublicBookingPage] Slot ${slot.id}: ${slot.start_time} (${hours}:${String(minutes).padStart(2, '0')} = ${slotTime} min) vs current (${currentTime} min) - ${shouldKeep ? 'KEEP' : 'FILTER OUT'}`);
        // Keep slot if its start time is in the future
        return shouldKeep;
      });
      console.log(`[PublicBookingPage] Filtered slots: ${beforeCount} -> ${availableSlots.length}`);
    }
    // For future dates, keep all slots (no filtering needed)

    setSlots(availableSlots);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant?.id || !selectedAggregatedSlot || !selectedService?.id) return;

    const quantity = bookingForm.visitor_count;
    const availableSlots = selectedAggregatedSlot.slots;

    // Validate lock is still active
    if (bookingLock) {
      try {
        const validationResponse = await fetch(
          `${API_URL}/bookings/lock/${bookingLock.lock_id}/validate?session_id=${bookingLock.session_id}`,
          {
            headers: {
              ...(isLoggedIn && { Authorization: `Bearer ${localStorage.getItem('auth_token')}` })
            }
          }
        );

        if (!validationResponse.ok) {
          const error = await validationResponse.json();
          alert(error.error || 'These tickets are no longer available. Please choose another option.');
          setIsModalOpen(false);
          setBookingLock(null);
          if (lockValidationInterval) {
            clearInterval(lockValidationInterval);
            setLockValidationInterval(null);
          }
          await fetchAvailableSlots();
          return;
        }
      } catch (err) {
        console.error('Lock validation error:', err);
        alert('Failed to validate reservation. Please try again.');
        return;
      }
    }

    try {
      // Clear lock validation interval
      if (lockValidationInterval) {
        clearInterval(lockValidationInterval);
        setLockValidationInterval(null);
      }

      // Check maintenance mode before creating booking
      if (tenant?.maintenance_mode) {
        throw new Error(
          i18n.language === 'ar'
            ? 'نحن حاليًا في وضع الصيانة. الحجوزات غير متاحة مؤقتًا. يرجى المحاولة مرة أخرى لاحقًا.'
            : 'Service provider is currently in maintenance mode. Bookings are temporarily unavailable. Please try again later.'
        );
      }

      // Verify lock matches the slot being booked
      if (bookingLock && bookingLock.slot_id !== availableSlots[0].id) {
        // Lock is for a different slot - this shouldn't happen, but handle it
        console.warn('Lock slot mismatch, releasing lock');
        await releaseLock(bookingLock.lock_id, bookingLock.session_id);
        setBookingLock(null);
        throw new Error('Slot selection changed. Please select a time slot again.');
      }

      if (quantity === 1) {
        const slot = availableSlots[0];
        await createBooking(
          slot, 
          quantity, 
          bookingLock?.lock_id || null,
          bookingLock?.session_id || null
        );
      } else if (availableSlots.length === 1 || bookingForm.booking_option === 'consecutive') {
        await handleConsecutiveBooking(quantity, bookingLock?.lock_id || null, bookingLock?.session_id || null);
      } else if (bookingForm.booking_option === 'parallel') {
        await handleParallelBooking(quantity, bookingLock?.lock_id || null, bookingLock?.session_id || null);
      }

      // Clear lock state
      setBookingLock(null);

      setBookingSuccess(true);
      setIsModalOpen(false);
      resetForm();
      await fetchAvailableSlots();
      
      // Show create account prompt if not logged in
      if (!isLoggedIn) {
        setTimeout(() => {
          setShowCreateAccountPrompt(true);
        }, 2000);
      }
    } catch (err: any) {
      console.error('Error creating booking:', err);
      
      // Release lock if booking failed
      if (bookingLock) {
        await releaseLock(bookingLock.lock_id, bookingLock.session_id);
        setBookingLock(null);
      }
      
      if (lockValidationInterval) {
        clearInterval(lockValidationInterval);
        setLockValidationInterval(null);
      }
      
      alert(`Error: ${err.message}`);
    }
  }

  // Acquire booking lock when user selects a slot (with retry mechanism)
  async function acquireLock(slotId: string, quantity: number, retries = 3): Promise<string> {
    const sessionId = isLoggedIn && userProfile?.id 
      ? userProfile.id 
      : `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${API_URL}/bookings/lock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(isLoggedIn && { Authorization: `Bearer ${localStorage.getItem('auth_token')}` })
          },
          body: JSON.stringify({
            slot_id: slotId,
            reserved_capacity: quantity
          })
        });

        if (!response.ok) {
          const error = await response.json();
          lastError = new Error(error.error || 'Failed to reserve slot');
          
          // Don't retry on 409 (conflict) - slot is already locked
          if (response.status === 409) {
            throw lastError;
          }
          
          // Retry on 500 errors or network issues
          if (attempt < retries && (response.status >= 500 || response.status === 0)) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
            continue;
          }
          
          throw lastError;
        }

        const lockData = await response.json();
        
        setBookingLock({
          lock_id: lockData.lock_id,
          session_id: lockData.session_id,
          slot_id: slotId,
          expires_at: lockData.expires_at,
          seconds_remaining: lockData.expires_in_seconds || 120
        });

        // Start lock validation interval
        startLockValidation(lockData.lock_id, lockData.session_id);

        return lockData.lock_id;
      } catch (error: any) {
        lastError = error;
        if (attempt === retries) {
          throw error;
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    throw lastError || new Error('Failed to acquire lock after retries');
  }

  // Validate lock periodically during checkout
  function startLockValidation(lockId: string, sessionId: string) {
    // Clear any existing interval
    if (lockValidationInterval) {
      clearInterval(lockValidationInterval);
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `${API_URL}/bookings/lock/${lockId}/validate?session_id=${sessionId}`,
          {
            headers: {
              ...(isLoggedIn && { Authorization: `Bearer ${localStorage.getItem('auth_token')}` })
            }
          }
        );

        if (!response.ok) {
          const error = await response.json();
          if (response.status === 409) {
            // Lock expired
            clearInterval(interval);
            setLockValidationInterval(null);
            setBookingLock(null);
            alert(error.error || 'These tickets are no longer available. Please choose another option.');
            setIsModalOpen(false);
            await fetchAvailableSlots();
            return;
          }
        }

        const validation = await response.json();
        if (validation.valid) {
          setBookingLock(prev => prev ? {
            ...prev,
            seconds_remaining: validation.seconds_remaining
          } : null);
        } else {
          clearInterval(interval);
          setLockValidationInterval(null);
          setBookingLock(null);
          alert('These tickets are no longer available. Please choose another option.');
          setIsModalOpen(false);
          await fetchAvailableSlots();
        }
      } catch (err) {
        console.error('Lock validation error:', err);
      }
    }, 5000); // Validate every 5 seconds

    setLockValidationInterval(interval);
  }

  // Release lock
  async function releaseLock(lockId: string, sessionId: string) {
    try {
      await fetch(`${API_URL}/bookings/lock/${lockId}/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isLoggedIn && { Authorization: `Bearer ${localStorage.getItem('auth_token')}` })
        },
        body: JSON.stringify({ session_id: sessionId })
      });
    } catch (err) {
      console.error('Failed to release lock:', err);
    }
  }

  async function createBooking(slot: Slot, quantity: number, lockId: string | null = null, sessionId: string | null = null) {
    const bookingData: any = {
      tenant_id: tenant!.id,
      service_id: selectedService!.id,
      slot_id: slot.id,
      employee_id: slot.employee_id,
      customer_name: bookingForm.customer_name,
      customer_phone: bookingForm.customer_phone,
      customer_email: bookingForm.customer_email || null,
      visitor_count: quantity,
      total_price: selectedService!.base_price * bookingForm.visitor_count,
      notes: bookingForm.notes || null,
      lock_id: lockId,
      session_id: sessionId,
      language: i18n.language // Customer's selected language
    };

    const response = await fetch(`${API_URL}/bookings/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(isLoggedIn && { Authorization: `Bearer ${localStorage.getItem('auth_token')}` })
      },
      body: JSON.stringify(bookingData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create booking');
    }

    return await response.json();
  }

  // Track service view in localStorage (for anonymous users) or database (for logged-in users)
  async function trackServiceView(serviceId: string) {
    try {
      const viewKey = `service_views_${tenant?.id || 'global'}`;
      const views = JSON.parse(localStorage.getItem(viewKey) || '[]');
      
      // Add view with timestamp
      const newView = {
        serviceId,
        timestamp: Date.now()
      };
      
      // Keep only last 50 views
      const updatedViews = [newView, ...views.filter((v: any) => v.serviceId !== serviceId)].slice(0, 50);
      localStorage.setItem(viewKey, JSON.stringify(updatedViews));
      
      // For logged-in users, also track in database (optional - can be added later)
      if (isLoggedIn && userProfile?.id) {
        // Could store in a service_views table if needed
        console.log('Tracked view for logged-in user:', { userId: userProfile.id, serviceId });
      }
    } catch (error) {
      console.error('Error tracking service view:', error);
    }
  }

  // Get recommended services based on user behavior
  async function fetchRecommendedServices() {
    if (!tenant?.id || services.length === 0) return;

    try {
      const recommendations: Service[] = [];
      const serviceScores = new Map<string, number>();

      // Get user's viewing history from localStorage
      const viewKey = `service_views_${tenant.id}`;
      const views = JSON.parse(localStorage.getItem(viewKey) || '[]');
      const viewedServiceIds = new Set(views.map((v: any) => v.serviceId));

      // Get user's booking history (if logged in)
      let bookedServiceIds: string[] = [];
      if (isLoggedIn && userProfile?.id) {
        try {
          const { data: bookings } = await db
            .from('bookings')
            .select('service_id')
            .eq('customer_id', userProfile.id)
            .eq('tenant_id', tenant.id)
            .eq('status', 'confirmed');
          
          bookedServiceIds = (bookings || []).map((b: any) => b.service_id);
        } catch (error) {
          console.error('Error fetching booking history:', error);
        }
      }

      // Get popular services (most booked)
      let popularServiceIds: string[] = [];
      try {
        const { data: popularBookings } = await db
          .from('bookings')
          .select('service_id')
          .eq('tenant_id', tenant.id)
          .eq('status', 'confirmed')
          .limit(100);
        
        // Count bookings per service
        const serviceCounts = new Map<string, number>();
        (popularBookings || []).forEach((b: any) => {
          serviceCounts.set(b.service_id, (serviceCounts.get(b.service_id) || 0) + 1);
        });
        
        // Sort by count and get top services
        popularServiceIds = Array.from(serviceCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([serviceId]) => serviceId);
      } catch (error) {
        console.error('Error fetching popular services:', error);
      }

      // Score services based on various factors
      services.forEach((service) => {
        let score = 0;

        // Exclude currently selected service
        if (selectedService?.id === service.id) {
          return;
        }

        // Boost if user has viewed this service (recent views get higher score)
        if (viewedServiceIds.has(service.id)) {
          const view = views.find((v: any) => v.serviceId === service.id);
          if (view) {
            const daysSinceView = (Date.now() - view.timestamp) / (1000 * 60 * 60 * 24);
            score += 50 * Math.exp(-daysSinceView / 7); // Decay over 7 days
          }
        }

        // Boost if user has booked this service
        if (bookedServiceIds.includes(service.id)) {
          score += 30;
        }

        // Boost if service is popular
        if (popularServiceIds.includes(service.id)) {
          const popularityRank = popularServiceIds.indexOf(service.id);
          score += 40 - (popularityRank * 3); // Higher score for more popular
        }

        // Boost if service is in same category as viewed/booked services
        // Note: category_id might not exist in Service interface, so we check safely
        const serviceCategoryId = (service as any).category_id;
        const selectedCategoryId = (selectedService as any)?.category_id;
        if (selectedCategoryId && serviceCategoryId === selectedCategoryId) {
          score += 20;
        }

        // Boost if price is similar to viewed/booked services
        const viewedServices = services.filter(s => viewedServiceIds.has(s.id) || bookedServiceIds.includes(s.id));
        if (viewedServices.length > 0) {
          const avgPrice = viewedServices.reduce((sum, s) => sum + (s.base_price || 0), 0) / viewedServices.length;
          const priceDiff = Math.abs((service.base_price || 0) - avgPrice);
          const priceRatio = avgPrice > 0 ? priceDiff / avgPrice : 1;
          if (priceRatio < 0.3) { // Within 30% of average price
            score += 15;
          }
        }

        // Boost services with good ratings
        if (service.average_rating && service.average_rating >= 4) {
          score += 10;
        }

        // Small boost for all services (ensures we always have recommendations)
        score += 1;

        serviceScores.set(service.id, score);
      });

      // Sort by score and get top recommendations
      const sortedServices = Array.from(serviceScores.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([serviceId]) => services.find(s => s.id === serviceId))
        .filter((s): s is Service => s !== undefined);

      // If we don't have enough recommendations, fill with random services
      if (sortedServices.length < 4) {
        const remaining = services
          .filter(s => !sortedServices.find(rs => rs.id === s.id) && s.id !== selectedService?.id)
          .sort(() => Math.random() - 0.5)
          .slice(0, 4 - sortedServices.length);
        sortedServices.push(...remaining);
      }

      setRecommendedServices(sortedServices.slice(0, 4));
    } catch (error) {
      console.error('Error fetching recommended services:', error);
      // Fallback to random services
      const fallback = services
        .filter(s => s.id !== selectedService?.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 4);
      setRecommendedServices(fallback);
    }
  }

  async function handleConsecutiveBooking(quantity: number, lockId: string | null = null, sessionId: string | null = null) {
    if (!selectedAggregatedSlot) return;

    const employee = selectedAggregatedSlot.slots[0];
    const startIdx = aggregatedSlots.findIndex(s => s.timeRange === selectedAggregatedSlot.timeRange);

    const slotsNeeded = aggregatedSlots.slice(startIdx, startIdx + quantity);

    if (slotsNeeded.length < quantity) {
      throw new Error(`Not enough consecutive slots available. Only ${slotsNeeded.length} available.`);
    }

    // For consecutive bookings, we only use the lock for the first slot
    // Subsequent slots are booked without locks (they should have capacity > 1)
    for (let i = 0; i < slotsNeeded.length; i++) {
      const aggSlot = slotsNeeded[i];
      const employeeSlot = aggSlot.slots.find(s => s.employee_id === employee.employee_id);
      if (!employeeSlot || employeeSlot.available_capacity === 0) {
        throw new Error('Employee not available for all required slots');
      }
      // Use lock only for first slot
      await createBooking(employeeSlot, 1, i === 0 ? lockId : null, i === 0 ? sessionId : null);
    }
  }

  async function handleParallelBooking(quantity: number, lockId: string | null = null, sessionId: string | null = null) {
    if (!selectedAggregatedSlot) return;

    const availableEmployeeSlots = selectedAggregatedSlot.slots.filter(s => s.available_capacity > 0);

    if (availableEmployeeSlots.length < quantity) {
      throw new Error(`Not enough employees available. Only ${availableEmployeeSlots.length} available.`);
    }

    // For parallel bookings, we only use the lock for the first slot
    // Other slots are booked without locks
    for (let i = 0; i < quantity; i++) {
      await createBooking(availableEmployeeSlots[i], 1, i === 0 ? lockId : null, i === 0 ? sessionId : null);
    }
  }

  function aggregateSlots() {
    const slotMap = new Map<string, Slot[]>();

    slots.forEach(slot => {
      const key = `${slot.start_time}-${slot.end_time}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, []);
      }
      slotMap.get(key)!.push(slot);
    });

    const aggregated: AggregatedSlot[] = [];
    slotMap.forEach((slotList, timeRange) => {
      const totalCapacity = slotList.reduce((sum, slot) => sum + slot.available_capacity, 0);
      if (totalCapacity > 0) {
        aggregated.push({
          timeRange,
          start_time: slotList[0].start_time,
          end_time: slotList[0].end_time,
          totalCapacity,
          slots: slotList
        });
      }
    });

    aggregated.sort((a, b) => a.start_time.localeCompare(b.start_time));
    setAggregatedSlots(aggregated);
  }

  function resetForm() {
    setBookingForm({
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      visitor_count: 1,
      notes: '',
      booking_option: 'consecutive'
    });
    setSelectedService(null);
    setSelectedSlot('');
    setSelectedAggregatedSlot(null);
    setSelectedDate(new Date());
    
    // Release lock and clear validation interval
    if (bookingLock) {
      releaseLock(bookingLock.lock_id, bookingLock.session_id).catch(console.error);
      setBookingLock(null);
    }
    if (lockValidationInterval) {
      clearInterval(lockValidationInterval);
      setLockValidationInterval(null);
    }
  }

  function getWeekDays() {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Tenant not found</h1>
          <p className="text-gray-600 mt-2">The booking page you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  // Parse landing_page_settings safely - only after tenant is loaded
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
  const heroVideoUrl = settings.hero_video_url || null;
  const heroImages = Array.isArray(settings.hero_images) 
    ? settings.hero_images 
    : (settings.hero_image_url ? [settings.hero_image_url] : []);
  const trustIndicators = settings.trust_indicators || {};
  const testimonials = Array.isArray(settings.testimonials) ? (settings.testimonials as Testimonial[]) : [];
  const faqItems = Array.isArray(settings.faq_items) ? (settings.faq_items as FAQItem[]) : [];
  const videoUrl = settings.video_url || null;

  // Calculate trust indicators from database reviews
  const calculatedRating = allReviews.length > 0
    ? allReviews.reduce((sum, review) => sum + (review.rating || 0), 0) / allReviews.length
    : 0;
  const calculatedReviewCount = allReviews.length;
  
  // Round rating to 1 decimal place
  const displayRating = calculatedRating > 0 ? Math.round(calculatedRating * 10) / 10 : 0;
  const displayReviewCount = calculatedReviewCount;

  return (
    <div className="min-h-screen bg-gray-50">
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
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
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

      {/* Hero Section */}
      <section className="relative py-20 md:py-32 px-4 overflow-hidden min-h-[500px] flex items-center">
        {/* Background: Video, Image Carousel, or Gradient */}
        {heroVideoUrl && heroVideoUrl.trim() ? (
          <div className="absolute inset-0 z-0">
            <VideoEmbed
              url={heroVideoUrl}
              className="w-full h-full"
              aspectRatio="16:9"
            />
            <div className="absolute inset-0 bg-black/50" />
          </div>
        ) : heroImages.length > 0 ? (
          <div className="absolute inset-0 z-0">
            {heroImages.length === 1 ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${heroImages[0]})` }}
              />
            ) : (
              <ImageCarousel
                images={heroImages}
                className="absolute inset-0"
                aspectRatio="auto"
                objectFit="cover"
                autoPlay={true}
                autoPlayInterval={5000}
                showDots={false}
                showArrows={false}
              />
            )}
            <div className="absolute inset-0 bg-black/50" />
          </div>
        ) : (
          <div
            className="absolute inset-0 z-0"
        style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
            }}
          />
        )}

        <div className="max-w-4xl mx-auto text-center text-white relative z-10">
          {/* Maintenance Mode Banner */}
          {tenant?.maintenance_mode && (
            <div className="mb-6 p-4 bg-yellow-500/90 backdrop-blur-sm rounded-lg border-2 border-yellow-400 shadow-lg">
              <p className="text-lg md:text-xl font-semibold text-yellow-900">
                {i18n.language === 'ar' 
                  ? '⚠️ نحن حاليًا في وضع الصيانة. الحجوزات غير متاحة مؤقتًا. يرجى المحاولة مرة أخرى لاحقًا.'
                  : '⚠️ We are currently in maintenance mode. Bookings are temporarily unavailable. Please try again later.'}
              </p>
            </div>
          )}

          {/* Trust Indicators - Calculated from database */}
          {trustIndicators.message && (
            <p className="text-lg md:text-xl mb-6 text-white/90 font-medium">
              {trustIndicators.message}
            </p>
          )}

          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            {i18n.language === 'ar'
              ? settings.hero_title_ar || 'مرحباً بك في خدماتنا'
              : settings.hero_title || 'Welcome to Our Services'}
          </h2>
          <p className="text-xl md:text-2xl mb-8 opacity-90 max-w-2xl mx-auto">
            {i18n.language === 'ar'
              ? settings.hero_subtitle_ar || 'احجز موعدك بسهولة عبر الإنترنت'
              : settings.hero_subtitle || 'Book your appointment online easily'}
          </p>
          <button
            onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })}
            className="text-lg px-6 md:px-8 py-3 shadow-lg hover:shadow-xl transition-all font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              backgroundColor: '#ffffff',
              color: primaryColor,
              border: `2px solid ${primaryColor}`,
              '--tw-ring-color': primaryColor,
            } as React.CSSProperties & { '--tw-ring-color': string }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = primaryColor;
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.color = primaryColor;
            }}
            onFocus={(e) => {
              e.currentTarget.style.setProperty('--tw-ring-color', primaryColor);
            }}
          >
            Book Now
          </button>
        </div>
      </section>

      {/* Services Section - Only show if enabled in settings */}
      {settings.show_services !== false && (
        <section id="services" className="py-16 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Package className="w-8 h-8 text-blue-600" />
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                  {i18n.language === 'ar' ? 'خدماتنا' : 'Our Services'}
                </h2>
              </div>
              <p className="text-lg text-gray-600">
                {i18n.language === 'ar' ? 'اختر الخدمة' : 'Choose Service'}
              </p>
            </div>

            {/* Search Bar */}
            {services.length > 0 && (
              <div className="mb-8 max-w-2xl mx-auto">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    type="text"
                    placeholder={i18n.language === 'ar' ? 'ابحث عن خدمة...' : 'Search services...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 pr-4 py-3 w-full text-lg border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <div className="mt-2 text-sm text-gray-600 text-center">
                    {i18n.language === 'ar' 
                      ? `تم العثور على ${filteredServices.length} خدمة`
                      : `Found ${filteredServices.length} service${filteredServices.length !== 1 ? 's' : ''}`
                    }
                  </div>
                )}
              </div>
            )}

            {services.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No Services Available</p>
              </div>
            ) : filteredServices.length === 0 ? (
              <div className="text-center py-12">
                <Search className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 text-lg mb-2">
                  {i18n.language === 'ar' 
                    ? `لم يتم العثور على خدمات تطابق "${searchQuery}"`
                    : `No services found matching "${searchQuery}"`
                  }
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-blue-600 hover:text-blue-700 underline mt-2"
                >
                  {i18n.language === 'ar' ? 'مسح البحث' : 'Clear search'}
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-6">
                  {paginatedServices.map((service) => {
                  try {
                    // Get images: use gallery_urls if available, fallback to image_url, or empty array
                    let serviceImages: string[] = [];
                    if (service.gallery_urls) {
                      if (Array.isArray(service.gallery_urls) && service.gallery_urls.length > 0) {
                        serviceImages = service.gallery_urls.filter((img: any) => img && typeof img === 'string');
                      }
                    }
                    if (serviceImages.length === 0 && service.image_url) {
                      serviceImages = [service.image_url];
                    }
                    
                    // Parse badges - ensure type is valid
                    let serviceBadges: Array<{ type: BadgeType; label?: string }> = [];
                    if (service.badges && Array.isArray(service.badges)) {
                      const validTypes: BadgeType[] = ['flexible-duration', 'book-now-pay-later', 'meals-included', 'guided-tour', 'free-cancellation', 'instant-confirmation', 'vip-access', 'custom'];
                      serviceBadges = service.badges
                        .filter((badge: any) => badge && badge.type && validTypes.includes(badge.type as BadgeType))
                        .map((badge: any) => ({
                          type: badge.type as BadgeType,
                          label: badge.label
                        }));
                    }
                    
                    const showFullDetails = expandedServices[service.id] || false;
                    const serviceReviewsList = serviceReviews[service.id] || [];
                    
                    // Calculate rating from actual reviews
                    const calculatedServiceRating = serviceReviewsList.length > 0
                      ? serviceReviewsList.reduce((sum, review) => sum + (review.rating || 0), 0) / serviceReviewsList.length
                      : service.average_rating || 0;
                    
                    const displayServiceRating = calculatedServiceRating > 0 ? Math.round(calculatedServiceRating * 10) / 10 : 0;
                    const displayServiceReviewCount = serviceReviewsList.length > 0 ? serviceReviewsList.length : (service.total_reviews || 0);
                    
                    // Check if this is an offer
                    const isOffer = service.is_offer || false;
                    const offerBadge = service.badge || service.badge_ar;
                    
                    return (
                      <div
                        key={service.id}
                        className={`bg-white rounded-lg shadow-lg overflow-hidden border-2 transition-all duration-300 ${
                          isOffer 
                            ? 'border-yellow-300 hover:border-yellow-400' 
                            : 'border-gray-200 hover:border-blue-400'
                        }`}
                        style={{
                          background: isOffer 
                            ? 'linear-gradient(to right, #fefce8 0%, #ffffff 100%)'
                            : 'linear-gradient(to right, #ffffff 0%, #f9fafb 100%)',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        }}
                      >
                        {/* Ticket-like design with perforated edge effect */}
                        <div className="flex flex-col md:flex-row">
                          {/* Left Section - Images (1/3 width) */}
                          <div className="relative md:w-1/3 h-64 md:h-80 overflow-hidden">
                            {serviceImages.length > 0 ? (
                              <div className="relative h-full w-full">
                                {serviceImages.length === 1 ? (
                                  <>
                                    {imageLoadingStates[service.id] !== false && (
                                      <ImageSkeleton />
                                    )}
                                    <img
                                      src={serviceImages[0]}
                                      alt={i18n.language === 'ar' ? service.name_ar : service.name}
                                      className={`w-full h-full object-cover transition-opacity duration-300 ${
                                        imageLoadingStates[service.id] === false ? 'opacity-100' : 'opacity-0 absolute inset-0'
                                      }`}
                                      loading="lazy"
                                      onLoad={() => handleImageLoad(service.id)}
                                      onLoadStart={() => {
                                        if (imageLoadingStates[service.id] === undefined) {
                                          handleImageStartLoad(service.id);
                                        }
                                      }}
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        handleImageLoad(service.id);
                                      }}
                                    />
                                  </>
                                ) : (
                                  <ImageCarousel
                                    images={serviceImages}
                                    className="h-full w-full"
                                    aspectRatio="auto"
                                    showDots={true}
                                    showArrows={true}
                                  />
                                )}
                                {/* Offer Badge */}
                                {isOffer && offerBadge && (
                                  <div className="absolute top-4 left-4 z-10">
                                    <span className="bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full text-xs font-bold shadow-md">
                                      {i18n.language === 'ar' ? (service.badge_ar || offerBadge) : offerBadge}
                                    </span>
                                  </div>
                                )}
                                {/* Category Badge */}
                                {serviceBadges.length > 0 && !isOffer && (
                                  <div className="absolute top-4 left-4">
                                    <span className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold text-gray-700">
                                      {serviceBadges[0].label || 'SERVICE'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                                <Package className="w-16 h-16 text-gray-400" />
                              </div>
                            )}
                            
                            {/* Perforated edge effect (ticket design) */}
                            <div className="absolute right-0 top-0 bottom-0 w-4 flex flex-col justify-around pointer-events-none">
                              {Array.from({ length: 8 }).map((_, i) => (
                                <div
                                  key={i}
                                  className="w-3 h-3 rounded-full bg-gray-50 border-2 border-gray-200"
                                  style={{ marginLeft: '-6px' }}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Right Section - Details (2/3 width) */}
                          <div className="md:w-2/3 p-6 flex flex-col">
                            {/* Header: Rating and Reviews */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                {displayServiceRating > 0 ? (
                                  <>
                                    <StarRating
                                      rating={displayServiceRating}
                                      showNumber={true}
                                      size="sm"
                                    />
                                    <span className="text-sm text-gray-600 underline">
                                      ({displayServiceReviewCount.toLocaleString()})
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-sm text-gray-500">No reviews yet</span>
                                )}
                              </div>
                              {isOffer && offerBadge && (
                                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold">
                                  {i18n.language === 'ar' ? (service.badge_ar || offerBadge) : offerBadge}
                                </span>
                              )}
                              {serviceBadges.length > 0 && !isOffer && (
                                <ServiceBadges badges={serviceBadges} size="sm" />
                              )}
                            </div>

                            {/* Service Name */}
                            <h3 className="text-2xl font-bold text-gray-900 mb-3">
                              {i18n.language === 'ar' ? service.name_ar : service.name}
                              {isOffer && (
                                <span className="ml-2 text-sm font-normal text-gray-500">
                                  ({i18n.language === 'ar' ? 'عرض خاص' : 'Special Offer'})
                                </span>
                              )}
                            </h3>

                            {/* Description */}
                            <p className={`text-gray-600 mb-4 ${showFullDetails ? '' : 'line-clamp-2'}`}>
                              {i18n.language === 'ar' ? service.description_ar : service.description}
                            </p>

                            {/* Offer Perks */}
                            {isOffer && service.perks && Array.isArray(service.perks) && service.perks.length > 0 && (
                              <div className="mb-4">
                                <ul className="text-sm text-gray-600 space-y-1">
                                  {(i18n.language === 'ar' ? (service.perks_ar || service.perks) : service.perks).slice(0, 3).map((perk: string, idx: number) => (
                                    <li key={idx} className="flex items-center gap-2">
                                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                                      <span>{perk}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Service Info */}
                            <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                <span>{service.duration_minutes} min</span>
                              </div>
                              {isOffer && service.closing_time && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  <span>{i18n.language === 'ar' ? 'إغلاق:' : 'Closes:'} {service.closing_time}</span>
                                </div>
                              )}
                            </div>

                            {/* Pricing Section */}
                            <div className="mt-auto pt-4 border-t border-gray-200">
                              <div className="flex items-end justify-between gap-4">
                                <div className="flex flex-col items-start">
                                  {(() => {
                                    // Debug: Log service pricing data
                                    console.log('🔍 [Pricing Debug] Service:', {
                                      id: service.id,
                                      name: service.name,
                                      base_price: service.base_price,
                                      original_price: service.original_price,
                                      discount_percentage: service.discount_percentage,
                                      base_price_type: typeof service.base_price,
                                      original_price_type: typeof service.original_price,
                                      discount_percentage_type: typeof service.discount_percentage,
                                    });
                                    
                                    // Check if there's a valid discount
                                    const originalPrice = service.original_price ? parseFloat(String(service.original_price)) : null;
                                    const basePrice = service.base_price ? parseFloat(String(service.base_price)) : 0;
                                    const discountPercentage = service.discount_percentage ? parseInt(String(service.discount_percentage)) : null;
                                    
                                    const hasOriginalPrice = originalPrice !== null && originalPrice > 0;
                                    const hasDiscount = discountPercentage !== null && discountPercentage > 0;
                                    const priceIsLower = hasOriginalPrice && originalPrice > basePrice;
                                    const showDiscount = (hasOriginalPrice && priceIsLower) || (hasDiscount && basePrice > 0);
                                    
                                    // Calculate discount percentage if not provided but original_price exists
                                    let finalDiscountPercentage = discountPercentage;
                                    if (hasOriginalPrice && priceIsLower && !finalDiscountPercentage) {
                                      finalDiscountPercentage = Math.round(((originalPrice - basePrice) / originalPrice) * 100);
                                    }
                                    
                                    console.log('🔍 [Pricing Debug] Calculated:', {
                                      hasOriginalPrice,
                                      hasDiscount,
                                      priceIsLower,
                                      showDiscount,
                                      finalDiscountPercentage,
                                    });
                                    
                                    if (showDiscount) {
                                      return (
                                        <>
                                          <span className="text-2xl font-bold mb-1" style={{ color: primaryColor }}>
                                            {basePrice} {t('service.currency')}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            {hasOriginalPrice && (
                                              <span className="text-sm text-gray-500 line-through">
                                                {originalPrice} {t('service.currency')}
                                              </span>
                                            )}
                                            {finalDiscountPercentage && finalDiscountPercentage > 0 && (
                                              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-semibold">
                                                {finalDiscountPercentage}% off
                                              </span>
                                            )}
                                          </div>
                                        </>
                                      );
                                    } else {
                                      return (
                                        <span className="text-2xl font-bold" style={{ color: primaryColor }}>
                                          {basePrice} {t('service.currency')}
                                        </span>
                                      );
                                    }
                                  })()}
                                </div>
                                
                                <div className="flex gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setServiceDetailModal({
                                        isOpen: true,
                                        service: service
                                      });
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                  >
                                    Show more
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // If it's an offer, navigate to parent service with offer ID
                                      if (service.is_offer && service.service_id) {
                                        navigate(`/${tenantSlug}/book/${service.service_id}?offer=${service.offer_id}`);
                                      } else {
                                        navigate(`/${tenantSlug}/book/${service.id}`);
                                      }
                                    }}
                                    className="px-6 py-2 font-semibold text-white rounded-lg transition-all hover:opacity-90"
                                    style={{ backgroundColor: primaryColor }}
                                  >
                                    Check availability
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  } catch (error) {
                    console.error('Error rendering service card:', error, service);
                    return null;
                  }
                })}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className={`p-2 rounded-lg transition-all ${
                        currentPage === 1
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm'
                      }`}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${
                              currentPage === pageNum
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className={`p-2 rounded-lg transition-all ${
                        currentPage === totalPages
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm'
                      }`}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    
                    <span className="ml-4 text-sm text-gray-600">
                      {i18n.language === 'ar' 
                        ? `صفحة ${currentPage} من ${totalPages}`
                        : `Page ${currentPage} of ${totalPages}`
                      }
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* Packages Section */}
      {packages.length > 0 && (
        <section id="packages" className="py-16 px-4 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Package className="w-8 h-8" style={{ color: primaryColor }} />
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                  {i18n.language === 'ar' ? 'باقاتنا' : 'Our Packages'}
                </h2>
              </div>
              <p className="text-lg text-gray-600">
                {i18n.language === 'ar' ? 'اختر باقة' : 'Choose Package'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {packages.map((pkg) => {
                // Format package name using the helper function (consistent with other pages)
                const packageDisplayName = formatPackageName(pkg, i18n.language);

                // Calculate save percentage for badge display
                let savePercentage = 0;
                if (pkg.original_price && pkg.original_price > pkg.total_price) {
                  savePercentage = Math.round(((pkg.original_price - pkg.total_price) / pkg.original_price) * 100);
                } else if (pkg.discount_percentage) {
                  savePercentage = pkg.discount_percentage;
                }

                const packageImages = pkg.gallery_urls && pkg.gallery_urls.length > 0 
                  ? pkg.gallery_urls 
                  : (pkg.image_url ? [pkg.image_url] : []);

                return (
                  <div
                    key={pkg.id}
                    className="bg-white rounded-lg shadow-lg overflow-hidden border-2 border-gray-200 hover:border-blue-400 transition-all duration-300 cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      // Navigate to dedicated package schedule page
                      if (tenantSlug && pkg.id) {
                        const url = `/${tenantSlug}/packages/${pkg.id}/schedule`;
                        navigate(url);
                      } else {
                        console.error('Missing tenantSlug or packageId');
                        alert(i18n.language === 'ar' 
                          ? 'خطأ في التنقل' 
                          : 'Navigation error');
                      }
                    }}
                  >
                    {/* Package Image */}
                    <div className="relative h-48 overflow-hidden">
                      {packageImages.length > 0 ? (
                        <img
                          src={packageImages[0]}
                          alt={packageDisplayName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                          <Package className="w-16 h-16 text-gray-400" />
                        </div>
                      )}
                      {savePercentage > 0 && (
                        <div className="absolute top-4 right-4">
                          <span className="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                            {i18n.language === 'ar' ? `وفر ${savePercentage}%` : `Save ${savePercentage}%`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Package Details */}
                    <div className="p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                        {packageDisplayName}
                      </h3>
                      
                      {pkg.description && (
                        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                          {i18n.language === 'ar' ? pkg.description_ar : pkg.description}
                        </p>
                      )}

                      {/* Price */}
                      <div className="flex items-center gap-2 mb-2">
                        {pkg.original_price && pkg.original_price > pkg.total_price && (
                          <span className="text-sm text-gray-400 line-through">
                            {pkg.original_price} {t('service.currency') || 'SAR'}
                          </span>
                        )}
                        <span className="text-xl font-bold" style={{ color: primaryColor }}>
                          {pkg.total_price} {t('service.currency') || 'SAR'}
                        </span>
                      </div>

                      {/* Included Services Count */}
                      {pkg.services && pkg.services.length > 0 && (
                        <p className="text-xs text-gray-500">
                          {i18n.language === 'ar' 
                            ? `${pkg.services.length} خدمة متضمنة`
                            : `${pkg.services.length} services included`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="py-16 md:py-24 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            {i18n.language === 'ar'
              ? settings.about_title_ar || 'معلومات عنا'
              : settings.about_title || 'About Us'}
          </h2>
          <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-3xl mx-auto">
            {i18n.language === 'ar'
              ? settings.about_description_ar || 'نقدم خدمات عالية الجودة مع فريق محترف'
              : settings.about_description || 'We provide quality services with professional staff'}
          </p>
        </div>
      </section>

      {/* Video Section */}
      {videoUrl && videoUrl.trim() && (
        <section className="py-16 md:py-24 px-4 bg-gray-50">
          <div className="max-w-5xl mx-auto">
            <VideoEmbed url={videoUrl} className="rounded-lg shadow-xl" />
          </div>
        </section>
      )}

      {/* Reviews Section - Show at bottom with carousel */}
      {(settings.show_testimonials && (allReviews.length > 0 || testimonials.length > 0)) && (
        <section className="py-16 md:py-24 px-4 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                {i18n.language === 'ar' ? 'آراء العملاء' : 'From happy customers'}
              </h2>
              {allReviews.length > 0 && (
                <p className="text-lg text-gray-600 font-medium">
                  {i18n.language === 'ar' 
                    ? `محبوب من ${allReviews.length}+ عميل` 
                    : `Loved by ${allReviews.length}+ customers`}
                </p>
              )}
              {trustIndicators.message && !allReviews.length && (
                <p className="text-lg text-gray-600">{trustIndicators.message}</p>
              )}
            </div>
            {allReviews.length > 0 ? (
              // Show all reviews in carousel grid layout (sorted by date, newest first)
              <div className="relative overflow-visible px-4 md:px-8 lg:px-12">
                <ReviewsCarousel
                  reviews={allReviews
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map(review => ({
                      ...review,
                      service_name: services.find(s => s.id === review.service_id)?.name,
                      service_name_ar: services.find(s => s.id === review.service_id)?.name_ar,
                    }))}
                  language={i18n.language as 'en' | 'ar'}
                  itemsPerPage={1}
                  onEdit={(review) => {
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
                    const reviewService = services.find(s => s.id === review.service_id);
                    if (reviewService && tenant) {
                      setEditingReview({
                        id: review.id,
                        serviceId: review.service_id,
                        tenantId: tenant.id,
                        rating: review.rating,
                        comment: review.comment,
                        comment_ar: review.comment_ar,
                        images: existingImages,
                      });
                    }
                  }}
                  onDelete={async (reviewId) => {
                    const confirmMessage = isServiceProvider
                      ? (i18n.language === 'ar' ? 'هل أنت متأكد من حذف هذه المراجعة؟ (أنت تحذف كـ service provider)' : 'Are you sure you want to delete this review? (You are deleting as service provider)')
                      : (i18n.language === 'ar' ? 'هل أنت متأكد من حذف هذه المراجعة؟' : 'Are you sure you want to delete this review?');
                    if (window.confirm(confirmMessage)) {
                      try {
                        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
                        const token = localStorage.getItem('auth_token');
                        const response = await fetch(`${API_URL}/reviews/${reviewId}`, {
                          method: 'DELETE',
                          headers: {
                            'Authorization': `Bearer ${token}`,
                          },
                        });
                        if (response.ok) {
                          fetchAllReviews();
                        } else {
                          const data = await response.json();
                          alert(data.error || 'Failed to delete review');
                        }
                      } catch (error: any) {
                        alert('Failed to delete review: ' + error.message);
                      }
                    }
                  }}
                  canEdit={isLoggedIn}
                  canDelete={isLoggedIn || isServiceProvider}
                  currentUserId={userProfile?.id}
                />
              </div>
            ) : (
              // Fallback to static testimonials from landing page settings
              <TestimonialsCarousel
                testimonials={testimonials}
                language={i18n.language as 'en' | 'ar'}
                autoPlay={true}
              />
            )}
          </div>
        </section>
      )}


      {/* FAQ Section */}
      {faqItems.length > 0 && (
        <section className="py-16 md:py-24 px-4 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                {i18n.language === 'ar' ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}
              </h2>
            </div>
            <FAQ
              items={faqItems}
              language={i18n.language as 'en' | 'ar'}
              allowMultipleOpen={false}
            />
          </div>
        </section>
      )}

      {/* Related Services Section */}
      {services.length > 1 && (
        <section className="py-16 md:py-24 px-4 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                {i18n.language === 'ar' ? 'خدمات أخرى قد تهمك' : 'You May Also Like'}
              </h2>
              <p className="text-lg text-gray-600">
                {i18n.language === 'ar' ? 'اكتشف المزيد من خدماتنا' : 'Discover more of our services'}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {services.slice(0, 4).map((service) => {
                let serviceImages: string[] = [];
                if (service.gallery_urls && Array.isArray(service.gallery_urls) && service.gallery_urls.length > 0) {
                  serviceImages = service.gallery_urls.filter((img: any) => img && typeof img === 'string');
                }
                if (serviceImages.length === 0 && service.image_url) {
                  serviceImages = [service.image_url];
                }
                
                const handleServiceClick = (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (service.id && tenantSlug) {
                    // If it's an offer, navigate to parent service with offer ID
                    if (service.is_offer && service.service_id) {
                      navigate(`/${tenantSlug}/book/${service.service_id}?offer=${service.offer_id}`);
                    } else {
                      navigate(`/${tenantSlug}/book/${service.id}`);
                    }
                  } else {
                    console.error('Missing service.id or tenantSlug:', { serviceId: service.id, tenantSlug });
                  }
                };
                
                return (
                  <div
                    key={service.id}
                    className="hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden group bg-white rounded-lg shadow-md"
                    onClick={handleServiceClick}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleServiceClick(e as any);
                      }
                    }}
                  >
                    {serviceImages.length > 0 && (
                      <div className="relative h-40 overflow-hidden">
                        <img
                          src={serviceImages[0]}
                          alt={i18n.language === 'ar' ? service.name_ar : service.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">
                        {i18n.language === 'ar' ? service.name_ar : service.name}
                      </h3>
                      <div className="text-lg font-bold" style={{ color: primaryColor }}>
                        {service.base_price} {t('service.currency')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {(settings.contact_email || settings.contact_phone || settings.social_facebook) && (
        <footer className="bg-gray-900 text-white py-12 md:py-16 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
              {/* Company Info */}
              <div>
                <h3 className="text-xl font-bold mb-4">
                  {i18n.language === 'ar' ? tenant.name_ar : tenant.name}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {i18n.language === 'ar'
                    ? settings.about_description_ar
                    : settings.about_description}
                </p>
              </div>

              {/* Contact */}
              {(settings.contact_email || settings.contact_phone) && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">
                    {i18n.language === 'ar' ? 'اتصل بنا' : 'Contact Us'}
                  </h3>
                  <div className="space-y-3">
                    {settings.contact_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <a href={`mailto:${settings.contact_email}`} className="text-gray-400 hover:text-white text-sm transition-colors">
                          {settings.contact_email}
                        </a>
                      </div>
                    )}
                    {settings.contact_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <a href={`tel:${settings.contact_phone}`} className="text-gray-400 hover:text-white text-sm transition-colors">
                          {settings.contact_phone}
                        </a>
                      </div>
                    )}
                    {tenant.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                        <span className="text-gray-400 text-sm">{tenant.address}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Social Media */}
              {(settings.social_facebook || settings.social_twitter || settings.social_instagram) && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">
                    {i18n.language === 'ar' ? 'تابعنا' : 'Follow Us'}
                  </h3>
                  <div className="flex gap-4">
                    {settings.social_facebook && (
                      <a href={settings.social_facebook} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                        <Facebook className="w-6 h-6" />
                      </a>
                    )}
                    {settings.social_twitter && (
                      <a href={settings.social_twitter} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                        <Twitter className="w-6 h-6" />
                      </a>
                    )}
                    {settings.social_instagram && (
                      <a href={settings.social_instagram} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                        <Instagram className="w-6 h-6" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Quick Links */}
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  {i18n.language === 'ar' ? 'روابط سريعة' : 'Quick Links'}
                </h3>
                <div className="space-y-2">
                  <a href="#services" className="block text-gray-400 hover:text-white text-sm transition-colors">
                    {i18n.language === 'ar' ? 'خدماتنا' : 'Our Services'}
                  </a>
                  <a href="#about" className="block text-gray-400 hover:text-white text-sm transition-colors">
                    {i18n.language === 'ar' ? 'معلومات عنا' : 'About Us'}
                  </a>
                  {faqItems.length > 0 && (
                    <a href="#faq" className="block text-gray-400 hover:text-white text-sm transition-colors">
                      {i18n.language === 'ar' ? 'الأسئلة الشائعة' : 'FAQ'}
                    </a>
              )}
            </div>
              </div>
            </div>

            {/* Payment Methods */}
            {settings.payment_methods && settings.payment_methods.length > 0 && (
              <div className="border-t border-gray-800 mt-8 pt-8">
                <p className="text-sm text-gray-400 mb-4">
                  {i18n.language === 'ar' ? 'طرق الدفع المقبولة' : 'We Accept'}
                </p>
                <div className="flex flex-wrap gap-3">
                  {settings.payment_methods.map((method: string, index: number) => (
                    <div key={index} className="bg-gray-800 px-3 py-1.5 rounded text-xs text-gray-300">
                      {method}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Copyright */}
            <div className="border-t border-gray-800 mt-8 pt-8 text-center">
              <p className="text-gray-400 text-sm">
                &copy; {new Date().getFullYear()} {i18n.language === 'ar' ? tenant.name_ar : tenant.name}. {i18n.language === 'ar' ? 'جميع الحقوق محفوظة' : 'All rights reserved'}.
              </p>
            </div>
          </div>
        </footer>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          // Release lock when modal closes
          if (bookingLock) {
            releaseLock(bookingLock.lock_id, bookingLock.session_id).catch(console.error);
            setBookingLock(null);
          }
          if (lockValidationInterval) {
            clearInterval(lockValidationInterval);
            setLockValidationInterval(null);
          }
          setIsModalOpen(false);
          resetForm();
        }}
        title={selectedService ? (i18n.language === 'ar' ? selectedService.name_ar : selectedService.name) : 'Book Service'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {selectedService && (
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">
                    {i18n.language === 'ar' ? selectedService.name_ar : selectedService.name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {selectedService.duration_minutes} {t('booking.minutes')} • {selectedService.base_price} {t('service.currency')}
                  </p>
                </div>
              </div>
              
              {/* Lock countdown timer */}
              {bookingLock && selectedAggregatedSlot && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">
                        {t('booking.reservedFor') || 'Reserved for'}: {bookingLock.seconds_remaining}s
                      </span>
                    </div>
                    <div className="text-xs text-blue-700">
                      {t('booking.completeBooking') || 'Complete booking within'} {Math.floor(bookingLock.seconds_remaining / 60)}:{(bookingLock.seconds_remaining % 60).toString().padStart(2, '0')}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Select Date *
            </label>
            <div className="grid grid-cols-7 gap-2">
              {getWeekDays().map((day) => (
                <button
                  key={day.toString()}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className={`p-2 text-center rounded-lg border ${
                    isSameDay(day, selectedDate)
                      ? 'text-white border-transparent'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  style={isSameDay(day, selectedDate) ? { backgroundColor: primaryColor } : {}}
                >
                  <div className="text-xs">{format(day, 'EEE')}</div>
                  <div className="text-lg font-medium">{format(day, 'd')}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Available Time Slots *
            </label>
            {aggregatedSlots.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No Available Slots</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {aggregatedSlots.map((aggSlot) => (
                  <button
                    key={aggSlot.timeRange}
                    type="button"
                    onClick={async () => {
                      // Acquire lock when user selects a slot (proceeds to checkout)
                      // Lock is acquired for the requested quantity
                      try {
                        // For aggregated slots, we need to determine which specific slot to lock
                        // Strategy: Lock the slot with the most available capacity that can accommodate the request
                        const quantity = bookingForm.visitor_count;
                        let slotToLock = aggSlot.slots[0];
                        
                        // Find a slot with enough capacity
                        const suitableSlot = aggSlot.slots.find(s => s.available_capacity >= quantity);
                        if (suitableSlot) {
                          slotToLock = suitableSlot;
                        } else {
                          // If no single slot has enough, we'll need to handle this differently
                          // For now, use the slot with most capacity
                          slotToLock = aggSlot.slots.reduce((prev, curr) => 
                            curr.available_capacity > prev.available_capacity ? curr : prev
                          );
                        }
                        
                        await acquireLock(slotToLock.id, quantity);
                        setSelectedAggregatedSlot(aggSlot);
                      } catch (err: any) {
                        console.error('Failed to acquire lock:', err);
                        alert(err.message || 'Failed to reserve this time slot. Please try another time.');
                        setSelectedAggregatedSlot(null);
                        // Refresh slots to show updated availability
                        await fetchAvailableSlots();
                      }
                    }}
                    className={`p-3 text-left rounded-lg border ${
                      selectedAggregatedSlot?.timeRange === aggSlot.timeRange
                        ? 'text-white border-transparent'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                    style={selectedAggregatedSlot?.timeRange === aggSlot.timeRange ? { backgroundColor: primaryColor } : {}}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4" />
                      <span className="font-medium">{aggSlot.start_time} - {aggSlot.end_time}</span>
                    </div>
                    <div className="text-xs opacity-90">
                      {aggSlot.totalCapacity} {t('booking.spotsLeft')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Input
            label="Your Name *"
            value={bookingForm.customer_name}
            onChange={(e) => setBookingForm({ ...bookingForm, customer_name: e.target.value })}
            required
            placeholder="John Doe"
          />

          <PhoneInput
            label="Phone Number *"
            value={bookingForm.customer_phone}
            onChange={(value) => setBookingForm({ ...bookingForm, customer_phone: value })}
            defaultCountry="+966"
            required
          />

          <Input
            label="Email Address"
            type="email"
            value={bookingForm.customer_email}
            onChange={(e) => setBookingForm({ ...bookingForm, customer_email: e.target.value })}
            placeholder="john@example.com (optional)"
          />

          <Input
            label="Quantity *"
            type="number"
            min="1"
            value={bookingForm.visitor_count}
            onChange={(e) => setBookingForm({ ...bookingForm, visitor_count: parseInt(e.target.value) })}
            required
          />

          {bookingForm.visitor_count > 1 && selectedAggregatedSlot && selectedAggregatedSlot.slots.length > 1 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Booking Option *
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setBookingForm({ ...bookingForm, booking_option: 'parallel' })}
                  className={`p-3 text-left rounded-lg border ${
                    bookingForm.booking_option === 'parallel'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{t('booking.parallelMultipleEmployees')}</div>
                  <div className="text-sm text-gray-600">
                    {t('booking.parallelDescription', { count: bookingForm.visitor_count })}
                    ({t('booking.employeesAvailable', { count: selectedAggregatedSlot.slots.length })})
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setBookingForm({ ...bookingForm, booking_option: 'consecutive' })}
                  className={`p-3 text-left rounded-lg border ${
                    bookingForm.booking_option === 'consecutive'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{t('booking.consecutiveSingleEmployee')}</div>
                  <div className="text-sm text-gray-600">
                    {t('booking.consecutiveDescription', { count: bookingForm.visitor_count })}
                  </div>
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Edit2 className="w-4 h-4" />
              Additional Notes
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              value={bookingForm.notes}
              onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
              placeholder="Any special requests..."
            />
          </div>

          {selectedService && bookingForm.visitor_count > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-blue-900">Total Price:</span>
                <span className="text-2xl font-bold text-blue-900">
                  {selectedService.base_price * bookingForm.visitor_count} {t('service.currency')}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              fullWidth
              disabled={!selectedAggregatedSlot}
              style={{ backgroundColor: primaryColor }}
            >
              Confirm Booking
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={bookingSuccess}
        onClose={() => setBookingSuccess(false)}
        title="Booking Confirmed!"
      >
        <div className="text-center py-6">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Your booking has been submitted successfully!
          </h3>
          <p className="text-gray-600 mb-6">
            We will contact you shortly to confirm your appointment.
          </p>
          <Button
            fullWidth
            onClick={() => setBookingSuccess(false)}
            style={{ backgroundColor: primaryColor }}
          >
            Close
          </Button>
        </div>
      </Modal>

      {/* Create Account Prompt Modal */}
      <Modal
        isOpen={showCreateAccountPrompt}
        onClose={() => setShowCreateAccountPrompt(false)}
        title="Create an Account?"
      >
        <div className="py-6">
          <p className="text-gray-600 mb-6">
            Create a free account to track your bookings, view history, and write reviews!
          </p>
          <div className="flex gap-3">
            <Button
              fullWidth
              onClick={() => {
                setShowCreateAccountPrompt(false);
                navigate(`/${tenantSlug}/customer/signup`);
              }}
              style={{ backgroundColor: primaryColor }}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create Account
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setShowCreateAccountPrompt(false)}
            >
              {t('common.maybeLater') || 'Maybe Later'}
            </Button>
          </div>
        </div>
      </Modal>

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

      {/* Service Detail Modal - Shows images and latest 5 reviews */}
      {serviceDetailModal.isOpen && serviceDetailModal.service && (() => {
        const modalService = serviceDetailModal.service!;
        let modalServiceImages: string[] = [];
        if (modalService.gallery_urls) {
          if (Array.isArray(modalService.gallery_urls) && modalService.gallery_urls.length > 0) {
            modalServiceImages = modalService.gallery_urls.filter((img: any) => img && typeof img === 'string');
          }
        }
        if (modalServiceImages.length === 0 && modalService.image_url) {
          modalServiceImages = [modalService.image_url];
        }
        
        // Get latest 5 reviews for this service
        const serviceReviewsList = serviceReviews[modalService.id] || [];
        const latestReviews = serviceReviewsList
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5)
          .map(review => ({
            ...review,
            service_name: modalService.name,
            service_name_ar: modalService.name_ar,
          }));
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Transparent black background with fade animation */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-60 animate-[fadeIn_0.3s_ease-out]" 
              onClick={() => setServiceDetailModal({ isOpen: false, service: null })} 
            />

            {/* Modal Content - Square, centered with smooth animation */}
            <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-4xl aspect-square max-h-[90vh] overflow-hidden flex flex-col animate-[modalAppear_0.3s_ease-out]">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 flex-shrink-0">
                <h2 className="text-xl font-bold text-gray-900 truncate pr-4">
                  {i18n.language === 'ar' ? modalService.name_ar : modalService.name}
                </h2>
                <button
                  onClick={() => setServiceDetailModal({ isOpen: false, service: null })}
                  className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content - Flex Layout */}
              <div className="flex-1 overflow-hidden p-4 space-y-4 flex flex-col min-h-0">
                {/* Gallery Images - Full Size with Carousel */}
                {modalServiceImages.length > 0 && (
                  <div className="flex-1 min-h-0 flex flex-col">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex-shrink-0">
                      {i18n.language === 'ar' ? 'الصور' : 'Photos'}
                    </h3>
                    <div className="flex-1 min-h-0 relative bg-gray-50 rounded-lg">
                      <ImageCarousel
                        images={modalServiceImages}
                        className="h-full w-full"
                        aspectRatio="auto"
                        showDots={true}
                        showArrows={true}
                        autoPlay={false}
                      />
                    </div>
                  </div>
                )}

                {/* Latest 5 Reviews */}
                {latestReviews.length > 0 && (
                  <div className="flex-shrink-0">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">
                      {i18n.language === 'ar' ? `آخر ${latestReviews.length} مراجعات` : `Latest ${latestReviews.length} Reviews`}
                    </h3>
                    <div className="relative overflow-visible px-0">
                      <ReviewsCarousel
                        reviews={latestReviews}
                        language={i18n.language as 'en' | 'ar'}
                        itemsPerPage={2}
                        onEdit={(review) => {
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
                          if (tenant) {
                            setEditingReview({
                              id: review.id,
                              serviceId: review.service_id,
                              tenantId: tenant.id,
                              rating: review.rating,
                              comment: review.comment,
                              comment_ar: review.comment_ar,
                              images: existingImages,
                            });
                          }
                        }}
                        onDelete={async (reviewId) => {
                          const confirmMessage = isServiceProvider
                            ? (i18n.language === 'ar' ? 'هل أنت متأكد من حذف هذه المراجعة؟ (أنت تحذف كـ service provider)' : 'Are you sure you want to delete this review? (You are deleting as service provider)')
                            : (i18n.language === 'ar' ? 'هل أنت متأكد من حذف هذه المراجعة؟' : 'Are you sure you want to delete this review?');
                          if (window.confirm(confirmMessage)) {
                            try {
                              const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
                              const token = localStorage.getItem('auth_token');
                              const response = await fetch(`${API_URL}/reviews/${reviewId}`, {
                                method: 'DELETE',
                                headers: {
                                  'Authorization': `Bearer ${token}`,
                                },
                              });
                              if (response.ok) {
                                fetchAllReviews();
                              } else {
                                const data = await response.json();
                                alert(data.error || 'Failed to delete review');
                              }
                            } catch (error: any) {
                              alert('Failed to delete review: ' + error.message);
                            }
                          }
                        }}
                        canEdit={isLoggedIn}
                        canDelete={isLoggedIn || isServiceProvider}
                        currentUserId={userProfile?.id}
                      />
                    </div>
                  </div>
                )}

                {/* No Reviews Message */}
                {latestReviews.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-gray-500 text-sm">
                      {i18n.language === 'ar' ? 'لا توجد مراجعات بعد' : 'No reviews yet'}
                    </p>
                  </div>
                )}

              </div>

              {/* Action Button - Fixed at bottom */}
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
                <button
                  onClick={() => {
                    setServiceDetailModal({ isOpen: false, service: null });
                    navigate(`/${tenantSlug}/book/${modalService.id}`);
                  }}
                  className="w-full px-6 py-3 font-semibold text-white rounded-lg transition-all hover:opacity-90"
                  style={{ backgroundColor: primaryColor }}
                >
                  Check availability
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Review Modal */}
      {editingReview && tenant && (
        <TestimonialForm
          serviceId={editingReview.serviceId}
          tenantId={editingReview.tenantId}
          reviewId={editingReview.id}
          initialRating={editingReview.rating}
          initialComment={editingReview.comment}
          initialCommentAr={editingReview.comment_ar}
          initialImages={editingReview.images}
          onClose={() => setEditingReview(null)}
          onSuccess={() => {
            setEditingReview(null);
            fetchAllReviews(); // Refresh reviews after editing
          }}
        />
      )}
    </div>
  );
}
