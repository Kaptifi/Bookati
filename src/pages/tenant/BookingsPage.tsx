import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Card, CardContent } from '../../components/ui/Card';
import { Calendar, Clock, User, List, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Booking {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  visitor_count: number;
  total_price: number;
  status: string;
  created_at: string;
  services: {
    name: string;
    name_ar?: string;
  };
  slots: {
    slot_date: string;
    start_time: string;
    end_time: string;
  };
  // ARCHIVED: users (employee) field removed
}

export function BookingsPage() {
  const { t, i18n } = useTranslation();
  const { userProfile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarDate, setCalendarDate] = useState(new Date());

  useEffect(() => {
    fetchBookings();
  }, [userProfile, calendarDate, viewMode]);

  async function fetchBookings() {
    if (!userProfile?.tenant_id) return;

    setLoading(true);
    try {
      const { data, error } = await db
        .from('bookings')
        .select(`
          id,
          customer_name,
          customer_phone,
          customer_email,
          visitor_count,
          total_price,
          status,
          created_at,
          service_id,
          slot_id,
          services:service_id (
            name,
            name_ar
          ),
          slots:slot_id (
            slot_date,
            start_time,
            end_time
          )
        `)
        .eq('tenant_id', userProfile.tenant_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (viewMode === 'calendar') {
        const weekStart = startOfWeek(calendarDate, { weekStartsOn: 0 });
        const weekEnd = addDays(weekStart, 6);
        const weekStartStr = format(weekStart, 'yyyy-MM-dd');
        const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

        const filteredBookings = (data || []).filter(booking => {
          const slotDate = booking.slots?.slot_date;
          if (!slotDate) return false;
          return slotDate >= weekStartStr && slotDate <= weekEndStr;
        });
        setBookings(filteredBookings);
      } else {
        setBookings((data || []).slice(0, 50));
      }
    } catch (err) {
      console.error('Error fetching bookings:', err);
    } finally {
      setLoading(false);
    }
  }

  function getBookingsForDate(date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd');
    return bookings.filter(booking => {
      const bookingDate = booking.slots?.slot_date;
      return bookingDate === dateStr;
    });
  }

  function generateTimeSlots() {
    const slots = [];
    const startHour = 6;
    const endHour = 22;
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
    return (totalMinutes / 30) * 60;
  }

  function getBookingHeight(startTime: string, endTime: string) {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    const durationMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
    return (durationMinutes / 30) * 60;
  }

  function calculateBookingLayout(bookings: Booking[]) {
    if (bookings.length === 0) return [];

    const sortedBookings = [...bookings].sort((a, b) => {
      return (a.slots?.start_time || '').localeCompare(b.slots?.start_time || '');
    });

    const overlaps = (booking1: Booking, booking2: Booking) => {
      const start1 = booking1.slots?.start_time || '';
      const end1 = booking1.slots?.end_time || '';
      const start2 = booking2.slots?.start_time || '';
      const end2 = booking2.slots?.end_time || '';
      return start1 < end2 && start2 < end1;
    };

    const layout: Array<{ booking: Booking; column: number; totalColumns: number }> = [];
    const columns: Booking[][] = [];

    sortedBookings.forEach(booking => {
      let columnIndex = 0;
      for (let i = 0; i < columns.length; i++) {
        const hasOverlap = columns[i].some(b => overlaps(b, booking));
        if (!hasOverlap) {
          columnIndex = i;
          break;
        }
        columnIndex = i + 1;
      }

      if (!columns[columnIndex]) {
        columns[columnIndex] = [];
      }
      columns[columnIndex].push(booking);

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

    layout.forEach((item, index) => {
      const overlappingItems = layout.filter(other =>
        overlaps(item.booking, other.booking)
      );
      const maxCols = Math.max(...overlappingItems.map(i => i.column + 1));
      layout[index].totalColumns = maxCols;
    });

    return layout;
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Bookings</h1>
              <p className="text-sm md:text-base text-gray-600 mt-1">View and manage all bookings</p>
            </div>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <List className="w-4 h-4 inline-block mr-2" />
            List View
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              viewMode === 'calendar'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Calendar className="w-4 h-4 inline-block mr-2" />
            Calendar View
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        bookings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <div className="flex items-center justify-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900">No Bookings Yet</h3>
              </div>
              <p className="text-gray-600">Bookings will appear here once customers start booking</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <Card key={booking.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-500" />
                          <span className="font-medium">{booking.customer_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-600">
                            {booking.slots ?
                              `${format(new Date(booking.slots.slot_date), 'MMM dd, yyyy', { locale: i18n.language === 'ar' ? ar : undefined })} ${booking.slots.start_time}` :
                              format(new Date(booking.created_at), 'MMM dd, yyyy HH:mm', { locale: i18n.language === 'ar' ? ar : undefined })
                            }
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>{i18n.language === 'ar' ? booking.services?.name_ar : booking.services?.name}</span>
                        <span>•</span>
                        <span>{booking.visitor_count} {t('booking.visitorCount')}</span>
                        <span>•</span>
                        <span>{booking.total_price} {t('service.price')}</span>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      booking.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                      booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      booking.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {t(`booking.${booking.status}`)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCalendarDate(addDays(calendarDate, -7))}
                className="p-2 hover:bg-white rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={() => setCalendarDate(new Date())}
                className="px-4 py-2 bg-white hover:bg-gray-50 rounded-lg font-medium text-sm transition-colors shadow-sm"
              >
                Today
              </button>
              <button
                onClick={() => setCalendarDate(addDays(calendarDate, 7))}
                className="p-2 hover:bg-white rounded-lg transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {format(startOfWeek(calendarDate, { weekStartsOn: 0 }), 'MMM d', { locale: i18n.language === 'ar' ? ar : undefined })} - {format(addDays(startOfWeek(calendarDate, { weekStartsOn: 0 }), 6), 'MMM d, yyyy', { locale: i18n.language === 'ar' ? ar : undefined })}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1200px]">
              <div className="grid grid-cols-8 border-b bg-gradient-to-r from-blue-50 to-indigo-50 sticky top-0 z-10">
                <div className="px-2 py-3 text-xs font-medium text-gray-500 border-r flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Time
                </div>
                {Array.from({ length: 7 }, (_, i) => {
                  const day = addDays(startOfWeek(calendarDate, { weekStartsOn: 0 }), i);
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div key={i} className={`px-2 py-3 text-center border-r ${
                      isToday ? 'bg-blue-100' : ''
                    }`}>
                      <div className="text-xs font-medium text-gray-500">
                        {format(day, 'EEE', { locale: i18n.language === 'ar' ? ar : undefined })}
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

              <div className="relative">
                <div className="grid grid-cols-8">
                  <div className="border-r bg-gray-50">
                    {generateTimeSlots().map((time, idx) => (
                      <div
                        key={idx}
                        className="h-[60px] px-2 py-1 text-xs text-gray-500 border-b text-right"
                      >
                        {time}
                      </div>
                    ))}
                  </div>

                  {Array.from({ length: 7 }, (_, dayIndex) => {
                    const day = addDays(startOfWeek(calendarDate, { weekStartsOn: 0 }), dayIndex);
                    const dayBookings = getBookingsForDate(day);
                    const isToday = isSameDay(day, new Date());

                    return (
                      <div key={dayIndex} className={`relative border-r ${
                        isToday ? 'bg-blue-50/30' : ''
                      }`}>
                        {generateTimeSlots().map((_, idx) => (
                          <div
                            key={idx}
                            className="h-[60px] border-b hover:bg-gray-50"
                          />
                        ))}

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
  );
}
