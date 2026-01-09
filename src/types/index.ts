// Core type definitions for Bookati platform

export type UserRole = 'solution_owner' | 'tenant_admin' | 'receptionist' | 'cashier' | 'employee' | 'customer';

export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled';

export type PaymentStatus = 'unpaid' | 'paid_manual' | 'awaiting_payment' | 'paid' | 'refunded';

export type CapacityMode = 'employee_based' | 'service_based';

export interface Tenant {
  id: string;
  name: string;
  name_ar: string;
  slug: string;
  industry: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  tenant_time_zone: string;
  announced_time_zone: string;
  subscription_start: string;
  subscription_end?: string;
  is_active: boolean;
  public_page_enabled: boolean;
  maintenance_mode: boolean;
  maintenance_message?: string;
  theme_preset: string;
  logo_url?: string;
  custom_theme_config?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id?: string;
  email: string;
  phone?: string;
  full_name: string;
  full_name_ar?: string;
  role: UserRole;
  is_active: boolean;
  capacity_per_slot: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceCategory {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  display_order: number;
  created_at: string;
}

export interface Service {
  id: string;
  tenant_id: string;
  category_id?: string;
  name: string;
  description?: string;
  duration_minutes: number;
  base_price: number;
  capacity_per_slot: number;
  capacity_mode: CapacityMode;
  service_duration_minutes: number;
  service_capacity_per_slot: number | null;
  is_public: boolean;
  assigned_employee_id?: string;
  image_url?: string;
  gallery_urls?: string[];
  is_active: boolean;
  average_rating?: number;
  total_reviews?: number;
  created_at: string;
  updated_at: string;
  category?: ServiceCategory;
}

export interface Shift {
  id: string;
  tenant_id: string;
  service_id: string;
  days_of_week: number[];
  start_time_utc: string;
  end_time_utc: string;
  is_active: boolean;
  created_at: string;
  service?: Service;
}

export interface TimeSlot {
  id: string;
  tenant_id: string;
  service_id: string;
  shift_id: string;
  start_time_utc: string;
  end_time_utc: string;
  total_capacity: number;
  remaining_capacity: number;
  is_available: boolean;
  created_at: string;
  service?: Service;
}

export interface Booking {
  id: string;
  tenant_id: string;
  service_id: string;
  slot_id: string;
  employee_id?: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  visitor_count: number;
  total_price: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  notes?: string;
  qr_token?: string;
  created_by_user_id?: string;
  checked_in_at?: string;
  checked_in_by_user_id?: string;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
  service?: Service;
  slot?: TimeSlot;
  employee?: User;
  customer?: User;
  review?: Review;
}

export interface BookingLock {
  id: string;
  slot_id: string;
  reserved_by_session_id: string;
  reserved_capacity: number;
  lock_acquired_at: string;
  lock_expires_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id?: string;
  user_id?: string;
  action_type: string;
  resource_type: string;
  resource_id?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface ThemeConfig {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface BookingFormData {
  service_id: string;
  slot_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  visitor_count: number;
  notes?: string;
}

export interface SlotAvailability {
  date: string;
  slots: {
    id: string;
    start_time: string;
    end_time: string;
    remaining_capacity: number;
    is_available: boolean;
  }[];
}

export interface Slot {
  id: string;
  tenant_id: string;
  shift_id: string;
  employee_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  start_time_utc: string;
  end_time_utc: string;
  available_capacity: number;
  booked_count: number;
  is_available: boolean;
  is_overbooked: boolean;
  original_capacity: number;
  created_at: string;
}

export interface EmployeeShiftConflict {
  hasConflict: boolean;
  conflictingService?: string;
  conflictingShift?: string;
  message?: string;
}

export interface ShiftDurationValidation {
  isValid: boolean;
  shiftDurationMinutes: number;
  serviceDurationMinutes: number;
  slotsCount: number;
  message?: string;
}

export interface CapacityCalculation {
  mode: CapacityMode;
  totalCapacity: number;
  source: 'employees' | 'service';
  employees?: Array<{
    id: string;
    name: string;
    capacity: number;
  }>;
}

export interface Review {
  id: string;
  tenant_id: string;
  service_id: string;
  booking_id?: string;
  customer_id: string;
  rating: number; // 1-5
  comment?: string;
  comment_ar?: string;
  is_approved: boolean;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  customer?: User;
  service?: Service;
  booking?: Booking;
}
