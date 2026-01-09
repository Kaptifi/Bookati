import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { Calendar, Plus, User, Phone, Mail, Clock, CheckCircle, XCircle, LogOut, CalendarDays, DollarSign, List, Grid, ChevronLeft, ChevronRight, X, Package, QrCode, Scan } from 'lucide-react';
import { format, addDays, startOfWeek, isSameDay, parseISO, startOfDay, endOfDay, addMinutes, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { countryCodes } from '../../lib/countryCodes';

interface Booking {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  visitor_count: number;
  total_price: number;
  status: string;
  payment_status: string;
  notes: string | null;
  created_at: string;
  booking_group_id: string | null;
  services: {
    name: string;
    name_ar: string;
  };
  slots: {
    slot_date: string;
    start_time: string;
    end_time: string;
  };
  users: {
    full_name: string;
    full_name_ar: string;
  } | null;
}

interface ServiceOffer {
  id: string;
  name: string;
  name_ar: string | null;
  price: number;
  original_price: number | null;
  discount_percentage: number | null;
  is_active: boolean;
}

interface Service {
  id: string;
  name: string;
  name_ar: string;
  base_price: number; // This is the final adult price (discounted if discount exists)
  original_price?: number | null;
  discount_percentage?: number | null;
  child_price?: number | null; // Mandatory, set by service provider
  capacity_per_slot: number;
  offers?: ServiceOffer[]; // Service offers
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

interface PackageUsage {
  service_id: string;
  original_quantity: number;
  remaining_quantity: number;
  used_quantity: number;
  services: {
    name: string;
    name_ar: string;
  };
}

interface CustomerPackage {
  id: string;
  package_id: string;
  status: 'active' | 'expired' | 'cancelled';
  expires_at: string | null;
  service_packages: {
    name: string;
    name_ar: string;
    total_price: number;
  };
  usage: PackageUsage[];
}

export function ReceptionPage() {
  const { t, i18n } = useTranslation();
  const { userProfile, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedOffer, setSelectedOffer] = useState<string>(''); // Selected service offer ID
  const [selectedServices, setSelectedServices] = useState<Array<{service: Service, slot: Slot, employeeId: string}>>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'today' | 'all'>('today');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedBookingForDetails, setSelectedBookingForDetails] = useState<Booking | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [assignmentMode, setAssignmentMode] = useState<'automatic' | 'manual'>('automatic');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{start_time: string, end_time: string, slot_date: string} | null>(null);
  const [availableEmployees, setAvailableEmployees] = useState<Array<{id: string, name: string, name_ar: string, bookingCount: number}>>([]);
  const [isLookingUpCustomer, setIsLookingUpCustomer] = useState(false);
  const [countryCode, setCountryCode] = useState('+966'); // Default to Saudi Arabia (kept for backward compatibility)
  const [customerPhoneFull, setCustomerPhoneFull] = useState(''); // Full phone number with country code
  const [customerPackage, setCustomerPackage] = useState<CustomerPackage | null>(null);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);
  const [subscriptionCustomerLookup, setSubscriptionCustomerLookup] = useState<any>(null);
  const [subscriptionCountryCode, setSubscriptionCountryCode] = useState('+966');
  const [subscriptionForm, setSubscriptionForm] = useState({
    customer_phone: '',
    customer_name: '',
    customer_email: '',
    package_id: '',
    expires_at: ''
  });

  const [bookingForm, setBookingForm] = useState({
    customer_phone: '',
    customer_name: '',
    customer_email: '',
    visitor_count: '' as number | '',
    adult_count: 1,
    child_count: 0,
    notes: '',
    booking_option: 'consecutive' as 'consecutive' | 'parallel'
  });
  const [manualSlotAssignments, setManualSlotAssignments] = useState<Array<{slotIndex: number, employeeId: string, slotId: string}>>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedSlots, setSelectedSlots] = useState<Array<{slot_id: string, start_time: string, end_time: string, employee_id: string, slot_date: string}>>([]);

  // QR Code Validation State
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [qrInputValue, setQrInputValue] = useState('');
  const [qrValidating, setQrValidating] = useState(false);
  const [qrValidationResult, setQrValidationResult] = useState<{success: boolean; message: string; booking?: any} | null>(null);

  // Track if initial auth check has been completed
  const [initialAuthDone, setInitialAuthDone] = useState(false);
  const initialLoadRef = useRef(false); // Use ref to prevent multiple loads

  // Initial auth check - only runs once after auth is loaded
  useEffect(() => {
    // Don't run if already done (using ref for extra protection)
    if (initialLoadRef.current || initialAuthDone) {
      return;
    }

    // Wait for auth to finish loading
    if (authLoading) {
      console.log('Reception: Auth still loading...');
      return;
    }

    console.log('Reception: Initial auth check', { userProfile, role: userProfile?.role });

    if (!userProfile) {
      console.log('Reception: No user profile, redirecting to login');
      navigate('/login');
      return;
    }

    if (userProfile.role !== 'receptionist' && userProfile.role !== 'cashier') {
      console.log('Reception: Wrong role, redirecting to home. Expected: receptionist or cashier, Got:', userProfile.role);
      navigate('/');
      return;
    }

    // Mark as started to prevent duplicate runs
    initialLoadRef.current = true;
    console.log('Reception: User is receptionist/cashier, loading initial data...');
    sessionStorage.setItem('reception_logged_in', 'true');
    setInitialAuthDone(true);
    
    // Load data in parallel and handle errors gracefully
    Promise.all([
      fetchServices().catch(err => {
        console.error('Error in fetchServices:', err);
        return null;
      }),
      fetchPackages().catch(err => {
        console.error('Error in fetchPackages:', err);
        return null;
      }),
      fetchBookings().catch(err => {
        console.error('Error in fetchBookings:', err);
        return null;
      })
    ]).finally(() => {
      console.log('Reception: Initial data loading completed');
      setLoading(false);
    });
  }, [authLoading, userProfile, navigate, initialAuthDone]); // Run when auth state changes, but only once

  // Monitor for actual logout ONLY after initial auth is done
  useEffect(() => {
    // Don't run logout check until initial auth is complete
    if (!initialAuthDone || authLoading) return;

    console.log('Reception: Monitoring session', { userProfile: !!userProfile, authLoading });

    // Only redirect if user profile disappears after successful initial auth
    if (!userProfile) {
      // Add a delay to prevent false positives during state updates
      const timeoutId = setTimeout(() => {
        console.log('Reception: Session lost, redirecting to login');
        sessionStorage.removeItem('reception_logged_in');
        navigate('/login');
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [userProfile, authLoading, navigate, initialAuthDone]);

  // Refetch bookings when calendar date changes in calendar mode
  useEffect(() => {
    if (viewMode === 'calendar' && userProfile?.tenant_id && initialAuthDone && !authLoading) {
      console.log('[ReceptionPage] Calendar date changed, refetching bookings for calendar view');
      fetchBookings();
    }
  }, [calendarDate, viewMode]);

  useEffect(() => {
    if (selectedService && selectedDate) {
      fetchAvailableSlots();
    }
  }, [selectedService, selectedDate]);

  // Update visitor_count when adult_count or child_count changes
  useEffect(() => {
    const total = bookingForm.adult_count + bookingForm.child_count;
    if (total > 0 && bookingForm.visitor_count !== total) {
      setBookingForm(prev => ({ ...prev, visitor_count: total }));
    }
  }, [bookingForm.adult_count, bookingForm.child_count]);

  // Clear selected slots when key parameters change
  useEffect(() => {
    setSelectedSlots([]);
  }, [selectedService, selectedDate, bookingForm.visitor_count, bookingForm.booking_option]);

  // Calculate required slots based on booking mode
  function getRequiredSlotsCount(): number {
    if (bookingForm.visitor_count <= 1) return 1;

    if (bookingForm.booking_option === 'consecutive') {
      // Consecutive: need N slots where N = quantity (same employee, different times)
      return bookingForm.visitor_count;
    } else {
      // Parallel: need only 1 time slot (system will auto-assign multiple employees at same time)
      return 1;
    }
  }

  // Validate slot selection
  function validateSlotSelection(): { valid: boolean; message: string } {
    // If booking multiple tickets, first check if a single slot can handle all tickets
    if (bookingForm.visitor_count > 1 && selectedTimeSlot) {
      const slotsAtTime = slots.filter(
        s => s.start_time === selectedTimeSlot.start_time &&
             s.end_time === selectedTimeSlot.end_time &&
             s.available_capacity > 0
      );
      
      // Check if any slot has enough capacity for all tickets
      const slotWithEnoughCapacity = slotsAtTime.find(s => s.available_capacity >= bookingForm.visitor_count);
      if (slotWithEnoughCapacity) {
        // Can book all tickets in one slot - no need to select multiple slots
        return { valid: true, message: 'All tickets can be booked in the same time slot' };
      }
    }

    const required = getRequiredSlotsCount();

    if (selectedSlots.length < required) {
      return {
        valid: false,
        message: `${required - selectedSlots.length} more slot(s) required`
      };
    }

    if (selectedSlots.length > required) {
      return {
        valid: false,
        message: `Too many slots selected. Only ${required} needed.`
      };
    }

    // Consecutive mode: validate same employee
    if (bookingForm.booking_option === 'consecutive' && selectedSlots.length > 1) {
      const firstEmployeeId = selectedSlots[0].employee_id;
      const allSameEmployee = selectedSlots.every(s => s.employee_id === firstEmployeeId);

      if (!allSameEmployee) {
        return {
          valid: false,
          message: 'Please select slots from the same employee for consecutive booking'
        };
      }
    }

    // Parallel mode: validate sufficient employee availability at selected time
    if (bookingForm.booking_option === 'parallel' && bookingForm.visitor_count > 1 && selectedSlots.length === 1) {
      const selectedSlot = selectedSlots[0];
      const slotsAtSameTime = slots.filter(
        s => s.start_time === selectedSlot.start_time &&
             s.end_time === selectedSlot.end_time &&
             s.available_capacity > 0
      );

      if (slotsAtSameTime.length < bookingForm.visitor_count) {
        return {
          valid: false,
          message: `Not enough employees available. Need ${bookingForm.visitor_count}, only ${slotsAtSameTime.length} available at this time.`
        };
      }
    }

    return { valid: true, message: 'All required slots selected' };
  }

  // Handle slot click for multi-selection
  function handleSlotClick(slot: Slot, event?: React.MouseEvent) {
    // Check if right-click or Ctrl+Click to remove one instance
    const isRemoveAction = event?.ctrlKey || event?.metaKey || event?.button === 2;
    
    if (isRemoveAction) {
      // Remove the last instance of this slot
      const slotIndex = selectedSlots.map(s => s.slot_id).lastIndexOf(slot.id);
      if (slotIndex !== -1) {
        setSelectedSlots(prev => {
          const newSlots = [...prev];
          newSlots.splice(slotIndex, 1);
          return newSlots;
        });
      }
      return;
    }

    // Check if we can add more slots
    const required = getRequiredSlotsCount();
    const currentCount = selectedSlots.length;
    
    // Allow adding slots up to the required count (or visitor_count if booking multiple tickets)
    const maxSlots = bookingForm.visitor_count > 1 ? bookingForm.visitor_count : required;
    
    if (currentCount >= maxSlots) {
      // Check if we can still add this specific slot (if it's the same slot, allow multiple)
      const sameSlotCount = selectedSlots.filter(s => s.slot_id === slot.id).length;
      const slotCapacity = slot.available_capacity || 0;
      
      if (sameSlotCount >= slotCapacity) {
        alert(`Maximum capacity reached for this slot. Available: ${slotCapacity}`);
        return;
      }
      
      // If we've reached max but this is a different slot, show message
      if (sameSlotCount === 0) {
        alert(`You can select up to ${maxSlots} slot(s). Remove a slot first to select a different one, or click the same slot multiple times.`);
        return;
      }
    }

    // Add to selection (allow multiple instances of the same slot)
    const newSlot = {
      slot_id: slot.id,
      start_time: slot.start_time,
      end_time: slot.end_time,
      employee_id: slot.employee_id || '',
      slot_date: slot.slot_date
    };

    setSelectedSlots(prev => [...prev, newSlot]);

    // Set selectedTimeSlot for backward compatibility (use first selected slot)
    if (selectedSlots.length === 0) {
      setSelectedTimeSlot({
        start_time: slot.start_time,
        end_time: slot.end_time,
        slot_date: slot.slot_date
      });
    }
  }

  async function fetchServices() {
    if (!userProfile?.tenant_id) return;
    
    // Fetch services with their offers
    const { data: servicesData, error: servicesError } = await supabase
      .from('services')
      .select('id, name, name_ar, base_price, original_price, discount_percentage, child_price, capacity_per_slot, capacity_mode')
      .eq('tenant_id', userProfile.tenant_id)
      .eq('is_active', true)
      .order('name');
    
    if (servicesError) {
      console.error('Error fetching services:', servicesError);
      setServices([]);
      return;
    }
    
    // Fetch all active offers for these services
    if (servicesData && servicesData.length > 0) {
      const serviceIds = servicesData.map(s => s.id);
      const { data: offersData, error: offersError } = await supabase
        .from('service_offers')
        .select('id, service_id, name, name_ar, price, original_price, discount_percentage, is_active')
        .in('service_id', serviceIds)
        .eq('is_active', true)
        .order('name');
      
      if (offersError) {
        console.error('Error fetching offers:', offersError);
      }
      
      // Attach offers to their respective services
      const servicesWithOffers = servicesData.map(service => ({
        ...service,
        offers: offersData?.filter(offer => offer.service_id === service.id) || []
      }));
      
      setServices(servicesWithOffers);
    } else {
      setServices([]);
    }
  }

  async function fetchPackages() {
    if (!userProfile?.tenant_id) {
      setPackages([]);
      return;
    }
    
    try {
      // Fetch packages first
      const { data: packagesData, error: packagesError } = await supabase
        .from('service_packages')
        .select('id, name, name_ar, total_price')
        .eq('tenant_id', userProfile.tenant_id)
        .eq('is_active', true)
        .order('name');
      
      if (packagesError) {
        console.error('Error fetching packages:', packagesError);
        setPackages([]);
        return;
      }
      
      if (!packagesData || packagesData.length === 0) {
        setPackages([]);
        return;
      }
      
      // Fetch package services separately
      const packageIds = packagesData.map(p => p.id);
      
      // Only fetch services if we have package IDs
      if (packageIds.length === 0) {
        setPackages(packagesData);
        return;
      }
      
      const { data: packageServicesData, error: packageServicesError } = await supabase
        .from('package_services')
        .select(`
          package_id,
          service_id,
          services (
            id,
            name,
            name_ar,
            base_price,
            child_price
          )
        `)
        .in('package_id', packageIds);
      
      if (packageServicesError) {
        console.error('Error fetching package services:', packageServicesError);
        // Still set packages even if services fetch fails
        setPackages(packagesData.map(pkg => ({
          ...pkg,
          package_services: []
        })));
        return;
      }
      
      // Combine packages with their services
      const packagesWithServices = packagesData.map(pkg => ({
        ...pkg,
        package_services: packageServicesData?.filter(ps => ps.package_id === pkg.id) || []
      }));
      
      setPackages(packagesWithServices);
    } catch (error) {
      console.error('Unexpected error in fetchPackages:', error);
      setPackages([]);
    }
  }

  function formatPhoneNumber(phone: string, code: string): string {
    const gulfCountries = ['+966', '+971', '+968', '+965', '+973', '+974'];
    if (gulfCountries.includes(code) && phone.startsWith('0')) {
      return phone.substring(1);
    }
    return phone;
  }

  async function lookupSubscriptionCustomer(phone: string, code: string) {
    const formattedPhone = formatPhoneNumber(phone, code);
    const fullPhone = `${code}${formattedPhone}`;

    if (!formattedPhone || formattedPhone.length < 8 || !userProfile?.tenant_id) {
      setSubscriptionCustomerLookup(null);
      return;
    }

      const { data } = await supabase
        .from('customers')
      .select('*')
      .eq('tenant_id', userProfile.tenant_id)
      .eq('phone', fullPhone)
      .maybeSingle();

    setSubscriptionCustomerLookup(data);
    if (data) {
      setSubscriptionForm(prev => ({
        ...prev,
        customer_name: data.name,
        customer_email: data.email || ''
      }));
    } else {
      setSubscriptionForm(prev => ({
        ...prev,
        customer_name: '',
        customer_email: ''
      }));
    }
  }

  async function handleSubscriptionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userProfile?.tenant_id) return;

    const formattedPhone = formatPhoneNumber(subscriptionForm.customer_phone, subscriptionCountryCode);
    const fullPhone = `${subscriptionCountryCode}${formattedPhone}`;
    let customerId = subscriptionCustomerLookup?.id;

    try {
      if (!customerId) {
        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({
            tenant_id: userProfile.tenant_id,
            phone: fullPhone,
            name: subscriptionForm.customer_name,
            email: subscriptionForm.customer_email || null
          })
          .select()
          .single();

        if (newCustomer) {
          customerId = newCustomer.id;
        }
      }

      if (customerId) {
        await supabase.from('package_subscriptions').insert({
          tenant_id: userProfile.tenant_id,
          customer_id: customerId,
          package_id: subscriptionForm.package_id,
          status: 'active',
          expires_at: subscriptionForm.expires_at || null
        });

        alert(t('packages.subscriptionSuccess'));
        setIsSubscriptionModalOpen(false);
        resetSubscriptionForm();
      }
    } catch (err: any) {
      console.error('Error creating subscription:', err);
      alert(`Error: ${err.message}`);
    }
  }

  function resetSubscriptionForm() {
    setSubscriptionForm({
      customer_phone: '',
      customer_name: '',
      customer_email: '',
      package_id: '',
      expires_at: ''
    });
    setSubscriptionCustomerLookup(null);
    setSubscriptionCountryCode('+966');
  }

  async function fetchBookings() {
    if (!userProfile?.tenant_id) return;

    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // If in calendar mode, filter by week range
      let query = supabase
        .from('bookings')
        .select(`
          id,
          customer_name,
          customer_phone,
          customer_email,
          visitor_count,
          total_price,
          status,
          payment_status,
          notes,
          created_at,
          booking_group_id,
          qr_scanned,
          qr_scanned_at,
          qr_scanned_by_user_id,
          services (name, name_ar),
          slots (slot_date, start_time, end_time),
          users:employee_id (id, full_name, full_name_ar)
        `)
        .eq('tenant_id', userProfile.tenant_id);

      // If calendar mode, filter by week range
      if (viewMode === 'calendar') {
        const weekStart = startOfWeek(calendarDate, { weekStartsOn: 0 });
        const weekEnd = addDays(weekStart, 6);
        const weekStartStr = format(weekStart, 'yyyy-MM-dd');
        const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
        
        // Filter bookings by slot_date within the week range
        // Note: We'll filter in JavaScript since Supabase doesn't support nested filtering easily
        query = query.order('created_at', { ascending: false }).limit(500); // Get more bookings for calendar view
      } else {
        query = query.order('created_at', { ascending: false }).limit(100);
      }

      const { data, error } = await query;

      if (error) throw error;

      let rawBookings = data || [];
      
      // If in calendar mode, filter by week range
      if (viewMode === 'calendar') {
        const weekStart = startOfWeek(calendarDate, { weekStartsOn: 0 });
        const weekEnd = addDays(weekStart, 6);
        const weekStartStr = format(weekStart, 'yyyy-MM-dd');
        const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
        
        rawBookings = rawBookings.filter(booking => {
          const slotDate = booking.slots?.slot_date;
          if (!slotDate) return false;
          return slotDate >= weekStartStr && slotDate <= weekEndStr;
        });
        
        console.log(`[ReceptionPage] Calendar mode: Filtered to ${rawBookings.length} bookings for week ${weekStartStr} to ${weekEndStr}`);
      }
      
      console.log(`[ReceptionPage] ========================================`);
      console.log(`[ReceptionPage] Fetched bookings: ${rawBookings.length} total bookings`);
      if (rawBookings.length > 0) {
        console.log(`[ReceptionPage] Sample bookings:`, rawBookings.slice(0, 3).map(b => ({
          id: b.id,
          customer_name: b.customer_name,
          slot_date: b.slots?.slot_date,
          start_time: b.slots?.start_time,
          visitor_count: b.visitor_count
        })));
      }

      // Group bookings by booking_group_id to aggregate employees and count
      const bookingGroups = new Map();
      rawBookings.forEach(booking => {
        const groupId = booking.booking_group_id || booking.id;

        if (!bookingGroups.has(groupId)) {
          bookingGroups.set(groupId, {
            ...booking,
            employees: booking.users ? [booking.users] : [],
            groupCount: 1
          });
        } else {
          const group = bookingGroups.get(groupId);
          // Add employee if not already in list
          if (booking.users && !group.employees.find((e: any) => e.id === booking.users.id)) {
            group.employees.push(booking.users);
          }
          group.groupCount += 1;
        }
      });

      const allBookings = Array.from(bookingGroups.values());
      console.log('Grouped bookings:', allBookings.length, 'booking groups');
      setBookings(allBookings);

      // Filter today's bookings - handle both date formats
      console.log(`[ReceptionPage] Filtering today's bookings. Today: ${today}, Total bookings: ${allBookings.length}`);
      const todayOnly = allBookings.filter(b => {
        if (!b.slots?.slot_date) {
          console.warn(`[ReceptionPage] Booking ${b.id} has no slot_date`);
          return false;
        }
        const bookingDate = b.slots.slot_date;
        // Handle both "2025-12-09" and "2025-12-09T22:00:00.000Z" formats
        let normalizedBookingDate: string;
        if (typeof bookingDate === 'string') {
          if (bookingDate.includes('T') || bookingDate.includes('Z')) {
            try {
              normalizedBookingDate = format(parseISO(bookingDate), 'yyyy-MM-dd');
            } catch (e) {
              normalizedBookingDate = bookingDate.substring(0, 10);
            }
          } else {
            normalizedBookingDate = bookingDate.substring(0, 10);
          }
        } else {
          normalizedBookingDate = format(new Date(bookingDate), 'yyyy-MM-dd');
        }
        const matches = normalizedBookingDate === today;
        if (!matches) {
          console.log(`[ReceptionPage] Booking ${b.id} date mismatch: "${normalizedBookingDate}" !== "${today}" (original: ${bookingDate})`);
        } else {
          console.log(`[ReceptionPage] Booking ${b.id} matches today: ${normalizedBookingDate} === ${today}`);
        }
        return matches;
      });
      console.log(`[ReceptionPage] Today's bookings: ${todayOnly.length} out of ${allBookings.length} total`);
      if (todayOnly.length > 0) {
        console.log('[ReceptionPage] Today\'s bookings details:', todayOnly.map(b => ({
          id: b.id,
          customer_name: b.customer_name,
          slot_date: b.slots?.slot_date,
          start_time: b.slots?.start_time,
          visitor_count: b.visitor_count
        })));
      } else {
        console.warn(`[ReceptionPage] ⚠️ No bookings found for today (${today})`);
        if (allBookings.length > 0) {
          console.log(`[ReceptionPage] All booking dates:`, allBookings.map(b => ({
            id: b.id,
            slot_date: b.slots?.slot_date,
            normalized: b.slots?.slot_date ? (b.slots.slot_date.includes('T') || b.slots.slot_date.includes('Z') 
              ? format(parseISO(b.slots.slot_date), 'yyyy-MM-dd')
              : b.slots.slot_date.substring(0, 10)) : 'N/A'
          })));
        }
      }
      setTodayBookings(todayOnly);
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setBookings([]);
      setTodayBookings([]);
    }
    // Note: setLoading(false) is now handled in the useEffect that calls this function
  }

  async function fetchAvailableSlots() {
    if (!userProfile?.tenant_id || !selectedService || !selectedDate) return;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      // First get shifts for this service
      console.log(`[ReceptionPage] ========================================`);
      console.log(`[ReceptionPage] Fetching shifts for service: ${selectedService}, date: ${dateStr}`);
      const { data: shifts, error: shiftsError } = await supabase
        .from('shifts')
        .select('id, days_of_week')
        .eq('service_id', selectedService)
        .eq('is_active', true);

      if (shiftsError) {
        console.error('[ReceptionPage] Error fetching shifts:', shiftsError);
        setSlots([]);
        return;
      }

      console.log(`[ReceptionPage] Found ${shifts?.length || 0} active shift(s) for service ${selectedService}`);
      
      if (!shifts || shifts.length === 0) {
        console.warn(`[ReceptionPage] ⚠️ No active shifts found for service ${selectedService}. Slots cannot be generated without shifts.`);
        setSlots([]);
        return;
      }

      const shiftIds = shifts.map(s => s.id);

      // Then get slots for these shifts on the selected date
      console.log(`[ReceptionPage] Fetching slots for shift IDs: ${shiftIds.join(', ')}, date: ${dateStr}`);
      const { data: slotsData, error } = await supabase
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
        .eq('tenant_id', userProfile.tenant_id)
        .eq('slot_date', dateStr)
        .in('shift_id', shiftIds)
        .eq('is_available', true)
        .order('start_time');

      if (error) {
        console.error('[ReceptionPage] Error fetching slots:', error);
        setSlots([]);
        return;
      }

      console.log(`[ReceptionPage] Found ${slotsData?.length || 0} slot(s) from database for date ${dateStr}`);
      if (slotsData && slotsData.length > 0) {
        console.log('[ReceptionPage] All slots from DB:');
        slotsData.forEach((s, idx) => {
          console.log(`  Slot ${idx + 1}: id=${s.id.substring(0, 8)}..., shift_id=${s.shift_id?.substring(0, 8) || 'NONE'}..., slot_date=${s.slot_date}, start_time=${s.start_time}, capacity=${s.available_capacity}, booked=${s.booked_count}`);
        });
      }

      // IMPORTANT: Don't filter by available_capacity here - show all slots
      // The capacity check will happen when they try to book
      // Only filter out slots with capacity = 0 if they're in the past
      let availableSlots = slotsData || [];
      
      console.log(`[ReceptionPage] Before capacity filtering: ${availableSlots.length} slots`);

      // CRITICAL FIX: Filter slots to only include those that match shift days_of_week
      // This prevents showing slots for days that don't match the shift schedule
      if (shifts && shifts.length > 0) {
        // Create a map of shift_id -> days_of_week for quick lookup
        const shiftDaysMap = new Map<string, number[]>();
        shifts.forEach((shift: any) => {
          shiftDaysMap.set(shift.id, shift.days_of_week);
          console.log(`[ReceptionPage] Shift ${shift.id.substring(0, 8)}... has days_of_week: [${shift.days_of_week.join(', ')}]`);
        });

        // Get day of week for selected date (0 = Sunday, 1 = Monday, etc.)
        const dayOfWeek = selectedDate.getDay();
        console.log(`[ReceptionPage] Selected date: ${dateStr}, day of week: ${dayOfWeek} (0=Sunday, 1=Monday, etc.)`);

        const beforeDaysFilter = availableSlots.length;
        // Filter slots: only keep slots where the day matches the shift's days_of_week
        // IMPORTANT: Calculate dayOfWeek from slot_date, not from selectedDate
        availableSlots = availableSlots.filter((slot: any) => {
          const slotShiftId = slot.shift_id;
          if (!slotShiftId) {
            console.warn(`[ReceptionPage] Slot ${slot.id} has no shift_id, filtering out`);
            return false;
          }

          const shiftDays = shiftDaysMap.get(slotShiftId);
          if (!shiftDays || shiftDays.length === 0) {
            console.warn(`[ReceptionPage] Slot ${slot.id} has invalid shift ${slotShiftId} with no days_of_week, filtering out`);
            return false;
          }

          // Calculate day of week from slot_date (not from selectedDate)
          let slotDayOfWeek: number;
          if (slot.slot_date) {
            let slotDate: Date;
            if (typeof slot.slot_date === 'string') {
              // Handle both "2025-12-09" and "2025-12-09T22:00:00.000Z" formats
              if (slot.slot_date.includes('T') || slot.slot_date.includes('Z')) {
                slotDate = parseISO(slot.slot_date);
              } else {
                slotDate = parseISO(slot.slot_date + 'T00:00:00');
              }
            } else {
              slotDate = new Date(slot.slot_date);
            }
            slotDayOfWeek = slotDate.getDay();
          } else {
            // Fallback to selectedDate if slot_date is missing
            slotDayOfWeek = dayOfWeek;
          }

          // Check if this day matches the shift's days_of_week
          if (shiftDays.includes(slotDayOfWeek)) {
            console.log(`[ReceptionPage] Slot ${slot.id} (slot_date=${slot.slot_date}, DOW=${slotDayOfWeek}) matches shift ${slotShiftId} days [${shiftDays.join(', ')}] - KEEP`);
            return true;
          }

          // Day doesn't match the shift's days_of_week, filter it out
          console.warn(`[ReceptionPage] Filtering out slot ${slot.id} on ${slot.slot_date} (slot DOW=${slotDayOfWeek}, selected DOW=${dayOfWeek}) - doesn't match shift ${slotShiftId} days [${shiftDays.join(', ')}]`);
          return false;
        });
        console.log(`[ReceptionPage] After days_of_week filtering: ${beforeDaysFilter} -> ${availableSlots.length} slots`);
      }

      // IMPORTANT: In reception page, we should show ALL slots (including past ones)
      // This allows receptionists to review past bookings and manage schedules
      // Receptionists need to see all slots for booking management, even if they're in the past
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const isToday = dateStr === todayStr;
      
      if (isToday) {
        // For today, show slots from 8pm (20:00) to 10pm (22:00) in reception page
        // This is the working hours for cashier/reception
        // Include slots that start at 20:00, 21:00, and 22:00 (to show 3 slots: 8-9pm, 9-10pm, 10-11pm)
        const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes since midnight
        const startTimeFilter = 20 * 60; // 8pm = 20:00 = 1200 minutes
        const endTimeFilter = 23 * 60; // 11pm = 23:00 = 1380 minutes (to include 22:00-23:00 slot)
        
        console.log(`[ReceptionPage] Reception mode: Filtering slots for today between 8pm-11pm (to show 8-9pm, 9-10pm, 10-11pm)`);
        console.log(`[ReceptionPage] Current time: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} (${currentTime} minutes), Date: ${dateStr}`);
        console.log(`[ReceptionPage] Time filter: ${startTimeFilter} (8pm) to ${endTimeFilter} (11pm) minutes`);
        const beforeCount = availableSlots.length;
        
        // Filter slots to only show those between 8pm and 10pm
        // Also mark slots as past/future for display purposes
        availableSlots = availableSlots
          .filter((slot: any) => {
            if (!slot.start_time) {
              return false; // Filter out slots without start_time
            }
            // Handle time format: "HH:MM" or "HH:MM:SS"
            const timeParts = slot.start_time.split(':');
            const hours = parseInt(timeParts[0] || '0', 10);
            const minutes = parseInt(timeParts[1] || '0', 10);
            if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
              return false; // Filter out invalid times
            }
            const slotTime = hours * 60 + minutes; // Slot time in minutes since midnight
            
            // Only keep slots between 8pm (20:00) and 11pm (23:00)
            // Include slots that start at 20:00, 21:00, 22:00 (to show 3 slots: 8-9pm, 9-10pm, 10-11pm)
            const inTimeRange = slotTime >= startTimeFilter && slotTime < endTimeFilter;
            
            // Also check if slot end_time is within range (for slots that might start before 8pm but end after)
            let slotEndTime = slotTime;
            if (slot.end_time) {
              const endTimeParts = slot.end_time.split(':');
              const endHours = parseInt(endTimeParts[0] || '0', 10);
              const endMinutes = parseInt(endTimeParts[1] || '0', 10);
              if (!isNaN(endHours) && !isNaN(endMinutes)) {
                slotEndTime = endHours * 60 + endMinutes;
              }
            }
            // Keep slot if start_time OR end_time is in range
            const slotEndsInRange = slotEndTime > startTimeFilter && slotEndTime <= endTimeFilter;
            const finalInRange = inTimeRange || slotEndsInRange;
            
            if (finalInRange) {
              console.log(`[ReceptionPage] Slot ${slot.id}: ${slot.start_time}-${slot.end_time} (start=${slotTime} min, end=${slotEndTime} min) is in 8pm-11pm range - KEEP`);
            } else {
              console.log(`[ReceptionPage] Slot ${slot.id}: ${slot.start_time}-${slot.end_time} (start=${slotTime} min, end=${slotEndTime} min) is OUTSIDE 8pm-11pm range - FILTER OUT`);
            }
            
            return finalInRange;
          })
          .map((slot: any) => {
            // Mark slots as past/future for display
            const timeParts = slot.start_time.split(':');
            const hours = parseInt(timeParts[0] || '0', 10);
            const minutes = parseInt(timeParts[1] || '0', 10);
            const slotTime = hours * 60 + minutes;
            const isPast = slotTime <= currentTime;
            
            return { ...slot, isPast };
          });
        
        console.log(`[ReceptionPage] After 8pm-11pm filter: ${beforeCount} -> ${availableSlots.length} slots`);
        if (availableSlots.length > 0) {
          console.log(`[ReceptionPage] Filtered slots (8pm-11pm only):`, availableSlots.map(s => `${s.start_time}-${s.end_time} (${s.isPast ? 'PAST' : 'FUTURE'}, capacity=${s.available_capacity})`));
          if (availableSlots.length !== 3) {
            console.warn(`[ReceptionPage] ⚠️ Expected 3 slots (8-9pm, 9-10pm, 10-11pm), but found ${availableSlots.length}`);
          }
        } else {
          console.warn(`[ReceptionPage] ⚠️ No slots found in 8pm-11pm range!`);
        }
      }
      // For future dates, keep all slots (no filtering needed)

      // Filter out slots that conflict with already selected services
      console.log(`[ReceptionPage] Before filterConflictingSlots: ${availableSlots.length} slots`);
      const beforeConflictFilter = availableSlots.length;
      const nonConflictingSlots = filterConflictingSlots(availableSlots);
      console.log(`[ReceptionPage] After filterConflictingSlots: ${beforeConflictFilter} -> ${nonConflictingSlots.length} slots`);

      console.log(`[ReceptionPage] Final slots after all filtering: ${nonConflictingSlots.length}`);
      if (nonConflictingSlots.length === 0 && slotsData && slotsData.length > 0) {
        console.warn(`[ReceptionPage] ⚠️ All ${slotsData.length} slot(s) were filtered out. Check the filtering logic above.`);
        console.warn(`[ReceptionPage] Breakdown:`);
        console.warn(`  - Raw slots from DB: ${slotsData.length}`);
        console.warn(`  - After capacity filter: ${(slotsData || []).filter(s => s.available_capacity > 0).length}`);
        console.warn(`  - After days_of_week filter: ${availableSlots.length} (before conflict filter)`);
        console.warn(`  - After conflict filter: ${nonConflictingSlots.length}`);
        console.warn(`  - Selected services count: ${selectedServices.length}`);
      }

      setSlots(nonConflictingSlots);

      // Fetch employee booking counts for this date
      await fetchEmployeeBookingCounts(dateStr, shiftIds);
    } catch (err) {
      console.error('Error in fetchAvailableSlots:', err);
      setSlots([]);
    }
  }

  async function fetchEmployeeBookingCounts(dateStr: string, shiftIds: string[]) {
    if (!userProfile?.tenant_id || !selectedService) return;

    try {
      // Get employees assigned to this service through employee_services
      const { data: employeeServices, error: empServError } = await supabase
        .from('employee_services')
        .select(`
          employee_id,
          users:employee_id(id, full_name, full_name_ar, is_active)
        `)
        .eq('tenant_id', userProfile.tenant_id)
        .eq('service_id', selectedService);

      if (empServError) {
        console.error('Error fetching employee services:', empServError);
        return;
      }

      if (!employeeServices || employeeServices.length === 0) {
        setAvailableEmployees([]);
        return;
      }

      // Filter active employees and create map
      const employeeMap = new Map<string, {id: string, name: string, name_ar: string}>();
      employeeServices.forEach(es => {
        if (es.users && es.users.is_active) {
          employeeMap.set(es.employee_id, {
            id: es.users.id,
            name: es.users.full_name,
            name_ar: es.users.full_name_ar
          });
        }
      });

      // Get all slots for this date and these employees
      const employeeIds = Array.from(employeeMap.keys());
      const { data: allSlots } = await supabase
        .from('slots')
        .select('id, employee_id')
        .eq('tenant_id', userProfile.tenant_id)
        .eq('slot_date', dateStr)
        .in('shift_id', shiftIds)
        .in('employee_id', employeeIds);

      if (!allSlots) {
        const employeesWithCounts = Array.from(employeeMap.values()).map(emp => ({
          ...emp,
          bookingCount: 0
        }));
        setAvailableEmployees(employeesWithCounts);
        return;
      }

      // Get booking counts for each employee on this date
      const slotIds = allSlots.map(s => s.id);

      if (slotIds.length === 0) {
        const employeesWithCounts = Array.from(employeeMap.values()).map(emp => ({
          ...emp,
          bookingCount: 0
        }));
        setAvailableEmployees(employeesWithCounts);
        return;
      }

      const { data: bookings } = await supabase
        .from('bookings')
        .select('employee_id')
        .in('slot_id', slotIds)
        .in('status', ['pending', 'confirmed', 'checked_in']);

      const bookingCountMap = new Map<string, number>();
      (bookings || []).forEach(booking => {
        const count = bookingCountMap.get(booking.employee_id) || 0;
        bookingCountMap.set(booking.employee_id, count + 1);
      });

      const employeesWithCounts = Array.from(employeeMap.values()).map(emp => ({
        ...emp,
        bookingCount: bookingCountMap.get(emp.id) || 0
      })).sort((a, b) => a.bookingCount - b.bookingCount); // Sort by booking count ascending

      setAvailableEmployees(employeesWithCounts);
    } catch (err) {
      console.error('Error fetching employee booking counts:', err);
      setAvailableEmployees([]);
    }
  }

  // Helper function to create bookings via API (ensures tickets are sent)
  async function createBookingViaAPI(bookingData: any) {
    // Get base API URL (without /api suffix)
    let API_URL = import.meta.env.VITE_API_URL || '';
    
    // Remove trailing /api if present to avoid double /api/api/
    API_URL = API_URL.replace(/\/api\/?$/, '');
    
    const session = await supabase.auth.getSession();
    
    if (!session.data.session?.access_token) {
      throw new Error('Not authenticated. Please log in again.');
    }

    // Construct URL: base URL + /api/bookings/create
    const url = `${API_URL}/api/bookings/create`;
    console.log('Creating booking via API:', { url, hasToken: !!session.data.session?.access_token });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session.access_token}`
        },
        body: JSON.stringify({
          ...bookingData,
          language: i18n.language
        })
      });

      // Check if response is JSON
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      // If response is not OK or not JSON, handle error
      if (!response.ok || !isJson) {
        const text = await response.text();
        
        // If it's HTML (error page), provide helpful message
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          console.error('Server returned HTML instead of JSON. This usually means:');
          console.error('1. Backend server is not running');
          console.error('2. API URL is incorrect:', url);
          console.error('3. Request was redirected to an error page');
          throw new Error(`Backend server error: The API server at ${API_URL} is not responding correctly. Please ensure the backend server is running.`);
        }
        
        // Try to parse as JSON if possible
        if (isJson) {
          try {
            const errorData = JSON.parse(text);
            throw new Error(errorData.error || `Server error: ${response.status} ${response.statusText}`);
          } catch (parseError) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
          }
        } else {
          console.error('Non-JSON error response:', text.substring(0, 500));
          throw new Error(`Server returned invalid response (${response.status}). Check if backend server is running at ${API_URL}`);
        }
      }

      // Parse and return JSON response
      return await response.json();
    } catch (error: any) {
      // Handle network errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error('Network error - cannot reach API server:', url);
        throw new Error(`Cannot connect to backend server at ${API_URL}. Please ensure the server is running.`);
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  async function handleQuantityBooking(service: Service) {
    const quantity = bookingForm.visitor_count;
    const fullPhoneNumber = `${countryCode}${bookingForm.customer_phone}`;

    if (!selectedTimeSlot) {
      alert('Please select a time slot');
      return;
    }

    const slotsAtTime = slots.filter(
      s => s.start_time === selectedTimeSlot.start_time &&
           s.end_time === selectedTimeSlot.end_time &&
           s.available_capacity > 0
    );

    if (slotsAtTime.length === 0) {
      alert('No available slots at this time');
      return;
    }

    // Check if we can book all tickets in a single slot (preferred option)
    const slotWithEnoughCapacity = slotsAtTime.find(s => s.available_capacity >= quantity);
    
    if (slotWithEnoughCapacity) {
      // Book all tickets in the same slot - this is what the user wants
      await saveOrUpdateCustomer(fullPhoneNumber);
      
      // Calculate prices
      let adultPrice = service.base_price || 0;
      if (selectedOffer) {
        const offer = service.offers?.find(o => o.id === selectedOffer);
        if (offer) {
          adultPrice = offer.price;
        }
      }
      const childPrice = service.child_price || adultPrice;
      const totalPrice = (adultPrice * bookingForm.adult_count) + (childPrice * bookingForm.child_count);
      
      // Generate booking group ID
      const bookingGroupId = crypto.randomUUID();
      
      // Create booking via API to ensure tickets are sent
      try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${API_URL}/api/bookings/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await supabase.auth.getSession().then(s => s.data.session?.access_token)}`
          },
          body: JSON.stringify({
            tenant_id: userProfile!.tenant_id,
            service_id: selectedService!,
            slot_id: slotWithEnoughCapacity.id,
            employee_id: slotWithEnoughCapacity.employee_id || null,
            offer_id: selectedOffer || null,
            customer_name: bookingForm.customer_name,
            customer_phone: fullPhoneNumber,
            customer_email: bookingForm.customer_email || null,
            visitor_count: quantity,
            adult_count: bookingForm.adult_count,
            child_count: bookingForm.child_count,
            total_price: totalPrice,
            notes: bookingForm.notes || null,
            status: 'confirmed',
            payment_status: 'unpaid',
            created_by_user_id: userProfile!.id,
            booking_group_id: bookingGroupId,
            language: i18n.language
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create booking');
        }

        const result = await response.json();
        console.log('✅ Booking created successfully:', result);
        
        alert(`${quantity} tickets booked successfully! Confirmation sent to customer.`);
        setIsModalOpen(false);
        resetForm();
        fetchBookings();
        fetchAvailableSlots();
        return;
      } catch (error: any) {
        console.error('Error creating booking:', error);
        alert(`Error: ${error.message}`);
        return;
      }
    }

    // If single slot doesn't have enough capacity, use the existing logic
    const totalCapacity = slotsAtTime.reduce((sum, s) => sum + s.available_capacity, 0);
    
    if (totalCapacity < quantity) {
      alert(`Not enough capacity. Available: ${totalCapacity}, Requested: ${quantity}`);
      return;
    }

    // Save or update customer
    await saveOrUpdateCustomer(fullPhoneNumber);

    if (bookingForm.booking_option === 'parallel' && slotsAtTime.length > 1) {
      // Book multiple employees at same time
      await handleParallelBooking(service, slotsAtTime, quantity, fullPhoneNumber);
    } else {
      // Book consecutive slots with single employee
      await handleConsecutiveBooking(service, quantity, fullPhoneNumber);
    }

    alert(`${quantity} bookings created successfully!`);
    setIsModalOpen(false);
    resetForm();
    fetchBookings();
    fetchAvailableSlots();
  }

  async function saveOrUpdateCustomer(fullPhoneNumber: string) {
    const { data: existingCustomer } = await db
      .from('customers')
      .select('id, total_bookings')
      .eq('tenant_id', userProfile!.tenant_id)
      .eq('phone', fullPhoneNumber)
      .maybeSingle();

    if (existingCustomer) {
      await db
        .from('customers')
        .update({
          name: bookingForm.customer_name,
          email: bookingForm.customer_email || null,
          last_booking_at: new Date().toISOString(),
          total_bookings: existingCustomer.total_bookings + bookingForm.visitor_count
        })
        .eq('id', existingCustomer.id);
    } else {
      await db
        .from('customers')
        .insert({
          tenant_id: userProfile!.tenant_id,
          phone: fullPhoneNumber,
          name: bookingForm.customer_name,
          email: bookingForm.customer_email || null,
          last_booking_at: new Date().toISOString(),
          total_bookings: bookingForm.visitor_count
        });
    }
  }

  async function handleParallelBooking(service: Service, slotsAtTime: Slot[], quantity: number, fullPhoneNumber: string) {
    // Use manually selected slots
    if (selectedSlots.length === 0) {
      throw new Error('Please select time slots first');
    }

    const validation = validateSlotSelection();
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    // For parallel mode with capacity
    const required = getRequiredSlotsCount();

    // Generate a group ID for all bookings in this transaction
    const bookingGroupId = crypto.randomUUID();

    if (required === 1) {
      // Simple case: All bookings at same time with different employees
      const slotsToUse = slotsAtTime.slice(0, quantity);

      // Distribute adult_count and child_count across bookings
      const totalTickets = bookingForm.adult_count + bookingForm.child_count;
      let adultRemaining = bookingForm.adult_count;
      let childRemaining = bookingForm.child_count;
      // If an offer is selected, use offer price; otherwise use base_price
      let adultPrice = service.base_price || 0;
      if (selectedOffer) {
        const offer = service.offers?.find(o => o.id === selectedOffer);
        if (offer) {
          adultPrice = offer.price;
        }
      }
      // Child price is mandatory and set by service provider (offers don't affect child price)
      const childPrice = service.child_price || adultPrice;

      for (const slot of slotsToUse) {
        // Assign tickets: prioritize adults, then children
        let bookingAdultCount = 0;
        let bookingChildCount = 0;
        
        if (adultRemaining > 0) {
          bookingAdultCount = 1;
          adultRemaining--;
        } else if (childRemaining > 0) {
          bookingChildCount = 1;
          childRemaining--;
        }
        
        const bookingPrice = (adultPrice * bookingAdultCount) + (childPrice * bookingChildCount);

        await createBookingViaAPI({
          tenant_id: userProfile!.tenant_id,
          service_id: selectedService!,
          slot_id: slot.id,
          employee_id: slot.employee_id,
          offer_id: selectedOffer || null,
          customer_name: bookingForm.customer_name,
          customer_phone: fullPhoneNumber,
          customer_email: bookingForm.customer_email || null,
          visitor_count: bookingAdultCount + bookingChildCount,
          adult_count: bookingAdultCount,
          child_count: bookingChildCount,
          total_price: bookingPrice,
          notes: bookingForm.notes || null,
          status: 'confirmed',
          payment_status: 'unpaid',
          created_by_user_id: userProfile!.id,
          booking_group_id: bookingGroupId
        });
      }
    } else {
      // Parallel + Extension: Use manually selected slots
      // First slot is primary (parallel), rest are extensions
      // Distribute adult_count and child_count across bookings
      let adultRemaining = bookingForm.adult_count;
      let childRemaining = bookingForm.child_count;
      // Adult price is always base_price (discounted if discount exists)
      const adultPrice = service.base_price || 0;
      // Child price is mandatory and set by service provider
      const childPrice = service.child_price || adultPrice;

      for (const selectedSlot of selectedSlots) {
        // Assign tickets: prioritize adults, then children
        let bookingAdultCount = 0;
        let bookingChildCount = 0;
        
        if (adultRemaining > 0) {
          bookingAdultCount = 1;
          adultRemaining--;
        } else if (childRemaining > 0) {
          bookingChildCount = 1;
          childRemaining--;
        }
        
        const bookingPrice = (adultPrice * bookingAdultCount) + (childPrice * bookingChildCount);

        await createBookingViaAPI({
          tenant_id: userProfile!.tenant_id,
          service_id: selectedService!,
          slot_id: selectedSlot.slot_id,
          employee_id: selectedSlot.employee_id,
          offer_id: selectedOffer || null,
          customer_name: bookingForm.customer_name,
          customer_phone: fullPhoneNumber,
          customer_email: bookingForm.customer_email || null,
          visitor_count: bookingAdultCount + bookingChildCount,
          adult_count: bookingAdultCount,
          child_count: bookingChildCount,
          total_price: bookingPrice,
          notes: bookingForm.notes || null,
          status: 'confirmed',
          payment_status: 'unpaid',
          created_by_user_id: userProfile!.id,
          booking_group_id: bookingGroupId
        });
      }
    }
  }

  async function handleConsecutiveBooking(service: Service, quantity: number, fullPhoneNumber: string) {
    // Use manually selected slots
    if (selectedSlots.length === 0) {
      throw new Error('Please select time slots first');
    }

    const validation = validateSlotSelection();
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    // Get employee ID from first selected slot (all should be same employee for consecutive)
    const employeeId = selectedSlots[0].employee_id;

    // Generate a group ID for all bookings in this transaction
    const bookingGroupId = crypto.randomUUID();

    // Create bookings for each manually selected slot
    // Distribute adult_count and child_count across bookings
    let adultRemaining = bookingForm.adult_count;
    let childRemaining = bookingForm.child_count;
    const adultPrice = service.adult_price || service.base_price || 0;
    const childPrice = service.child_price || adultPrice;

    for (const selectedSlot of selectedSlots) {
      // Assign tickets: prioritize adults, then children
      let bookingAdultCount = 0;
      let bookingChildCount = 0;
      
      if (adultRemaining > 0) {
        bookingAdultCount = 1;
        adultRemaining--;
      } else if (childRemaining > 0) {
        bookingChildCount = 1;
        childRemaining--;
      }
      
      const bookingPrice = (adultPrice * bookingAdultCount) + (childPrice * bookingChildCount);

      await createBookingViaAPI({
        tenant_id: userProfile!.tenant_id,
        service_id: selectedService!,
        slot_id: selectedSlot.slot_id,
        employee_id: employeeId,
        offer_id: selectedOffer || null,
        customer_name: bookingForm.customer_name,
        customer_phone: fullPhoneNumber,
        customer_email: bookingForm.customer_email || null,
        visitor_count: bookingAdultCount + bookingChildCount,
        adult_count: bookingAdultCount,
        child_count: bookingChildCount,
        total_price: bookingPrice,
        notes: bookingForm.notes || null,
        status: 'confirmed',
        payment_status: 'unpaid',
        created_by_user_id: userProfile!.id,
        booking_group_id: bookingGroupId
      });
    }
  }

  async function handleMultiServiceBookingWithList(servicesToBook: Array<{service: Service, slot: Slot, employeeId: string}>) {
    if (!userProfile?.tenant_id) return;
    if (servicesToBook.length === 0) {
      alert(t('reception.noServicesSelected'));
      return;
    }

    try {
      // Construct full phone number
      const fullPhoneNumber = `${countryCode}${bookingForm.customer_phone}`;

      // Save or update customer record
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id, total_bookings')
        .eq('tenant_id', userProfile.tenant_id)
        .eq('phone', fullPhoneNumber)
        .maybeSingle();

      if (existingCustomer) {
        await supabase
          .from('customers')
          .update({
            name: bookingForm.customer_name,
            email: bookingForm.customer_email || null,
            last_booking_at: new Date().toISOString(),
            total_bookings: existingCustomer.total_bookings + servicesToBook.length
          })
          .eq('id', existingCustomer.id);
      } else {
        await supabase
          .from('customers')
          .insert({
            tenant_id: userProfile.tenant_id,
            phone: fullPhoneNumber,
            name: bookingForm.customer_name,
            email: bookingForm.customer_email || null,
            last_booking_at: new Date().toISOString(),
            total_bookings: servicesToBook.length
          });
      }

      // Group services by service_id (same service = same group)
      const serviceGroups = new Map<string, Array<{service: Service, slot: Slot, employeeId: string}>>();
      servicesToBook.forEach(item => {
        if (!serviceGroups.has(item.service.id)) {
          serviceGroups.set(item.service.id, []);
        }
        serviceGroups.get(item.service.id)!.push(item);
      });

      // Create bookings for each service, grouped by service_id
      const bookingPromises = Array.from(serviceGroups.entries()).flatMap(([serviceId, items]) => {
        // Generate one group ID per service
        const bookingGroupId = crypto.randomUUID();

        // Determine how many bookings can use package for this service
        const packageCheck = checkServiceInPackage(serviceId);
        const service = services.find(s => s.id === serviceId);
        let packageUsedCount = 0;

        return items.map(async (item, index) => {
          console.log('Creating booking for service:', item.service.name, 'slot:', item.slot.id, 'group:', bookingGroupId);

          // Determine if this specific booking can use the package
          const canUsePackage = packageCheck.available && packageUsedCount < packageCheck.remaining;
          const usePackage = canUsePackage;
          const price = usePackage ? 0 : (service?.base_price || 0);

          if (usePackage) {
            packageUsedCount++;
          }

          // Calculate price for this booking
          const serviceForBooking = services.find(s => s.id === item.service.id);
          // If an offer is selected, use offer price; otherwise use base_price
          let adultPriceForBooking = serviceForBooking?.base_price || 0;
          if (selectedOffer) {
            const offer = serviceForBooking?.offers?.find(o => o.id === selectedOffer);
            if (offer) {
              adultPriceForBooking = offer.price;
            }
          }
          // Child price is mandatory and set by service provider (offers don't affect child price)
          const childPriceForBooking = serviceForBooking?.child_price || adultPriceForBooking;
          
          // Check if this is a multi-ticket booking in a single slot
          const isMultiTicketInSingleSlot = item.service.id === selectedService && 
                                           bookingForm.visitor_count > 1 && 
                                           item.slot.available_capacity >= bookingForm.visitor_count;
          
          // Use actual ticket counts if multi-ticket in single slot, otherwise use 1 adult
          const bookingAdultCount = isMultiTicketInSingleSlot ? bookingForm.adult_count : 1;
          const bookingChildCount = isMultiTicketInSingleSlot ? bookingForm.child_count : 0;
          const bookingVisitorCount = isMultiTicketInSingleSlot ? bookingForm.visitor_count : 1;
          const bookingPrice = usePackage ? 0 : ((adultPriceForBooking * bookingAdultCount) + (childPriceForBooking * bookingChildCount));

          // Insert booking via API
          try {
            const bookingData = await createBookingViaAPI({
              tenant_id: userProfile.tenant_id!,
              service_id: item.service.id,
              slot_id: item.slot.id,
              employee_id: item.employeeId || null,
              offer_id: selectedOffer || null,
              customer_name: bookingForm.customer_name,
              customer_phone: fullPhoneNumber,
              customer_email: bookingForm.customer_email || null,
              visitor_count: bookingVisitorCount,
              adult_count: bookingAdultCount,
              child_count: bookingChildCount,
              total_price: bookingPrice,
              notes: bookingForm.notes || null,
              status: 'confirmed',
              payment_status: usePackage ? 'paid' : 'unpaid',
              package_subscription_id: usePackage && customerPackage ? customerPackage.id : null,
              created_by_user_id: userProfile.id,
              booking_group_id: bookingGroupId
            });

            console.log('Booking created:', bookingData);
            // Note: Slot capacity and package usage are automatically updated by database triggers
            return { ...bookingData, usedPackage: usePackage };
          } catch (error: any) {
            console.error('Error creating booking:', error);
            throw error;
          }
        });
      });

      const results = await Promise.all(bookingPromises);
      console.log('All bookings created successfully:', results);

      // Count package vs paid bookings
      const packageBookings = results.filter(r => r.usedPackage).length;
      const paidBookings = results.length - packageBookings;

      // Wait a moment for database triggers to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Refresh bookings and slots
      console.log('Refreshing bookings list and slots...');
      await Promise.all([
        fetchBookings(),
        // Refresh slots if we have a selected service and date
        selectedService && selectedDate ? fetchAvailableSlots() : Promise.resolve()
      ]);
      console.log('Bookings and slots refreshed');

      let message = `Successfully created ${servicesToBook.length} booking(s)!`;
      if (packageBookings > 0) {
        message += `\n${packageBookings} from package, ${paidBookings} paid.`;
      }

      console.log('Bookings created successfully, about to show alert');
      alert(message);
      console.log('Alert shown, closing modal');
      setIsModalOpen(false);
      console.log('Modal closed, resetting form');
      resetForm();
      console.log('Form reset complete');
    } catch (err: any) {
      console.error('Error creating multi-service bookings:', err);
      console.error('Error stack:', err.stack);
      alert(`Error: ${err.message}`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Collect all services to book (from list + currently selected)
    let servicesToBook = [...selectedServices];

    // If there's a currently selected service (not yet added to list), add it
    if (selectedService) {
      const service = services.find(s => s.id === selectedService);
      if (service) {
        // Check if this is a multi-quantity booking
        if (bookingForm.visitor_count > 1) {
          // First, check if a single slot has enough capacity (preferred option)
          if (selectedTimeSlot) {
            const slotsAtTime = slots.filter(
              s => s.start_time === selectedTimeSlot.start_time &&
                   s.end_time === selectedTimeSlot.end_time &&
                   s.available_capacity > 0
            );
            
            const slotWithEnoughCapacity = slotsAtTime.find(s => s.available_capacity >= bookingForm.visitor_count);
            
            if (slotWithEnoughCapacity) {
              // Book all tickets in the same slot - add to servicesToBook
              servicesToBook.push({
                service,
                slot: slotWithEnoughCapacity,
                employeeId: slotWithEnoughCapacity.employee_id || ''
              });
            } else if (selectedSlots.length > 0) {
              // No single slot has enough capacity, use manually selected slots
              if (bookingForm.booking_option === 'parallel' && selectedSlots.length === 1) {
                // Parallel mode: Only 1 slot selected, need to find multiple employees at same time
                const selectedSlotData = selectedSlots[0];
                const slotsAtSameTime = slots.filter(
                  s => s.start_time === selectedSlotData.start_time &&
                       s.end_time === selectedSlotData.end_time &&
                       s.available_capacity > 0
                );

                // Add booking for each available employee (up to quantity)
                const slotsToUse = slotsAtSameTime.slice(0, bookingForm.visitor_count);
                for (const slot of slotsToUse) {
                  servicesToBook.push({
                    service,
                    slot,
                    employeeId: slot.employee_id || ''
                  });
                }
              } else {
                // Consecutive mode: Add all manually selected slots
                for (const selectedSlotData of selectedSlots) {
                  const slot = slots.find(s => s.id === selectedSlotData.slot_id);
                  if (slot) {
                    servicesToBook.push({
                      service,
                      slot,
                      employeeId: selectedSlotData.employee_id
                    });
                  }
                }
              }
            }
          } else if (selectedSlots.length > 0) {
            // No time slot selected but slots manually selected
            if (bookingForm.booking_option === 'parallel' && selectedSlots.length === 1) {
              // Parallel mode: Only 1 slot selected, need to find multiple employees at same time
              const selectedSlotData = selectedSlots[0];
              const slotsAtSameTime = slots.filter(
                s => s.start_time === selectedSlotData.start_time &&
                     s.end_time === selectedSlotData.end_time &&
                     s.available_capacity > 0
              );

              // Add booking for each available employee (up to quantity)
              const slotsToUse = slotsAtSameTime.slice(0, bookingForm.visitor_count);
              for (const slot of slotsToUse) {
                servicesToBook.push({
                  service,
                  slot,
                  employeeId: slot.employee_id || ''
                });
              }
            } else {
              // Consecutive mode: Add all manually selected slots
              for (const selectedSlotData of selectedSlots) {
                const slot = slots.find(s => s.id === selectedSlotData.slot_id);
                if (slot) {
                  servicesToBook.push({
                    service,
                    slot,
                    employeeId: selectedSlotData.employee_id
                  });
                }
              }
            }
          }
        } else if (assignmentMode === 'automatic' && selectedTimeSlot || assignmentMode === 'manual' && selectedSlot) {
          // Single booking or quantity 1
          let slotToAdd: Slot | undefined;
          let employeeId = '';

          if (assignmentMode === 'automatic') {
            const slotsAtTime = slots.filter(
              s => s.start_time === selectedTimeSlot!.start_time &&
                   s.end_time === selectedTimeSlot!.end_time &&
                   s.available_capacity > 0
            );
            slotToAdd = slotsAtTime[0];
            if (slotToAdd) {
              employeeId = slotToAdd.employee_id || '';
            }
          } else {
            slotToAdd = slots.find(s => s.id === selectedSlot);
            employeeId = selectedEmployee || (slotToAdd?.employee_id || '');
          }

          if (slotToAdd && !servicesToBook.some(s => s.service.id === service.id)) {
            servicesToBook.push({
              service,
              slot: slotToAdd,
              employeeId
            });
          }
        }
      }
    }

    // Handle multi-service booking if we have services
    if (servicesToBook.length > 0) {
      await handleMultiServiceBookingWithList(servicesToBook);
      return;
    }

    if (!userProfile?.tenant_id) return;
    alert('Please select at least one service and time slot');
    return;

    const service = services.find(s => s.id === selectedService);
    if (!service) return;

    // ARCHIVED: Employee validation removed - all services are service-based now
    // if (assignmentMode === 'manual' && !selectedEmployee && service.capacity_mode !== 'service_based') {
    //   alert('Please select an employee');
    //   return;
    // }

    if (assignmentMode === 'automatic' && !selectedTimeSlot) {
      alert('Please select a time slot');
      return;
    }

    if (assignmentMode === 'manual' && !selectedSlot) {
      alert('Please select a time slot');
      return;
    }

    try {
      // Handle quantity-based booking
      if (bookingForm.visitor_count > 1) {
        await handleQuantityBooking(service);
        return;
      }

      // Handle single booking (original logic)
      let employeeId: string;
      let slotId: string;

      if (assignmentMode === 'automatic') {
        // Use the selected time slot info
        if (!selectedTimeSlot) {
          alert('Please select a time slot');
          return;
        }

        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        console.log('=== AUTOMATIC BOOKING DEBUG ===');
        console.log('Selected date:', dateStr);
        console.log('Selected time:', selectedTimeSlot);
        console.log('All available slots:', slots);
        console.log('Selected service:', selectedService);
        console.log('Service capacity mode:', service.capacity_mode);

        // Find all slots at this time (same start_time and end_time)
        const slotsAtSelectedTime = slots.filter(
          s => s.start_time === selectedTimeSlot.start_time &&
               s.end_time === selectedTimeSlot.end_time &&
               s.available_capacity > 0
        );

        console.log('Slots matching time filter:', slotsAtSelectedTime);

        if (slotsAtSelectedTime.length === 0) {
          alert('No available slots at this time');
          return;
        }

        // ARCHIVED: Employee-based capacity removed - always use service-based
        // Just pick the first available slot (no employee needed)
        const availableSlot = slotsAtSelectedTime[0];
        slotId = availableSlot.id;
        employeeId = availableSlot.employee_id || ''; // Can be null for service-based
        console.log('Service-based capacity - Slot ID:', slotId, 'Employee ID:', employeeId || 'None');
      } else {
        // Manual mode
        const slot = slots.find(s => s.id === selectedSlot);
        if (!slot) {
          alert('Selected slot not found');
          return;
        }

        slotId = selectedSlot;

        // ARCHIVED: Employee-based removed - always service-based
        employeeId = slot.employee_id || '';
        
        // ARCHIVED: Employee validation removed
        // else {
        //   // Employee-based: validate employee selection
        //   if (!selectedEmployee) {
        //     alert('Please select an employee');
        //     return;
        //   }
        //   employeeId = selectedEmployee;
        //
        //   // Validate that the selected employee matches the slot's employee
        //   if (slot.employee_id !== selectedEmployee) {
        //     alert('Selected employee does not match the slot. Please select a slot for this employee.');
        //     return;
        //   }
        // }
      }

      const slot = slots.find(s => s.id === slotId)!;

      // Construct full phone number with country code
      const fullPhoneNumber = `${countryCode}${bookingForm.customer_phone}`;

      // Save or update customer record
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id, total_bookings')
        .eq('tenant_id', userProfile.tenant_id)
        .eq('phone', fullPhoneNumber)
        .maybeSingle();

      if (existingCustomer) {
        // Update existing customer
        await supabase
          .from('customers')
          .update({
            name: bookingForm.customer_name,
            email: bookingForm.customer_email || null,
            last_booking_at: new Date().toISOString(),
            total_bookings: existingCustomer.total_bookings + 1
          })
          .eq('id', existingCustomer.id);
      } else {
        // Create new customer
        await supabase
          .from('customers')
          .insert({
            tenant_id: userProfile.tenant_id,
            phone: fullPhoneNumber,
            name: bookingForm.customer_name,
            email: bookingForm.customer_email || null,
            last_booking_at: new Date().toISOString(),
            total_bookings: 1
          });
      }

      // Calculate total price based on adult/child pricing
      // If an offer is selected, use offer price; otherwise use base_price
      let adultPrice = service.base_price || 0;
      if (selectedOffer) {
        const offer = service.offers?.find(o => o.id === selectedOffer);
        if (offer) {
          adultPrice = offer.price;
        }
      }
      // Child price is mandatory and set by service provider (offers don't affect child price)
      const childPrice = service.child_price || adultPrice; // Fallback to adult price if child_price not set
      const totalPrice = (adultPrice * bookingForm.adult_count) + (childPrice * bookingForm.child_count);

      try {
        await createBookingViaAPI({
          tenant_id: userProfile.tenant_id,
          service_id: selectedService,
          slot_id: slotId,
          employee_id: employeeId || null,
          offer_id: selectedOffer || null,
          customer_name: bookingForm.customer_name,
          customer_phone: fullPhoneNumber,
          customer_email: bookingForm.customer_email || null,
          visitor_count: bookingForm.visitor_count,
          adult_count: bookingForm.adult_count,
          child_count: bookingForm.child_count,
          total_price: totalPrice,
          notes: bookingForm.notes || null,
          status: 'confirmed',
          payment_status: 'unpaid',
          created_by_user_id: userProfile.id
        });

        // Note: Slot capacity is updated by the backend API
        alert('Booking created successfully! Confirmation sent to customer.');
        setIsModalOpen(false);
        resetForm();
        fetchBookings();
        fetchAvailableSlots();
      } catch (err: any) {
        console.error('Error creating booking:', err);
        alert(`Error: ${err.message}`);
      }
    } catch (err: any) {
      console.error('Error in handleSubmit:', err);
      alert(`Error: ${err.message || 'Failed to create booking'}`);
    }
  }

  async function updateBookingStatus(bookingId: string, status: string) {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status, status_changed_at: new Date().toISOString() })
        .eq('id', bookingId);

      if (error) throw error;
      fetchBookings();
    } catch (err: any) {
      console.error('Error updating booking:', err);
      alert(`Error: ${err.message}`);
    }
  }

  async function updatePaymentStatus(bookingId: string, paymentStatus: string) {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ payment_status: paymentStatus })
        .eq('id', bookingId);

      if (error) throw error;
      fetchBookings();
    } catch (err: any) {
      console.error('Error updating payment status:', err);
      alert(`Error: ${err.message}`);
    }
  }

  // Validate QR Code
  async function validateQRCode(bookingId: string) {
    setQrValidating(true);
    setQrValidationResult(null);

    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('auth_token');

      const response = await fetch(`${API_URL}/bookings/validate-qr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ booking_id: bookingId }),
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text.substring(0, 200));
        setQrValidationResult({
          success: false,
          message: `Server returned ${response.status} ${response.statusText}. Please check the console for details.`,
          booking: null,
        });
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setQrValidationResult({
          success: false,
          message: data.error || 'Failed to validate QR code',
          booking: data.booking || null,
        });
        return;
      }

      setQrValidationResult({
        success: true,
        message: data.message || 'QR code validated successfully',
        booking: data.booking,
      });

      // Refresh bookings list
      await fetchBookings();

      // Auto-close after 3 seconds on success
      setTimeout(() => {
        setIsQRScannerOpen(false);
        setQrInputValue('');
        setQrValidationResult(null);
      }, 3000);
    } catch (err: any) {
      console.error('Error validating QR code:', err);
      setQrValidationResult({
        success: false,
        message: err.message || 'Failed to validate QR code',
      });
    } finally {
      setQrValidating(false);
    }
  }

  // Handle QR input (can be scanned or manually entered)
  function handleQRSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    
    const bookingId = qrInputValue.trim();
    if (!bookingId) {
      setQrValidationResult({
        success: false,
        message: i18n.language === 'ar' ? 'يرجى إدخال رقم الحجز' : 'Please enter booking ID',
      });
      return;
    }

    validateQRCode(bookingId);
  }

  async function lookupCustomerByPhone(fullPhoneNumber: string) {
    if (!fullPhoneNumber || fullPhoneNumber.length < 10 || !userProfile?.tenant_id) return;

    setIsLookingUpCustomer(true);
    
    // Extract country code and phone number
    let phoneNumber = fullPhoneNumber;
    let code = '+966'; // default
    
    for (const country of countryCodes) {
      if (fullPhoneNumber.startsWith(country.code)) {
        code = country.code;
        phoneNumber = fullPhoneNumber.replace(country.code, '');
        break;
      }
    }
    setCustomerPackage(null);
    try {
      // First, try to find in customers table
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('id, name, email, phone')
        .eq('tenant_id', userProfile.tenant_id)
        .eq('phone', fullPhoneNumber)
        .maybeSingle();

      if (customerError) throw customerError;

      if (customerData) {
        // Customer found in customers table
        setBookingForm(prev => ({
          ...prev,
          customer_name: customerData.name,
          customer_email: customerData.email || ''
        }));

        // Fetch active package subscription
        const { data: subscriptionData } = await supabase
          .from('package_subscriptions')
          .select(`
            id,
            package_id,
            status,
            expires_at,
            service_packages(name, name_ar, total_price)
          `)
          .eq('customer_id', customerData.id)
          .eq('status', 'active')
          .maybeSingle();

        if (subscriptionData) {
          // Check if not expired
          const isExpired = subscriptionData.expires_at && new Date(subscriptionData.expires_at) < new Date();
          if (!isExpired) {
            // Fetch usage details
            const { data: usageData } = await supabase
              .from('package_subscription_usage')
              .select(`
                service_id,
                original_quantity,
                remaining_quantity,
                used_quantity,
                services(name, name_ar)
              `)
              .eq('subscription_id', subscriptionData.id);

            setCustomerPackage({
              ...subscriptionData,
              usage: usageData || []
            } as CustomerPackage);
          }
        }
      } else {
        // Customer not found in customers table, check bookings table for guest bookings
        const { data: bookingData, error: bookingError } = await supabase
          .from('bookings')
          .select('customer_name, customer_email, customer_phone')
          .eq('tenant_id', userProfile.tenant_id)
          .eq('customer_phone', fullPhoneNumber)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (bookingError) {
          console.error('Error looking up booking:', bookingError);
        } else if (bookingData) {
          // Guest booking found, auto-fill name and email
          setBookingForm(prev => ({
            ...prev,
            customer_name: bookingData.customer_name || '',
            customer_email: bookingData.customer_email || ''
          }));
        } else {
          // No customer or booking found, clear the form
          setBookingForm(prev => ({
            ...prev,
            customer_name: '',
            customer_email: ''
          }));
        }
      }
    } catch (err) {
      console.error('Error looking up customer:', err);
    } finally {
      setIsLookingUpCustomer(false);
    }
  }

  // Helper function to check if two time slots overlap
  function doSlotsOverlap(slot1Start: string, slot1End: string, slot2Start: string, slot2End: string): boolean {
    // Convert time strings to comparable format (assuming HH:MM:SS format)
    return slot1Start < slot2End && slot2Start < slot1End;
  }

  // Check if service is available in customer's package
  function checkServiceInPackage(serviceId: string): { available: boolean; remaining: number } {
    if (!customerPackage) return { available: false, remaining: 0 };

    const usage = customerPackage.usage.find(u => u.service_id === serviceId);
    if (!usage) return { available: false, remaining: 0 };

    return {
      available: usage.remaining_quantity > 0,
      remaining: usage.remaining_quantity
    };
  }

  // Calculate booking price considering package availability AND already selected services in current session
  function calculateBookingPrice(serviceId: string, quantity: number, alreadySelectedCount: number = 0): { price: number; usePackage: boolean; canUsePackage: boolean } {
    const service = services.find(s => s.id === serviceId);
    if (!service) return { price: 0, usePackage: false, canUsePackage: false };

    const packageCheck = checkServiceInPackage(serviceId);

    // Calculate remaining after accounting for already selected services in this session
    const effectiveRemaining = packageCheck.remaining - alreadySelectedCount;

    if (packageCheck.available && effectiveRemaining >= quantity) {
      return { price: 0, usePackage: true, canUsePackage: true };
    }

    return {
      price: service.base_price * quantity,
      usePackage: false,
      canUsePackage: effectiveRemaining > 0
    };
  }

  // Get all booked time slots from selectedServices to avoid conflicts
  function getBookedTimeSlots() {
    return selectedServices.map(item => ({
      start_time: item.slot.start_time,
      end_time: item.slot.end_time
    }));
  }

  // Filter slots to exclude those that conflict with already selected services
  function filterConflictingSlots(availableSlots: Slot[]): Slot[] {
    console.log(`[ReceptionPage filterConflictingSlots] Input: ${availableSlots.length} slots, selectedServices: ${selectedServices.length}`);
    
    if (selectedServices.length === 0) {
      console.log(`[ReceptionPage filterConflictingSlots] No selected services, returning all ${availableSlots.length} slots`);
      return availableSlots;
    }

    const bookedSlots = getBookedTimeSlots();
    console.log(`[ReceptionPage filterConflictingSlots] Booked slots: ${bookedSlots.length}`, bookedSlots);
    
    const filtered = availableSlots.filter(slot => {
      // Check if this slot overlaps with any already booked slot
      const overlaps = bookedSlots.some(booked =>
        doSlotsOverlap(slot.start_time, slot.end_time, booked.start_time, booked.end_time)
      );
      if (overlaps) {
        console.log(`[ReceptionPage filterConflictingSlots] Slot ${slot.start_time}-${slot.end_time} overlaps with booked slot, filtering out`);
      }
      return !overlaps;
    });
    
    console.log(`[ReceptionPage filterConflictingSlots] Output: ${filtered.length} slots (filtered out ${availableSlots.length - filtered.length})`);
    return filtered;
  }

  function resetForm() {
    setBookingForm({
      customer_phone: '',
      customer_name: '',
      customer_email: '',
      visitor_count: '',
      adult_count: 1,
      child_count: 0,
      notes: '',
      booking_option: 'consecutive'
    });
    setManualSlotAssignments([]);
    setShowPreview(false);
    setPreviewData(null);
    setSelectedSlots([]);
    setCountryCode('+966');
    setSelectedService('');
    setSelectedSlot('');
    setSelectedEmployee('');
    setSelectedTimeSlot(null);
    setSelectedDate(new Date());
    setAssignmentMode('automatic');
    setShowFullCalendar(false);
    setSelectedServices([]);
  }

  function getNext8Days() {
    const today = new Date();
    return Array.from({ length: 8 }, (_, i) => addDays(today, i));
  }

  function getCalendarWeeks() {
    // Get start of current week (Sunday)
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    // Generate 5 weeks (35 days)
    const weeks: Date[][] = [];
    for (let week = 0; week < 5; week++) {
      const weekDays: Date[] = [];
      for (let day = 0; day < 7; day++) {
        weekDays.push(addDays(weekStart, week * 7 + day));
      }
      weeks.push(weekDays);
    }
    return weeks;
  }

  function getBookingsForDate(date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd');
    return displayBookings.filter(booking => {
      const bookingDate = booking.slots?.slot_date;
      return bookingDate === dateStr;
    });
  }

  function getCalendarDaysInMonth() {
    const start = startOfMonth(calendarDate);
    const end = endOfMonth(calendarDate);
    return eachDayOfInterval({ start, end });
  }

  function generateTimeSlots() {
    const slots = [];
    const startHour = 6; // 6 AM
    const endHour = 22; // 10 PM
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(time);
      }
    }
    return slots;
  }

  function getBookingPosition(startTime: string) {
    const [hours, minutes] = startTime.split(':').map(Number);
    const startHour = 6;
    const totalMinutes = (hours - startHour) * 60 + minutes;
    return (totalMinutes / 30) * 60; // 60px per 30-min slot
  }

  function getBookingHeight(startTime: string, endTime: string) {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    const durationMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
    return (durationMinutes / 30) * 60; // 60px per 30-min slot
  }

  function calculateBookingLayout(bookings: Booking[]) {
    if (bookings.length === 0) return [];

    // Sort bookings by start time
    const sortedBookings = [...bookings].sort((a, b) => {
      return (a.slots?.start_time || '').localeCompare(b.slots?.start_time || '');
    });

    // Helper to check if two bookings overlap
    const overlaps = (booking1: Booking, booking2: Booking) => {
      const start1 = booking1.slots?.start_time || '';
      const end1 = booking1.slots?.end_time || '';
      const start2 = booking2.slots?.start_time || '';
      const end2 = booking2.slots?.end_time || '';
      return start1 < end2 && start2 < end1;
    };

    // Assign columns to bookings
    const layout: Array<{ booking: Booking; column: number; totalColumns: number }> = [];
    const columns: Booking[][] = [];

    sortedBookings.forEach(booking => {
      // Find the first column where this booking doesn't overlap
      let columnIndex = 0;
      for (let i = 0; i < columns.length; i++) {
        const hasOverlap = columns[i].some(b => overlaps(b, booking));
        if (!hasOverlap) {
          columnIndex = i;
          break;
        }
        columnIndex = i + 1;
      }

      // Add to column
      if (!columns[columnIndex]) {
        columns[columnIndex] = [];
      }
      columns[columnIndex].push(booking);

      // Find all overlapping bookings to determine total columns needed
      const overlappingBookings = sortedBookings.filter(b => overlaps(b, booking));
      const maxColumns = Math.max(
        ...overlappingBookings.map(b => {
          const existingLayout = layout.find(l => l.booking.id === b.id);
          return existingLayout ? existingLayout.column + 1 : columnIndex + 1;
        })
      );

      layout.push({
        booking,
        column: columnIndex,
        totalColumns: maxColumns
      });
    });

    // Update totalColumns for all overlapping bookings
    layout.forEach((item, index) => {
      const overlappingItems = layout.filter(other =>
        overlaps(item.booking, other.booking)
      );
      const maxCols = Math.max(...overlappingItems.map(i => i.column + 1));
      layout[index].totalColumns = maxCols;
    });

    return layout;
  }

  function BookingCard({ booking }: { booking: Booking }) {
    return (
      <Card key={booking.id}>
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-lg">{booking.customer_name}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span className="text-sm">{booking.customer_phone}</span>
                </div>
                {booking.customer_email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">{booking.customer_email}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Service:</span>
                  <div className="font-medium">
                    {i18n.language === 'ar' ? booking.services?.name_ar : booking.services?.name}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Date & Time:</span>
                  <div className="font-medium">
                    {format(parseISO(booking.slots?.slot_date), 'MMM dd, yyyy')}
                    <br />
                    {booking.slots?.start_time} - {booking.slots?.end_time}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Employee{(booking as any).employees?.length > 1 ? 's' : ''}:</span>
                  <div className="font-medium">
                    {(booking as any).employees && (booking as any).employees.length > 0 ?
                      (booking as any).employees.map((emp: any, idx: number) => (
                        <span key={emp.id}>
                          {i18n.language === 'ar' ? emp.full_name_ar : emp.full_name}
                          {idx < (booking as any).employees.length - 1 ? ', ' : ''}
                        </span>
                      ))
                      : 'N/A'}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">{t('booking.visitorCount')}:</span>
                  <div className="font-medium">
                    {(booking as any).groupCount || booking.visitor_count} • {(booking as any).grouped_total_price || booking.total_price} SAR
                  </div>
                </div>
              </div>
              {booking.notes && (
                <div className="mt-3 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  <strong>Notes:</strong> {booking.notes}
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row md:flex-col md:items-end gap-2">
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                  booking.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                  booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  booking.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                  booking.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {booking.status.toUpperCase()}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                  booking.payment_status === 'paid' || booking.payment_status === 'paid_manual' ? 'bg-emerald-100 text-emerald-800' :
                  booking.payment_status === 'unpaid' ? 'bg-orange-100 text-orange-800' :
                  booking.payment_status === 'awaiting_payment' ? 'bg-amber-100 text-amber-800' :
                  booking.payment_status === 'refunded' ? 'bg-purple-100 text-purple-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {booking.payment_status.toUpperCase().replace('_', ' ')}
                </span>
              </div>
              {booking.status !== 'cancelled' && (
                <div className="flex flex-col gap-2 w-full sm:w-auto">
                  <div className="flex flex-wrap gap-2">
                    {booking.status !== 'completed' && (
                      <>
                        {booking.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => updateBookingStatus(booking.id, 'confirmed')}
                            icon={<CheckCircle className="w-3 h-3" />}
                          >
                            {t('common.confirm')}
                          </Button>
                        )}
                        {booking.status === 'confirmed' && (
                          <Button
                            size="sm"
                            onClick={() => updateBookingStatus(booking.id, 'completed')}
                            icon={<CheckCircle className="w-3 h-3" />}
                          >
                            {t('reception.complete')}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => updateBookingStatus(booking.id, 'cancelled')}
                          icon={<XCircle className="w-3 h-3" />}
                        >
                          {t('common.cancel')}
                        </Button>
                      </>
                    )}
                  </div>
                  {(booking.payment_status === 'unpaid' || booking.payment_status === 'awaiting_payment') && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => updatePaymentStatus(booking.id, 'paid_manual')}
                      icon={<DollarSign className="w-3 h-3" />}
                      className="w-full"
                    >
                      {t('reception.markAsPaid')}
                    </Button>
                  )}
                  {(booking.payment_status === 'paid' || booking.payment_status === 'paid_manual') && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => updatePaymentStatus(booking.id, 'unpaid')}
                      icon={<DollarSign className="w-3 h-3" />}
                      className="w-full"
                    >
                      {t('reception.markAsUnpaid')}
                    </Button>
                  )}
                  
                  {/* QR Code Validation Button */}
                  {booking.status !== 'cancelled' && !(booking as any).qr_scanned && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setQrInputValue(booking.id);
                        setIsQRScannerOpen(true);
                        setQrValidationResult(null);
                      }}
                      icon={<QrCode className="w-3 h-3" />}
                      className="w-full"
                    >
                      {i18n.language === 'ar' ? 'مسح QR' : 'Scan QR'}
                    </Button>
                  )}
                  
                  {/* QR Already Scanned Indicator */}
                  {(booking as any).qr_scanned && (
                    <div className="w-full p-2 bg-green-50 border border-green-200 rounded-lg text-center">
                      <div className="flex items-center justify-center gap-2 text-green-800 text-xs">
                        <CheckCircle className="w-4 h-4" />
                        <span>{i18n.language === 'ar' ? 'تم مسح QR' : 'QR Scanned'}</span>
                      </div>
                      {(booking as any).qr_scanned_at && (
                        <div className="text-xs text-green-600 mt-1">
                          {format(parseISO((booking as any).qr_scanned_at), 'MMM dd, HH:mm')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Group bookings by booking_group_id and calculate totals
  function groupBookings(bookingList: Booking[]): Array<Booking & { grouped_quantity: number, grouped_total_price: number }> {
    const groupMap = new Map<string, Booking[]>();

    // Group bookings by booking_group_id
    bookingList.forEach(booking => {
      const groupId = booking.booking_group_id || booking.id;
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, []);
      }
      groupMap.get(groupId)!.push(booking);
    });

    // Create display bookings with aggregated quantity and price
    const result: Array<Booking & { grouped_quantity: number, grouped_total_price: number }> = [];
    groupMap.forEach((group) => {
      // Use first booking as representative
      const representative = group[0];
      const totalQuantity = group.reduce((sum, b) => sum + b.visitor_count, 0);
      const totalPrice = group.reduce((sum, b) => sum + b.total_price, 0);

      result.push({
        ...representative,
        grouped_quantity: totalQuantity,
        grouped_total_price: totalPrice
      });
    });

    return result;
  }

  const displayBookings = groupBookings(activeTab === 'today' ? todayBookings : bookings);

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('reception.title')}</h1>
              <p className="text-xs md:text-sm text-gray-600">{t('reception.welcome')}, {i18n.language === 'ar' ? userProfile?.full_name_ar : userProfile?.full_name}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                icon={<Package className="w-4 h-4" />}
                onClick={() => setIsSubscriptionModalOpen(true)}
              >
                <span className="hidden sm:inline">{t('packages.addSubscription')}</span>
                <span className="sm:hidden">Add</span>
              </Button>
              <LanguageToggle />
              <Button
                variant="secondary"
                size="sm"
                icon={<LogOut className="w-4 h-4" />}
                onClick={() => signOut()}
              >
                <span className="hidden sm:inline">{t('auth.logout')}</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Button
              variant={activeTab === 'today' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('today')}
            >
              {t('dashboard.today')} ({todayBookings.length})
            </Button>
            <Button
              variant={activeTab === 'all' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('all')}
            >
              {t('reception.allBookings')} ({bookings.length})
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <Button
                variant={viewMode === 'list' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setViewMode('list')}
                icon={<List className="w-4 h-4" />}
              >
                <span className="hidden sm:inline">List</span>
              </Button>
              <Button
                variant={viewMode === 'calendar' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setViewMode('calendar')}
                icon={<Grid className="w-4 h-4" />}
              >
                <span className="hidden sm:inline">Calendar</span>
              </Button>
            </div>
            <Button
              onClick={() => setIsModalOpen(true)}
              icon={<Plus className="w-4 h-4" />}
              size="sm"
            >
              <span className="hidden sm:inline">{t('booking.newBooking')}</span>
              <span className="sm:hidden">New</span>
            </Button>
            <Button
              onClick={() => {
                setIsQRScannerOpen(true);
                setQrInputValue('');
                setQrValidationResult(null);
              }}
              icon={<Scan className="w-4 h-4" />}
              size="sm"
              variant="secondary"
            >
              <span className="hidden sm:inline">{i18n.language === 'ar' ? 'مسح QR' : 'Scan QR'}</span>
              <span className="sm:hidden">QR</span>
            </Button>
          </div>
        </div>

        {displayBookings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {activeTab === 'today' ? t('reception.noBookingsToday') : t('booking.noBookingsYet')}
              </h3>
              <p className="text-gray-600">{t('reception.createNewBooking')}</p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="space-y-4">
            {displayBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Calendar Navigation */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
              <div className="flex items-center gap-4">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ChevronLeft className="w-4 h-4" />}
                  onClick={() => setCalendarDate(addDays(calendarDate, -7))}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCalendarDate(new Date())}
                >
                  Today
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ChevronRight className="w-4 h-4" />}
                  onClick={() => setCalendarDate(addDays(calendarDate, 7))}
                />
              </div>
              <h2 className="text-lg font-semibold">
                {format(startOfWeek(calendarDate, { weekStartsOn: 0 }), 'MMM d')} - {format(addDays(startOfWeek(calendarDate, { weekStartsOn: 0 }), 6), 'MMM d, yyyy')}
              </h2>
            </div>

            {/* Week View Calendar */}
            <div className="overflow-x-auto">
              <div className="min-w-[1200px]">
                {/* Day Headers */}
                <div className="grid grid-cols-8 border-b bg-gray-50 sticky top-0 z-10">
                  <div className="px-2 py-3 text-xs font-medium text-gray-500 border-r">Time</div>
                  {Array.from({ length: 7 }, (_, i) => {
                    const day = addDays(startOfWeek(calendarDate, { weekStartsOn: 0 }), i);
                    const isToday = isSameDay(day, new Date());
                    return (
                      <div key={i} className={`px-2 py-3 text-center border-r ${
                        isToday ? 'bg-blue-50' : ''
                      }`}>
                        <div className="text-xs font-medium text-gray-500">
                          {format(day, 'EEE')}
                        </div>
                        <div className={`text-lg font-semibold ${
                          isToday ? 'text-blue-600' : 'text-gray-900'
                        }`}>
                          {format(day, 'd')}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Time Slots with Bookings */}
                <div className="relative">
                  <div className="grid grid-cols-8">
                    {/* Time Labels Column */}
                    <div className="border-r">
                      {generateTimeSlots().map((time, idx) => (
                        <div
                          key={idx}
                          className="h-[60px] px-2 py-1 text-xs text-gray-500 border-b text-right"
                        >
                          {time}
                        </div>
                      ))}
                    </div>

                    {/* Day Columns */}
                    {Array.from({ length: 7 }, (_, dayIndex) => {
                      const day = addDays(startOfWeek(calendarDate, { weekStartsOn: 0 }), dayIndex);
                      const dayBookings = getBookingsForDate(day);
                      const isToday = isSameDay(day, new Date());

                      return (
                        <div key={dayIndex} className={`relative border-r ${
                          isToday ? 'bg-blue-50/30' : ''
                        }`}>
                          {/* Time Grid */}
                          {generateTimeSlots().map((_, idx) => (
                            <div
                              key={idx}
                              className="h-[60px] border-b hover:bg-gray-50"
                            />
                          ))}

                          {/* Bookings Overlay */}
                          <div className="absolute inset-0 pointer-events-none">
                            {calculateBookingLayout(dayBookings).map(({ booking, column, totalColumns }) => {
                              const top = getBookingPosition(booking.slots?.start_time || '09:00');
                              const height = getBookingHeight(
                                booking.slots?.start_time || '09:00',
                                booking.slots?.end_time || '10:00'
                              );
                              const width = 100 / totalColumns;
                              const left = (100 / totalColumns) * column;

                              return (
                                <div
                                  key={booking.id}
                                  className={`absolute rounded shadow-sm border-l-4 p-2 cursor-pointer pointer-events-auto overflow-hidden ${
                                    booking.status === 'confirmed' ? 'bg-green-100 border-green-500 hover:bg-green-200' :
                                    booking.status === 'pending' ? 'bg-yellow-100 border-yellow-500 hover:bg-yellow-200' :
                                    booking.status === 'cancelled' ? 'bg-red-100 border-red-500 hover:bg-red-200' :
                                    booking.status === 'completed' ? 'bg-blue-100 border-blue-500 hover:bg-blue-200' :
                                    'bg-gray-100 border-gray-500 hover:bg-gray-200'
                                  }`}
                                  style={{
                                    top: `${top}px`,
                                    height: `${Math.max(height, 40)}px`,
                                    left: `calc(${left}% + 2px)`,
                                    width: `calc(${width}% - 4px)`
                                  }}
                                  onClick={() => setSelectedBookingForDetails(booking)}
                                >
                                  <div className="text-xs font-semibold truncate">
                                    {booking.slots?.start_time}
                                  </div>
                                  <div className="text-xs font-medium truncate">
                                    {booking.customer_name}
                                  </div>
                                  <div className="text-xs text-gray-600 truncate">
                                    {i18n.language === 'ar' ? booking.services?.name_ar : booking.services?.name}
                                  </div>
                                  {(booking as any).employees && (booking as any).employees.length > 0 && (
                                    <div className="text-xs text-gray-500 truncate mt-1">
                                      {(booking as any).employees.map((emp: any, idx: number) =>
                                        (i18n.language === 'ar' ? emp.full_name_ar : emp.full_name)
                                      ).join(', ')}
                                    </div>
                                  )}
                                </div>
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
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={showPreview ? 'Booking Preview' : t('reception.createNewBooking')}
      >
        {showPreview ? (
          <div className="space-y-6">
            {/* Booking Preview Ticket */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 shadow-lg">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Booking Summary</h3>
                <p className="text-sm text-gray-600 mt-1">Please review before confirming</p>
              </div>

              {/* Customer Information */}
              <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Customer Information
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Name:</span>
                    <div className="font-medium text-gray-900">{bookingForm.customer_name}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Phone:</span>
                    <div className="font-medium text-gray-900">{countryCode}{bookingForm.customer_phone}</div>
                  </div>
                  {bookingForm.customer_email && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Email:</span>
                      <div className="font-medium text-gray-900">{bookingForm.customer_email}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Service Information */}
              <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Service Details</h4>
                {(() => {
                  const service = services.find(s => s.id === selectedService);
                  if (!service) return null;
                  const packageCheck = checkServiceInPackage(service.id);
                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-gray-900">
                            {i18n.language === 'ar' ? service.name_ar : service.name}
                          </div>
                          <div className="text-sm text-gray-600">
                            {(() => {
                              const service = services.find(s => s.id === selectedService);
                              // Check if child_price is set (which means adult/child pricing is enabled)
                              const hasAdultChildPricing = service?.child_price !== null && service?.child_price !== undefined;
                              if (hasAdultChildPricing) {
                                return `${bookingForm.adult_count} adult${bookingForm.adult_count !== 1 ? 's' : ''}${bookingForm.child_count > 0 ? `, ${bookingForm.child_count} child${bookingForm.child_count !== 1 ? 'ren' : ''}` : ''}`;
                              }
                              return `Quantity: ${bookingForm.visitor_count}`;
                            })()}
                          </div>
                        </div>
                        <div className="text-right">
                          {packageCheck.available && packageCheck.remaining >= (bookingForm.visitor_count as number) ? (
                            <span className="text-green-600 font-semibold text-sm flex items-center gap-1">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                              </svg>
                              Package Service
                            </span>
                          ) : (
                            <span className="font-bold text-gray-900">
                              {(() => {
                                // Adult price is always base_price (discounted if discount exists)
                                const adultPrice = service.base_price || 0;
                                // Child price is mandatory and set by service provider
                                const childPrice = service.child_price || adultPrice;
                                return (adultPrice * bookingForm.adult_count) + (childPrice * bookingForm.child_count);
                              })()} SAR
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        Mode: {bookingForm.visitor_count === 1 ? 'Single Booking' : bookingForm.booking_option === 'parallel' ? 'Parallel Booking' : 'Consecutive Booking'}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Time Slots and Employees */}
              <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Schedule & Employees
                </h4>
                <div className="space-y-2">
                  {selectedSlots.length > 0 ? (
                    selectedSlots.map((slot, idx) => {
                      const employee = slots.find(s => s.id === slot.slot_id)?.users;
                      return (
                        <div key={idx} className="flex justify-between items-center py-2 border-b last:border-b-0">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {format(parseISO(slot.slot_date), 'MMM dd, yyyy')}
                            </div>
                            <div className="text-xs text-gray-600">
                              {slot.start_time} - {slot.end_time}
                            </div>
                          </div>
                          {employee && (
                            <div className="text-sm text-gray-700">
                              {i18n.language === 'ar' ? employee.full_name_ar : employee.full_name}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : selectedTimeSlot ? (
                    <div className="flex justify-between items-center py-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {format(parseISO(selectedTimeSlot.slot_date), 'MMM dd, yyyy')}
                        </div>
                        <div className="text-xs text-gray-600">
                          {selectedTimeSlot.start_time} - {selectedTimeSlot.end_time}
                        </div>
                      </div>
                      <div className="text-sm text-gray-600">
                        {assignmentMode === 'automatic' ? 'Auto-assigned' : 'Manual assignment'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">No time slot selected</div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {bookingForm.notes && (
                <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Notes</h4>
                  <p className="text-sm text-gray-600">{bookingForm.notes}</p>
                </div>
              )}

              {/* Total Price */}
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-lg p-4 text-white">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold">Total Price:</span>
                  <span className="text-2xl font-bold">
                    {(() => {
                      const service = services.find(s => s.id === selectedService);
                      if (!service) return '0 SAR';
                      const packageCheck = checkServiceInPackage(service.id);
                      if (packageCheck.available && packageCheck.remaining >= (bookingForm.visitor_count as number)) {
                        return 'Package Service (0 SAR)';
                      }
                      const adultPrice = service.adult_price || service.base_price || 0;
                      const childPrice = service.child_price || adultPrice;
                      return `${(adultPrice * bookingForm.adult_count) + (childPrice * bookingForm.child_count)} SAR`;
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setShowPreview(false)}
              >
                Edit Booking
              </Button>
              <Button
                type="button"
                fullWidth
                onClick={async () => {
                  setShowPreview(false);
                  // This will trigger the actual booking submission
                  const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                  await handleSubmit(submitEvent as any);
                }}
              >
                Confirm Booking
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={(e) => {
          e.preventDefault();
          // Show preview instead of directly submitting
          setShowPreview(true);
        }} className="space-y-4">
          {/* 1. Customer Mobile */}
          <div className="relative">
            <PhoneInput
              label={t('booking.customerPhone')}
              value={customerPhoneFull}
              onChange={(value) => {
                setCustomerPhoneFull(value);
                // Extract phone number without country code for backward compatibility
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
                setBookingForm({ ...bookingForm, customer_phone: phoneNumber });
                // Lookup customer when phone number is long enough
                if (phoneNumber.length >= 8) {
                  lookupCustomerByPhone(value);
                }
              }}
              defaultCountry="+966"
              required
            />
            {isLookingUpCustomer && (
              <div className="absolute right-3 top-[38px]">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>

          {/* 2. Customer Name */}
          <Input
            label={`${t('booking.customerName')} *`}
            value={bookingForm.customer_name}
            onChange={(e) => setBookingForm({ ...bookingForm, customer_name: e.target.value })}
            required
            placeholder={t('booking.customerName')}
          />

          {/* 3. Customer Email */}
          <Input
            label={t('booking.customerEmail')}
            type="email"
            value={bookingForm.customer_email}
            onChange={(e) => setBookingForm({ ...bookingForm, customer_email: e.target.value })}
            placeholder={t('booking.customerEmail')}
          />

          {/* Package Information Display */}
          {customerPackage && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <h4 className="font-semibold text-green-900">
                  {t('packages.activePackage')}: {i18n.language === 'ar' ? customerPackage.service_packages.name_ar : customerPackage.service_packages.name}
                </h4>
              </div>
              <div className="space-y-2 text-sm">
                {customerPackage.usage.map((usage) => (
                  <div key={usage.service_id} className="flex justify-between items-center py-1">
                    <span className={usage.remaining_quantity === 0 ? 'text-gray-400 line-through' : 'text-gray-700'}>
                      {i18n.language === 'ar' ? usage.services.name_ar : usage.services.name}
                    </span>
                    <span className={`font-medium ${
                      usage.remaining_quantity > 5 ? 'text-green-600' :
                      usage.remaining_quantity > 0 ? 'text-amber-600' :
                      'text-red-600'
                    }`}>
                      {usage.remaining_quantity} / {usage.original_quantity} {t('packages.remaining')}
                    </span>
                  </div>
                ))}
              </div>
              {customerPackage.expires_at && (
                <p className="text-xs text-gray-600 mt-2">
                  {t('packages.expiresOn')}: {new Date(customerPackage.expires_at).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {/* 4. Select Service */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('reception.selectService')} *
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={selectedService}
              onChange={(e) => {
                setSelectedService(e.target.value);
                setSelectedOffer(''); // Reset offer when service changes
                setSelectedSlot('');
              }}
              required
            >
              <option value="">{t('reception.chooseService')}</option>
              {services.map((service) => {
                const packageCheck = checkServiceInPackage(service.id);
                return (
                  <option key={service.id} value={service.id}>
                    {i18n.language === 'ar' ? service.name_ar : service.name} - {service.base_price} SAR
                    {packageCheck.available && ` 🎁 (${packageCheck.remaining} ${t('packages.remaining')})`}
                    {service.offers && service.offers.length > 0 && ` (${service.offers.length} ${i18n.language === 'ar' ? 'عروض' : 'offers'})`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* 4b. Select Offer (if service has offers) */}
          {selectedService && (() => {
            const service = services.find(s => s.id === selectedService);
            const availableOffers = service?.offers || [];
            
            if (availableOffers.length > 0) {
              return (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {i18n.language === 'ar' ? 'اختر العرض (اختياري)' : 'Select Offer (Optional)'}
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={selectedOffer}
                    onChange={(e) => setSelectedOffer(e.target.value)}
                  >
                    <option value="">{i18n.language === 'ar' ? 'السعر الأساسي' : 'Base Price'} ({service?.base_price} SAR)</option>
                    {availableOffers.map((offer) => (
                      <option key={offer.id} value={offer.id}>
                        {i18n.language === 'ar' ? offer.name_ar || offer.name : offer.name} - {offer.price} SAR
                        {offer.discount_percentage && ` (${i18n.language === 'ar' ? 'خصم' : 'Save'} ${offer.discount_percentage}%)`}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }
            return null;
          })()}

          {/* 5. Ticket Type and Quantity */}
          {selectedService && (() => {
            const service = services.find(s => s.id === selectedService);
            // Check if child_price is set (which means adult/child pricing is enabled)
            const hasAdultChildPricing = service?.child_price !== null && service?.child_price !== undefined;
            
            return (
              <div className="space-y-4">
                {hasAdultChildPricing ? (
                  <>
                    {/* Adult/Child Ticket Selection */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Ticket Type & Quantity</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Adult Tickets *
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (bookingForm.adult_count > 0) {
                                  const newAdultCount = bookingForm.adult_count - 1;
                                  const newVisitorCount = newAdultCount + bookingForm.child_count;
                                  setBookingForm({ 
                                    ...bookingForm, 
                                    adult_count: newAdultCount,
                                    visitor_count: newVisitorCount || ''
                                  });
                                }
                              }}
                              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                              disabled={bookingForm.adult_count <= 0}
                            >
                              -
                            </button>
                            <Input
                              type="number"
                              min="0"
                              value={bookingForm.adult_count}
                              onChange={(e) => {
                                const adultCount = parseInt(e.target.value) || 0;
                                const newVisitorCount = adultCount + bookingForm.child_count;
                                setBookingForm({ 
                                  ...bookingForm, 
                                  adult_count: adultCount,
                                  visitor_count: newVisitorCount || ''
                                });
                              }}
                              className="text-center"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newAdultCount = bookingForm.adult_count + 1;
                                const newVisitorCount = newAdultCount + bookingForm.child_count;
                                setBookingForm({ 
                                  ...bookingForm, 
                                  adult_count: newAdultCount,
                                  visitor_count: newVisitorCount || ''
                                });
                              }}
                              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                              +
                            </button>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            {service?.base_price || 0} SAR per ticket
                            {service?.original_price && service?.original_price > service?.base_price && (
                              <span className="text-green-600 ml-1">(Discounted)</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Child Tickets
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (bookingForm.child_count > 0) {
                                  const newChildCount = bookingForm.child_count - 1;
                                  const newVisitorCount = bookingForm.adult_count + newChildCount;
                                  setBookingForm({ 
                                    ...bookingForm, 
                                    child_count: newChildCount,
                                    visitor_count: newVisitorCount || ''
                                  });
                                }
                              }}
                              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                              disabled={bookingForm.child_count <= 0}
                            >
                              -
                            </button>
                            <Input
                              type="number"
                              min="0"
                              value={bookingForm.child_count}
                              onChange={(e) => {
                                const childCount = parseInt(e.target.value) || 0;
                                const newVisitorCount = bookingForm.adult_count + childCount;
                                setBookingForm({ 
                                  ...bookingForm, 
                                  child_count: childCount,
                                  visitor_count: newVisitorCount || ''
                                });
                              }}
                              className="text-center"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newChildCount = bookingForm.child_count + 1;
                                const newVisitorCount = bookingForm.adult_count + newChildCount;
                                setBookingForm({ 
                                  ...bookingForm, 
                                  child_count: newChildCount,
                                  visitor_count: newVisitorCount || ''
                                });
                              }}
                              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                              +
                            </button>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            {service?.child_price || service?.base_price || 0} SAR per ticket
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">Total Visitors:</span>
                          <span className="text-lg font-bold text-blue-600">
                            {bookingForm.adult_count + bookingForm.child_count}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-sm font-medium text-gray-700">Total Price:</span>
                          <span className="text-lg font-bold text-gray-900">
                            {(() => {
                              // Adult price is always base_price (discounted if discount exists)
                              const adultPrice = service?.base_price || 0;
                              // Child price is mandatory and set by service provider
                              const childPrice = service?.child_price || adultPrice;
                              return (adultPrice * bookingForm.adult_count) + (childPrice * bookingForm.child_count);
                            })()} SAR
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <Input
                    label={`${t('booking.visitorCount')} *`}
                    type="number"
                    min="1"
                    value={bookingForm.visitor_count}
                    onChange={(e) => {
                      const visitorCount = e.target.value ? parseInt(e.target.value) : '';
                      setBookingForm({ 
                        ...bookingForm, 
                        visitor_count: visitorCount,
                        adult_count: typeof visitorCount === 'number' ? visitorCount : 1,
                        child_count: 0
                      });
                    }}
                    required
                    placeholder="Enter quantity"
                  />
                )}
              </div>
            );
          })()}

          {/* 6. Notes */}
          {selectedService && bookingForm.visitor_count && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('booking.notes')}
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                value={bookingForm.notes}
                onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                placeholder={t('booking.notes')}
              />
            </div>
          )}

          {/* Add Service Button */}
          {selectedService && (assignmentMode === 'automatic' && selectedTimeSlot || assignmentMode === 'manual' && selectedSlot) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 mb-2">
                {t('reception.multiServiceNote')}
              </p>
              <button
                type="button"
                onClick={() => {
                  const service = services.find(s => s.id === selectedService);
                  if (!service) return;

                  let slotToAdd: Slot | undefined;
                  let employeeId = '';

                  if (assignmentMode === 'automatic') {
                    // Find the slot at the selected time
                    const slotsAtTime = slots.filter(
                      s => s.start_time === selectedTimeSlot!.start_time &&
                           s.end_time === selectedTimeSlot!.end_time &&
                           s.available_capacity > 0
                    );
                    slotToAdd = slotsAtTime[0];
                    if (slotToAdd) {
                      employeeId = slotToAdd.employee_id || '';
                    }
                  } else {
                    slotToAdd = slots.find(s => s.id === selectedSlot);
                    employeeId = selectedEmployee || (slotToAdd?.employee_id || '');
                  }

                  if (!slotToAdd) {
                    alert(t('reception.slotNotSelected'));
                    return;
                  }

                  // Check if service already added
                  if (selectedServices.some(s => s.service.id === service.id)) {
                    alert('Service already added');
                    return;
                  }

                  // Check for time slot conflicts
                  const bookedSlots = getBookedTimeSlots();
                  const hasConflict = bookedSlots.some(booked =>
                    doSlotsOverlap(slotToAdd!.start_time, slotToAdd!.end_time, booked.start_time, booked.end_time)
                  );

                  if (hasConflict) {
                    alert(t('reception.timeConflict'));
                    return;
                  }

                  setSelectedServices([...selectedServices, {
                    service,
                    slot: slotToAdd,
                    employeeId
                  }]);

                  // Reset selection
                  setSelectedService('');
                  setSelectedSlot('');
                  setSelectedEmployee('');
                  setSelectedTimeSlot(null);
                  setSlots([]);
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                {t('reception.addService')}
              </button>
            </div>
          )}

          {/* Selected Services List */}
          {selectedServices.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-green-900 mb-3">{t('reception.selectedServices')}</h4>
              <div className="space-y-2">
                {selectedServices.map((item, index) => (
                  <div key={index} className="flex items-center justify-between bg-white p-3 rounded-lg border border-green-200">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {i18n.language === 'ar' ? item.service.name_ar : item.service.name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {item.slot.start_time} - {item.slot.end_time}
                        {item.employeeId && item.slot.users && (
                          <span className="ml-2">
                            ({i18n.language === 'ar' ? item.slot.users.full_name_ar : item.slot.users.full_name})
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-green-600">
                        {item.service.base_price} SAR
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedServices(selectedServices.filter((_, i) => i !== index));
                      }}
                      className="ml-3 text-red-600 hover:text-red-700 font-medium text-sm"
                    >
                      {t('reception.remove')}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-green-200 flex justify-between items-center">
                <span className="font-medium text-gray-900">Total:</span>
                <span className="text-lg font-bold text-green-600">
                  {selectedServices.reduce((sum, item) => sum + item.service.base_price, 0)} SAR
                </span>
              </div>
            </div>
          )}

          {selectedService && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {t('booking.selectDate')} *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowFullCalendar(!showFullCalendar)}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <CalendarDays className="w-4 h-4" />
                    {showFullCalendar ? t('reception.hideCalendar') : t('reception.showFullCalendar')}
                  </button>
                </div>

                {!showFullCalendar ? (
                  <div className="grid grid-cols-4 gap-2">
                    {getNext8Days().map((day) => {
                      const isToday = isSameDay(day, new Date());
                      return (
                        <button
                          key={day.toString()}
                          type="button"
                          onClick={() => setSelectedDate(day)}
                          className={`p-2 text-center rounded-lg border ${
                            isSameDay(day, selectedDate)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          } ${isToday ? 'ring-2 ring-blue-300' : ''}`}
                        >
                          <div className="text-xs font-medium">
                            {isToday ? t('dashboard.today') : format(day, 'EEE')}
                          </div>
                          <div className="text-lg font-bold">{format(day, 'd')}</div>
                          <div className="text-xs text-gray-500">{format(day, 'MMM')}</div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="border border-gray-300 rounded-lg p-4">
                    <input
                      type="date"
                      value={format(selectedDate, 'yyyy-MM-dd')}
                      onChange={(e) => setSelectedDate(new Date(e.target.value))}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* ARCHIVED: Employee Assignment UI removed */}
              {/* <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Employee Assignment *
                </label>
                <div className="flex gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAssignmentMode('automatic');
                      setSelectedSlot('');
                      setSelectedEmployee('');
                      setSelectedTimeSlot(null);
                    }}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      assignmentMode === 'automatic'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-semibold mb-1">{t('reception.automaticAssignment')}</div>
                    <div className="text-xs opacity-75">System assigns to employee with least bookings</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignmentMode('manual');
                      setSelectedSlot('');
                      setSelectedEmployee('');
                      setSelectedTimeSlot(null);
                    }}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      assignmentMode === 'manual'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-semibold mb-1">{t('reception.manualAssignment')}</div>
                    <div className="text-xs opacity-75">Choose specific employee and time</div>
                  </button>
                </div> */}

                {/* ARCHIVED: Employee distribution display removed */}
                {/* {assignmentMode === 'automatic' && availableEmployees.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                    <div className="text-sm font-medium text-blue-900 mb-2">Employee Distribution:</div>
                    <div className="space-y-1">
                      {availableEmployees.slice(0, 3).map((emp, idx) => (
                        <div key={emp.id} className="text-xs text-blue-800 flex items-center justify-between">
                          <span>
                            {idx === 0 && '➜ '}{i18n.language === 'ar' ? emp.name_ar : emp.name}
                          </span>
                          <span className="font-medium">{emp.bookingCount} bookings</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )} */}

                {/* Show already booked time slots */}
                {selectedServices.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                    <div className="text-sm font-medium text-amber-900 mb-2">
                      {t('reception.bookedTimeSlots')}:
                    </div>
                    <div className="space-y-1">
                      {selectedServices.map((item, idx) => {
                        const pricingInfo = calculateBookingPrice(item.service.id, 1);
                        return (
                          <div key={idx} className="text-xs flex items-center justify-between py-1">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-amber-900">
                                {i18n.language === 'ar' ? item.service.name_ar : item.service.name}
                              </span>
                              <span className="text-amber-700">{item.slot.start_time} - {item.slot.end_time}</span>
                            </div>
                            {pricingInfo.usePackage ? (
                              <span className="text-green-600 font-semibold flex items-center gap-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                </svg>
                                {t('packages.packageService')}
                              </span>
                            ) : (
                              <span className="text-gray-700 font-medium">{pricingInfo.price} {t('common.sar')}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-xs text-amber-700 mt-2 italic">
                      {t('reception.availableTimesOnly')}
                    </div>
                  </div>
                )}

                {/* ARCHIVED: Manual employee selection removed */}
                {/* {assignmentMode === 'manual' && (
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('reception.selectEmployee')} *
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={selectedEmployee}
                      onChange={(e) => {
                        setSelectedEmployee(e.target.value);
                        setSelectedSlot('');
                      }}
                      required={assignmentMode === 'manual'}
                    >
                      <option value="">{t('reception.chooseEmployee')}</option>
                      {availableEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {i18n.language === 'ar' ? emp.name_ar : emp.name} ({emp.bookingCount} bookings today)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div> */}
              {/* ARCHIVED: Employee assignment section fully commented out */}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('reception.availableSlots')} *
                </label>

                {(() => {
                  // Show selection indicator if quantity > 1 OR if we need slot selection validation
                  const required = getRequiredSlotsCount();

                  // Only show if multiple slots are required
                  if (required <= 1 && selectedSlots.length === 0) return null;

                  const validation = validateSlotSelection();
                  const isComplete = selectedSlots.length === required && validation.valid;
                  const isPartial = selectedSlots.length > 0 && selectedSlots.length < required;
                  const hasError = selectedSlots.length > 0 && !validation.valid;

                  return (
                    <div className={`mb-2 p-3 rounded-lg border ${
                      isComplete ? 'bg-green-50 border-green-300' :
                      hasError ? 'bg-red-50 border-red-300' :
                      isPartial ? 'bg-yellow-50 border-yellow-300' :
                      'bg-gray-50 border-gray-300'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <span className="text-lg">
                            {isComplete ? '✓' : isPartial ? '⚠' : 'ℹ'}
                          </span>
                          <span className={
                            isComplete ? 'text-green-900' :
                            hasError ? 'text-red-900' :
                            isPartial ? 'text-yellow-900' :
                            'text-gray-900'
                          }>
                            Slot Selection
                          </span>
                        </div>
                        <div className={`text-sm font-bold ${
                          isComplete ? 'text-green-700' :
                          hasError ? 'text-red-700' :
                          isPartial ? 'text-yellow-700' :
                          'text-gray-700'
                        }`}>
                          {selectedSlots.length} / {required}
                        </div>
                      </div>
                      <div className={`text-xs ${
                        isComplete ? 'text-green-800' :
                        hasError ? 'text-red-800' :
                        isPartial ? 'text-yellow-800' :
                        'text-gray-700'
                      }`}>
                        {validation.message}
                      </div>
                      <div className="text-xs mt-2 text-gray-600 italic">
                        💡 Tip: Click a slot multiple times to select it multiple times. Right-click or Ctrl+Click to remove one.
                      </div>
                    </div>
                  );
                })()}

                {assignmentMode === 'manual' && !selectedEmployee ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <User className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">{t('reception.createBookingFirst')}</p>
                  </div>
                ) : assignmentMode === 'manual' && slots.filter(s => s.employee_id === selectedEmployee).length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Clock className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">{t('reception.noSlotsAvailable')}</p>
                  </div>
                ) : assignmentMode === 'automatic' && slots.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Clock className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">{t('reception.noSlotsAvailable')}</p>
                    {process.env.NODE_ENV === 'development' && (
                      <div className="mt-4 text-xs text-gray-500 space-y-1">
                        <p>Debug Info:</p>
                        <p>Selected Service: {selectedService || 'None'}</p>
                        <p>Selected Date: {selectedDate ? format(selectedDate, 'yyyy-MM-dd') : 'None'}</p>
                        <p>Current Time: {new Date().toLocaleTimeString()}</p>
                        <p>Check browser console for detailed logs</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {assignmentMode === 'automatic' ? (
                      // For automatic mode, group slots by time and show unique time slots
                      (() => {
                        const timeSlotMap = new Map<string, Slot[]>();
                        slots.forEach(slot => {
                          const timeKey = `${slot.slot_date}-${slot.start_time}-${slot.end_time}`;
                          if (!timeSlotMap.has(timeKey)) {
                            timeSlotMap.set(timeKey, []);
                          }
                          timeSlotMap.get(timeKey)!.push(slot);
                        });

                        return Array.from(timeSlotMap.entries()).map(([timeKey, groupedSlots]) => {
                          const firstSlot = groupedSlots[0];
                          const totalAvailable = groupedSlots.reduce((sum, s) => sum + s.available_capacity, 0);

                          // Count how many times this time slot is selected
                          const selectionCount = selectedSlots.filter(
                            s => s.start_time === firstSlot.start_time && s.end_time === firstSlot.end_time
                          ).length;
                          const isSelected = selectionCount > 0;

                          return (
                            <button
                              key={timeKey}
                              type="button"
                              onClick={(e) => handleSlotClick(firstSlot, e)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                handleSlotClick(firstSlot, { ...e, button: 2 } as any);
                              }}
                              className={`p-3 text-left rounded-lg border relative ${
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {isSelected && (
                                <div className="absolute -top-2 -right-2 bg-blue-800 text-white text-xs min-w-[24px] h-6 rounded-full font-bold flex items-center justify-center px-1">
                                  {selectionCount}
                                </div>
                              )}
                              <div className="flex items-center gap-2 mb-1">
                                <Clock className="w-4 h-4" />
                                <span className="font-medium">{firstSlot.start_time} - {firstSlot.end_time}</span>
                              </div>
                              <div className="text-xs">
                                {totalAvailable} spots left
                              </div>
                              {isSelected && (
                                <div className="text-xs mt-1 opacity-90">
                                  Selected: {selectionCount} time{selectionCount > 1 ? 's' : ''}
                                </div>
                              )}
                            </button>
                          );
                        });
                      })()
                    ) : (
                      // For manual mode, show slots filtered by selected employee
                      (() => {
                        // Group slots by time for manual mode too
                        const timeSlotMap = new Map<string, Slot[]>();
                        slots
                          .filter(slot => slot.employee_id === selectedEmployee)
                          .forEach(slot => {
                            const timeKey = `${slot.slot_date}-${slot.start_time}-${slot.end_time}`;
                            if (!timeSlotMap.has(timeKey)) {
                              timeSlotMap.set(timeKey, []);
                            }
                            timeSlotMap.get(timeKey)!.push(slot);
                          });

                        return Array.from(timeSlotMap.entries()).map(([timeKey, groupedSlots]) => {
                          const slot = groupedSlots[0];

                          // Count how many times this slot is selected
                          const selectionCount = selectedSlots.filter(s => s.slot_id === slot.id).length;
                          const isSelected = selectionCount > 0;

                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={(e) => handleSlotClick(slot, e)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                handleSlotClick(slot, { ...e, button: 2 } as any);
                              }}
                              className={`p-3 text-left rounded-lg border relative ${
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {isSelected && (
                                <div className="absolute -top-2 -right-2 bg-blue-800 text-white text-xs min-w-[24px] h-6 rounded-full font-bold flex items-center justify-center px-1">
                                  {selectionCount}
                                </div>
                              )}
                              <div className="flex items-center gap-2 mb-1">
                                <Clock className="w-4 h-4" />
                                <span className="font-medium">{slot.start_time} - {slot.end_time}</span>
                              </div>
                              <div className="text-xs">
                                {slot.available_capacity} spots left
                              </div>
                              {isSelected && (
                                <div className="text-xs mt-1 opacity-90">
                                  Selected: {selectionCount} time{selectionCount > 1 ? 's' : ''}
                                </div>
                              )}
                            </button>
                          );
                        });
                      })()
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {(() => {
            // Show booking options when quantity > 1
            if (bookingForm.visitor_count <= 1) return null;

            // For automatic mode, we need a selected time slot to check employee availability
            // For manual mode, we can show options without a selected slot
            if (assignmentMode === 'automatic' && !selectedTimeSlot) return null;

            let numEmployees = 1;
            let totalCapacity = 1;

            if (selectedTimeSlot) {
              const slotsInTimeRange = slots.filter(
                s => s.start_time === selectedTimeSlot.start_time && s.end_time === selectedTimeSlot.end_time
              );
              totalCapacity = slotsInTimeRange.reduce((sum, s) => sum + s.available_capacity, 0);
              numEmployees = slotsInTimeRange.length;
            } else if (assignmentMode === 'manual' && selectedEmployee) {
              // For manual mode, check if selected employee has capacity
              const employeeSlots = slots.filter(s => s.employee_id === selectedEmployee);
              numEmployees = employeeSlots.length > 0 ? 1 : 0;
            } else {
              // No slot selected yet in manual mode - show all options
              numEmployees = slots.length > 0 ? 2 : 1; // Assume multiple employees available
            }

            const needsExtension = bookingForm.visitor_count > numEmployees;
            const parallelSlots = Math.min(bookingForm.visitor_count, numEmployees);
            const extensionSlots = needsExtension ? bookingForm.visitor_count - numEmployees : 0;

            // Auto-select consecutive if only 1 employee (but only if we have a selected slot)
            if (selectedTimeSlot && numEmployees <= 1 && bookingForm.booking_option === 'parallel') {
              setBookingForm({ ...bookingForm, booking_option: 'consecutive' });
            }

            return (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Booking Option *
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBookingForm({ ...bookingForm, booking_option: 'parallel' });
                      setManualSlotAssignments([]);
                    }}
                    className={`p-3 text-left rounded-lg border ${
                      bookingForm.booking_option === 'parallel'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium">
                      ✓ Parallel {needsExtension && selectedTimeSlot ? '+ Extension' : ''} - Multiple Employees
                    </div>
                    <div className="text-sm text-gray-600">
                      {selectedTimeSlot ? (
                        needsExtension ? (
                          <>
                            Book {parallelSlots} services simultaneously + {extensionSlots} extended slot{extensionSlots > 1 ? 's' : ''}
                            <br />
                            <span className="text-blue-600 font-medium">({numEmployees} employees available, {extensionSlots} will extend to next slot)</span>
                          </>
                        ) : (
                          `Book ${bookingForm.visitor_count} services at the same time with ${bookingForm.visitor_count} different employees (${numEmployees} employees available)`
                        )
                      ) : (
                        `Book ${bookingForm.visitor_count} services at the same time with different employees`
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBookingForm({ ...bookingForm, booking_option: 'consecutive' });
                      setManualSlotAssignments([]);
                    }}
                    className={`p-3 text-left rounded-lg border ${
                      bookingForm.booking_option === 'consecutive'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium">→ Consecutive - Single Employee</div>
                    <div className="text-sm text-gray-600">
                      Book {bookingForm.visitor_count} consecutive time slots with one employee
                    </div>
                  </button>
                </div>
              </div>
            );
          })()}

          {(() => {
            // Show manual slot assignment UI when:
            // 1. Manual assignment mode is selected
            // 2. Quantity > 1
            // 3. Parallel + Extension scenario (quantity > numEmployees)
            if (assignmentMode === 'manual' && bookingForm.visitor_count > 1 && selectedTimeSlot && bookingForm.booking_option === 'parallel') {
              const slotsInTimeRange = slots.filter(
                s => s.start_time === selectedTimeSlot.start_time && s.end_time === selectedTimeSlot.end_time
              );
              const numEmployees = slotsInTimeRange.length;
              const needsExtension = bookingForm.visitor_count > numEmployees;

              if (!needsExtension) return null; // No need for manual assignment if no extension needed

              const parallelCount = numEmployees;
              const extensionCount = bookingForm.visitor_count - numEmployees;

              return (
                <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="font-medium text-blue-900">
                    Manual Employee Assignment Required
                  </div>
                  <p className="text-sm text-blue-800">
                    You need to assign employees for {parallelCount} parallel slots + {extensionCount} extension slot{extensionCount > 1 ? 's' : ''}.
                  </p>

                  <div className="space-y-2">
                    {Array.from({ length: bookingForm.visitor_count }).map((_, index) => {
                      const isParallel = index < parallelCount;
                      const currentAssignment = manualSlotAssignments.find(a => a.slotIndex === index);

                      return (
                        <div key={index} className="bg-white p-3 rounded border">
                          <div className="text-sm font-medium mb-2">
                            Slot {index + 1} {isParallel ? '(Parallel)' : '(Extension)'}
                          </div>
                          <select
                            value={currentAssignment?.employeeId || ''}
                            onChange={(e) => {
                              const employeeId = e.target.value;
                              if (!employeeId) return;

                              // Find available slot for this employee
                              const availableSlot = isParallel
                                ? slotsInTimeRange.find(s => s.employee_id === employeeId)
                                : null; // For extension, we'll fetch next slots

                              if (availableSlot || !isParallel) {
                                setManualSlotAssignments(prev => [
                                  ...prev.filter(a => a.slotIndex !== index),
                                  { slotIndex: index, employeeId, slotId: availableSlot?.id || '' }
                                ]);
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="">Select employee...</option>
                            {availableEmployees.map(emp => (
                              <option key={emp.id} value={emp.id}>
                                {i18n.language === 'ar' ? emp.name_ar : emp.name} ({emp.bookingCount} bookings today)
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return null;
          })()}

          <div className="flex gap-3 pt-4 border-t mt-6">
            <Button
              type="submit"
              fullWidth
              disabled={(() => {
                // Require all basic fields
                if (!bookingForm.customer_phone || !bookingForm.customer_name) return true;
                if (!selectedService || !bookingForm.visitor_count) return true;

                // Allow booking if there are services in the list
                if (selectedServices.length > 0) return false;

                // For single bookings, check if we have required slots selected
                const required = getRequiredSlotsCount();
                const validation = validateSlotSelection();

                // If quantity is 1, just need any slot selected
                if (bookingForm.visitor_count === 1) {
                  return selectedSlots.length === 0 && !selectedSlot && !selectedTimeSlot;
                }

                // For quantity > 1, check if single slot has enough capacity first
                if (selectedTimeSlot) {
                  const slotsAtTime = slots.filter(
                    s => s.start_time === selectedTimeSlot.start_time &&
                         s.end_time === selectedTimeSlot.end_time &&
                         s.available_capacity > 0
                  );
                  
                  const slotWithEnoughCapacity = slotsAtTime.find(s => s.available_capacity >= bookingForm.visitor_count);
                  
                  if (slotWithEnoughCapacity) {
                    // Single slot has enough capacity - no need to select multiple slots
                    return false; // Button enabled
                  }
                }
                
                // Otherwise, need all required slots selected and valid
                return selectedSlots.length < required || !validation.valid;
              })()}
            >
              Proceed
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
        )}
      </Modal>

      {/* Booking Details Modal */}
      <Modal
        isOpen={!!selectedBookingForDetails}
        onClose={() => setSelectedBookingForDetails(null)}
        title="Booking Details"
      >
        {selectedBookingForDetails && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Customer Name</label>
                <div className="mt-1 flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">{selectedBookingForDetails.customer_name}</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Phone</label>
                <div className="mt-1 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">{selectedBookingForDetails.customer_phone}</span>
                </div>
              </div>
            </div>

            {selectedBookingForDetails.customer_email && (
              <div>
                <label className="text-sm font-medium text-gray-500">Email</label>
                <div className="mt-1 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">{selectedBookingForDetails.customer_email}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Service</label>
                <div className="mt-1 font-medium">
                  {i18n.language === 'ar' ? selectedBookingForDetails.services?.name_ar : selectedBookingForDetails.services?.name}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Employee{(selectedBookingForDetails as any).employees?.length > 1 ? 's' : ''}</label>
                <div className="mt-1 font-medium">
                  {(selectedBookingForDetails as any).employees && (selectedBookingForDetails as any).employees.length > 0 ?
                    (selectedBookingForDetails as any).employees.map((emp: any, idx: number) => (
                      <div key={emp.id}>
                        {i18n.language === 'ar' ? emp.full_name_ar : emp.full_name}
                      </div>
                    ))
                    : 'N/A'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Date</label>
                <div className="mt-1 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">
                    {format(parseISO(selectedBookingForDetails.slots?.slot_date), 'MMM dd, yyyy')}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Time</label>
                <div className="mt-1 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">
                    {selectedBookingForDetails.slots?.start_time} - {selectedBookingForDetails.slots?.end_time}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">{t('booking.visitorCount')}</label>
                <div className="mt-1 font-medium">{(selectedBookingForDetails as any).groupCount || selectedBookingForDetails.visitor_count}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Total Price</label>
                <div className="mt-1 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">{selectedBookingForDetails.total_price} SAR</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Status</label>
                <div className="mt-1">
                  <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                    selectedBookingForDetails.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                    selectedBookingForDetails.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    selectedBookingForDetails.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    selectedBookingForDetails.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedBookingForDetails.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Payment Status</label>
                <div className="mt-1">
                  <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                    selectedBookingForDetails.payment_status === 'paid' || selectedBookingForDetails.payment_status === 'paid_manual' ? 'bg-green-100 text-green-800' :
                    selectedBookingForDetails.payment_status === 'awaiting_payment' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedBookingForDetails.payment_status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {selectedBookingForDetails.notes && (
              <div>
                <label className="text-sm font-medium text-gray-500">Notes</label>
                <div className="mt-1 p-3 bg-gray-50 rounded-lg text-sm">
                  {selectedBookingForDetails.notes}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {selectedBookingForDetails.status !== 'cancelled' && selectedBookingForDetails.status !== 'completed' && (
              <div className="flex gap-2 pt-4 border-t">
                {selectedBookingForDetails.status === 'confirmed' && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      updateBookingStatus(selectedBookingForDetails.id, 'completed');
                      setSelectedBookingForDetails(null);
                    }}
                    icon={<CheckCircle className="w-4 h-4" />}
                    fullWidth
                  >
                    Mark Complete
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() => {
                    updateBookingStatus(selectedBookingForDetails.id, 'cancelled');
                    setSelectedBookingForDetails(null);
                  }}
                  icon={<XCircle className="w-4 h-4" />}
                  fullWidth
                >
                  Cancel Booking
                </Button>
              </div>
            )}

            {(selectedBookingForDetails.payment_status === 'unpaid' || selectedBookingForDetails.payment_status === 'awaiting_payment') && (
              <Button
                variant="primary"
                onClick={() => {
                  updatePaymentStatus(selectedBookingForDetails.id, 'paid_manual');
                  setSelectedBookingForDetails(null);
                }}
                icon={<DollarSign className="w-4 h-4" />}
                fullWidth
              >
                Mark as Paid
              </Button>
            )}

            <Button
              variant="secondary"
              onClick={() => setSelectedBookingForDetails(null)}
              fullWidth
            >
              Close
            </Button>
          </div>
        )}
      </Modal>

      {/* Add Subscription Modal */}
      <Modal
        isOpen={isSubscriptionModalOpen}
        onClose={() => {
          setIsSubscriptionModalOpen(false);
          resetSubscriptionForm();
        }}
        title={t('packages.addSubscription')}
      >
        <form onSubmit={handleSubscriptionSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('packages.customerPhone')} *
            </label>
            <div className="flex gap-2">
              <select
                value={subscriptionCountryCode}
                onChange={(e) => setSubscriptionCountryCode(e.target.value)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {countryCodes.map((country, index) => (
                  <option key={`${country.code}-${country.name}-${index}`} value={country.code}>
                    {country.flag} {country.code}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={subscriptionForm.customer_phone}
                onChange={(e) => {
                  const phone = e.target.value.replace(/[^\d]/g, '');
                  const formattedPhone = formatPhoneNumber(phone, subscriptionCountryCode);
                  setSubscriptionForm({ ...subscriptionForm, customer_phone: formattedPhone });
                  if (subscriptionCustomerLookup) {
                    setSubscriptionCustomerLookup(null);
                  }
                  if (formattedPhone.length >= 8) {
                    lookupSubscriptionCustomer(formattedPhone, subscriptionCountryCode);
                  }
                }}
                onBlur={(e) => lookupSubscriptionCustomer(e.target.value, subscriptionCountryCode)}
                placeholder="501234567"
                required
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {subscriptionCustomerLookup && (
              <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                <span>
                  {t('packages.existingCustomer')}: <strong>{subscriptionCustomerLookup.name}</strong>
                  {subscriptionCustomerLookup.email && ` (${subscriptionCustomerLookup.email})`}
                </span>
              </p>
            )}
            {subscriptionForm.customer_phone.length >= 8 && !subscriptionCustomerLookup && (
              <p className="text-sm text-blue-600 mt-2">
                {t('packages.newCustomer')}
              </p>
            )}
          </div>
          <Input
            label={`${t('packages.customerName')} *`}
            value={subscriptionForm.customer_name}
            onChange={(e) => setSubscriptionForm({ ...subscriptionForm, customer_name: e.target.value })}
            required
            disabled={!!subscriptionCustomerLookup}
          />
          <Input
            label={t('packages.customerEmail')}
            type="email"
            value={subscriptionForm.customer_email}
            onChange={(e) => setSubscriptionForm({ ...subscriptionForm, customer_email: e.target.value })}
            disabled={!!subscriptionCustomerLookup}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('packages.selectPackage')} *
            </label>
            <select
              value={subscriptionForm.package_id}
              onChange={(e) => setSubscriptionForm({ ...subscriptionForm, package_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">{t('packages.selectPackage')}</option>
              {packages.map(pkg => (
                <option key={pkg.id} value={pkg.id}>
                  {i18n.language === 'ar' ? pkg.name_ar : pkg.name} - {pkg.total_price} {t('common.sar')}
                </option>
              ))}
            </select>
          </div>
          <Input
            label={t('packages.expiryDate')}
            type="date"
            value={subscriptionForm.expires_at}
            onChange={(e) => setSubscriptionForm({ ...subscriptionForm, expires_at: e.target.value })}
          />

          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1">
              {t('packages.subscribe')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsSubscriptionModalOpen(false);
                resetSubscriptionForm();
              }}
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* QR Code Scanner Modal */}
      <Modal
        isOpen={isQRScannerOpen}
        onClose={() => {
          setIsQRScannerOpen(false);
          setQrInputValue('');
          setQrValidationResult(null);
        }}
        title={i18n.language === 'ar' ? 'مسح رمز QR' : 'Scan QR Code'}
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              {i18n.language === 'ar' 
                ? 'يمكنك إدخال رقم الحجز يدوياً أو مسح رمز QR من التذكرة'
                : 'You can enter the booking ID manually or scan the QR code from the ticket'}
            </p>
          </div>

          <form onSubmit={handleQRSubmit} className="space-y-4">
            <Input
              label={i18n.language === 'ar' ? 'رقم الحجز أو رمز QR' : 'Booking ID or QR Code'}
              value={qrInputValue}
              onChange={(e) => {
                setQrInputValue(e.target.value);
                setQrValidationResult(null);
              }}
              placeholder={i18n.language === 'ar' ? 'أدخل رقم الحجز أو امسح QR' : 'Enter booking ID or scan QR'}
              required
              disabled={qrValidating}
              autoFocus
            />

            {qrValidationResult && (
              <div className={`p-4 rounded-lg border ${
                qrValidationResult.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className={`flex items-center gap-2 ${
                  qrValidationResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {qrValidationResult.success ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  <span className="font-medium">{qrValidationResult.message}</span>
                </div>
                
                {qrValidationResult.booking && qrValidationResult.success && (
                  <div className="mt-3 pt-3 border-t border-green-200 space-y-2 text-sm">
                    <div>
                      <span className="text-gray-600">{i18n.language === 'ar' ? 'اسم العميل' : 'Customer'}:</span>
                      <span className="font-medium ml-2">{qrValidationResult.booking.customer_name}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">{i18n.language === 'ar' ? 'الخدمة' : 'Service'}:</span>
                      <span className="font-medium ml-2">
                        {i18n.language === 'ar' 
                          ? qrValidationResult.booking.service_name_ar 
                          : qrValidationResult.booking.service_name}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">{i18n.language === 'ar' ? 'التاريخ والوقت' : 'Date & Time'}:</span>
                      <span className="font-medium ml-2">
                        {format(parseISO(qrValidationResult.booking.slot_date), 'MMM dd, yyyy')} {qrValidationResult.booking.start_time}
                      </span>
                    </div>
                  </div>
                )}

                {qrValidationResult.booking && !qrValidationResult.success && (
                  <div className="mt-3 pt-3 border-t border-red-200 text-sm text-red-700">
                    {i18n.language === 'ar' 
                      ? 'تم مسح هذا الرمز مسبقاً في:'
                      : 'This QR code was already scanned at:'}
                    <div className="font-medium mt-1">
                      {qrValidationResult.booking.qr_scanned_at 
                        ? format(parseISO(qrValidationResult.booking.qr_scanned_at), 'MMM dd, yyyy HH:mm')
                        : 'N/A'}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                fullWidth
                disabled={!qrInputValue.trim() || qrValidating}
                style={{ backgroundColor: qrValidating ? '#9ca3af' : undefined }}
              >
                {qrValidating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {i18n.language === 'ar' ? 'جاري التحقق...' : 'Validating...'}
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4 mr-2" />
                    {i18n.language === 'ar' ? 'التحقق' : 'Validate'}
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => {
                  setIsQRScannerOpen(false);
                  setQrInputValue('');
                  setQrValidationResult(null);
                }}
              >
                {i18n.language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
