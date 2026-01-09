import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { ArrowLeft, FileText, Download, Calendar, CreditCard, Package, Mail, Phone, CheckCircle, XCircle, Clock, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface Invoice {
  id: string;
  booking_id: string;
  zoho_invoice_id: string;
  zoho_invoice_created_at: string;
  service_name: string;
  service_name_ar: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  total_price: number;
  status: string;
  payment_status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  created_at: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function CustomerBillingPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { userProfile, signOut, loading: authLoading } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tenant, setTenant] = useState<any>(null);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);
  
  // Pagination and search state
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [useLazyLoading, setUseLazyLoading] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);
  
  // Diagnostic: Latest invoice timestamp from DB
  const [latestInvoiceFromDB, setLatestInvoiceFromDB] = useState<{
    timestamp: string | null;
    invoiceId: string | null;
    loading: boolean;
  }>({ timestamp: null, invoiceId: null, loading: false });

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const sessionStr = localStorage.getItem('auth_session');
    const token = localStorage.getItem('auth_token');
    
    if ((sessionStr || token) && !userProfile) {
      return;
    }

    if (!userProfile || userProfile.role !== 'customer') {
      navigate(`/${tenantSlug}/customer/login`);
      return;
    }

    fetchTenant();
  }, [userProfile, tenantSlug, authLoading, navigate]);

  // Fetch latest invoice timestamp from DB for comparison
  async function fetchLatestInvoiceFromDB() {
    if (!userProfile?.id) return;
    
    try {
      setLatestInvoiceFromDB(prev => ({ ...prev, loading: true }));
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(`${API_URL}/customers/invoices/latest`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setLatestInvoiceFromDB({
          timestamp: data.timestamp,
          invoiceId: data.invoice_id,
          loading: false,
        });
        console.log('[CustomerBillingPage] Latest invoice from DB:', data);
      } else {
        console.error('[CustomerBillingPage] Failed to fetch latest invoice from DB');
        setLatestInvoiceFromDB(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('[CustomerBillingPage] Error fetching latest invoice from DB:', error);
      setLatestInvoiceFromDB(prev => ({ ...prev, loading: false }));
    }
  }

  // Fetch invoices when page or search changes
  useEffect(() => {
    if (userProfile?.id) {
      // Reset pagination and fetch from page 1
      setPagination({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });
      fetchInvoices(1, searchQuery, true);
      fetchLatestInvoiceFromDB(); // Also fetch latest from DB for comparison
    }
  }, [searchQuery, userProfile?.id]);

  // Lazy loading observer
  useEffect(() => {
    if (!useLazyLoading || !pagination.hasNextPage || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && pagination.hasNextPage && !loadingMore) {
          loadMoreInvoices();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [pagination.hasNextPage, loadingMore, useLazyLoading]);

  async function fetchTenant() {
    try {
      const { data, error } = await db
        .from('tenants')
        .select('*')
        .eq('slug', tenantSlug)
        .single();

      if (error) throw error;
      setTenant(data);
    } catch (error: any) {
      console.error('Error fetching tenant:', error);
    }
  }

  async function fetchInvoices(page: number = 1, search: string = '', reset: boolean = false) {
    if (!userProfile?.id) {
      console.log('[CustomerBillingPage] No userProfile.id, cannot fetch invoices');
      return;
    }

    try {
      if (reset) {
        setLoading(true);
        setInvoices([]);
      } else {
        setLoadingMore(true);
      }
      
      console.log('[CustomerBillingPage] Fetching invoices for customer:', userProfile.id, 'Page:', page, 'Search:', search);
      
      // Use API endpoint to fetch invoices with pagination
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const token = localStorage.getItem('auth_token');
      const limit = pagination.limit;

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      
      if (search.trim()) {
        params.append('search', search.trim());
      }

      const response = await fetch(`${API_URL}/customers/invoices?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('[CustomerBillingPage] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[CustomerBillingPage] API error:', response.status, errorText);
        throw new Error(`API endpoint returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('[CustomerBillingPage] Received invoices:', result.data?.length || 0);
      console.log('[CustomerBillingPage] Pagination info:', result.pagination);
      
      // Debug: Log invoice dates
      if (result.data && result.data.length > 0) {
        const dates = result.data.map((inv: any) => ({
          id: inv.zoho_invoice_id,
          invoiceDate: inv.zoho_invoice_created_at,
          bookingDate: inv.created_at,
        }));
        console.log('[CustomerBillingPage] Invoice dates:', dates.slice(0, 3));
      }
      
      // Format the response to match Invoice interface
      const formattedInvoices: Invoice[] = (result.data || []).map((invoice: any) => ({
        id: invoice.id,
        booking_id: invoice.id,
        zoho_invoice_id: invoice.zoho_invoice_id,
        zoho_invoice_created_at: invoice.zoho_invoice_created_at,
        service_name: invoice.service_name || 'Unknown Service',
        service_name_ar: invoice.service_name_ar || '',
        slot_date: invoice.slot_date || '',
        start_time: invoice.start_time || '',
        end_time: invoice.end_time || '',
        total_price: typeof invoice.total_price === 'string' 
          ? parseFloat(invoice.total_price) 
          : (invoice.total_price || 0),
        status: invoice.status || 'unknown',
        payment_status: invoice.payment_status || 'unpaid',
        customer_name: invoice.customer_name || '',
        customer_email: invoice.customer_email || '',
        customer_phone: invoice.customer_phone || '',
        created_at: invoice.created_at || '',
      }));

      if (reset) {
        setInvoices(formattedInvoices);
      } else {
        setInvoices(prev => [...prev, ...formattedInvoices]);
      }

      if (result.pagination) {
        setPagination(result.pagination);
      }
    } catch (error: any) {
      console.error('[CustomerBillingPage] Error fetching invoices:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function loadMoreInvoices() {
    if (!pagination.hasNextPage || loadingMore) return;
    await fetchInvoices(pagination.page + 1, searchQuery, false);
  }

  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput);
  }, [searchInput]);

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handlePageChange = (newPage: number) => {
    fetchInvoices(newPage, searchQuery, true);
  };

  async function downloadInvoice(invoiceId: string, zohoInvoiceId: string) {
    try {
      setDownloadingInvoice(invoiceId);
      
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const token = localStorage.getItem('auth_token');
      
      // Ensure API_URL doesn't have trailing slash
      const baseUrl = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
      // Add token as query parameter to bypass CORS header issues
      const downloadUrl = `${baseUrl}/zoho/invoices/${zohoInvoiceId}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      
      console.log('[CustomerBillingPage] Downloading invoice:', zohoInvoiceId);
      console.log('[CustomerBillingPage] Download URL:', downloadUrl.replace(token || '', '***'));
      
      // Use direct link approach - this bypasses CORS completely
      // The browser will handle the download natively
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `invoice-${zohoInvoiceId}.pdf`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      // Clean up after a short delay
      setTimeout(() => {
        document.body.removeChild(link);
        setDownloadingInvoice(null);
      }, 1000);
      
      console.log('[CustomerBillingPage] Download initiated via direct link');
      
    } catch (error: any) {
      console.error('[CustomerBillingPage] Error downloading invoice:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      alert(i18n.language === 'ar' 
        ? `فشل تنزيل الفاتورة: ${errorMessage}. يرجى المحاولة مرة أخرى.` 
        : `Failed to download invoice: ${errorMessage}. Please try again.`);
      setDownloadingInvoice(null);
    }
  }


  if (loading && !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{i18n.language === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  const primaryColor = tenant?.primary_color || '#3B82F6';
  const secondaryColor = tenant?.secondary_color || '#8B5CF6';
  const tenantName = i18n.language === 'ar' ? tenant?.name_ar : tenant?.name;

  return (
    <div 
      className="min-h-screen" 
      style={{ 
        background: `linear-gradient(135deg, ${primaryColor}08 0%, ${secondaryColor}08 100%)`
      }}
    >
      {/* Header */}
      <header 
        className="bg-white/95 backdrop-blur-md shadow-md sticky top-0 z-50 border-b transition-all duration-300" 
        style={{ 
          borderColor: `${primaryColor}15`
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate(`/${tenantSlug}/customer/dashboard`)}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                {i18n.language === 'ar' ? 'العودة' : 'Back'}
              </Button>
              <div className="flex items-center gap-3">
                <div 
                  className="p-3 rounded-xl shadow-lg"
                  style={{ 
                    background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
                  }}
                >
                  <FileText className="w-7 h-7 text-white" />
                </div>
                <div className="flex flex-col">
                  <h1 
                    className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent"
                    style={{ 
                      backgroundImage: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`
                    }}
                  >
                    {i18n.language === 'ar' ? 'الفوترة' : 'Billing'}
                  </h1>
                  <span className="text-sm text-gray-500 font-medium">
                    {tenantName}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setSearchInput('');
                  fetchInvoices(1, '', true);
                }}
                className="flex items-center gap-2"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {i18n.language === 'ar' ? 'جاري التحديث...' : 'Refreshing...'}
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    {i18n.language === 'ar' ? 'تحديث' : 'Refresh'}
                  </>
                )}
              </Button>
              <LanguageToggle />
              <Button
                variant="outline"
                onClick={() => signOut()}
                className="flex items-center gap-2"
              >
                {i18n.language === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">{i18n.language === 'ar' ? 'جاري تحميل الفواتير...' : 'Loading invoices...'}</p>
          </div>
        ) : invoices.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                {i18n.language === 'ar' ? 'لا توجد فواتير' : 'No Invoices'}
              </h3>
              <p className="text-gray-500 mb-6">
                {i18n.language === 'ar' 
                  ? 'لم يتم إنشاء أي فواتير بعد. ستظهر الفواتير هنا بعد إتمام الحجوزات.' 
                  : 'No invoices have been created yet. Invoices will appear here after completing bookings.'}
              </p>
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-4 p-4 bg-gray-100 rounded text-left text-sm">
                  <p className="font-semibold mb-2">Debug Info:</p>
                  <p>User ID: {userProfile?.id || 'Not available'}</p>
                  <p>Has Token: {localStorage.getItem('auth_token') ? 'Yes' : 'No'}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    Check browser console for detailed logs
                  </p>
                </div>
              )}
              <Button
                onClick={() => navigate(`/${tenantSlug}/customer/dashboard`)}
                style={{ 
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
                }}
                className="mt-4"
              >
                {i18n.language === 'ar' ? 'العودة إلى لوحة التحكم' : 'Back to Dashboard'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Search and Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1 w-full sm:max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyPress={handleSearchKeyPress}
                    placeholder={i18n.language === 'ar' ? 'ابحث عن فاتورة...' : 'Search invoices...'}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2"
                    style={{
                      borderColor: `${primaryColor}30`,
                      focusRingColor: primaryColor,
                    }}
                  />
                  {searchInput && (
                    <button
                      onClick={() => {
                        setSearchInput('');
                        setSearchQuery('');
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                  {i18n.language === 'ar' 
                    ? `إجمالي: ${pagination.total} ${pagination.total === 1 ? 'فاتورة' : 'فواتير'}`
                    : `Total: ${pagination.total} ${pagination.total === 1 ? 'Invoice' : 'Invoices'}`}
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useLazyLoading}
                    onChange={(e) => setUseLazyLoading(e.target.checked)}
                    className="rounded"
                  />
                  <span>{i18n.language === 'ar' ? 'تحميل تلقائي' : 'Auto Load'}</span>
                </label>
              </div>
            </div>

            {/* Search Results Info */}
            {searchQuery && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Search className="w-4 h-4" />
                <span>
                  {i18n.language === 'ar' 
                    ? `نتائج البحث عن "${searchQuery}": ${invoices.length} ${invoices.length === 1 ? 'فاتورة' : 'فواتير'}`
                    : `Search results for "${searchQuery}": ${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'}`}
                </span>
              </div>
            )}

            {/* Diagnostic: Latest Invoice Comparison */}
            {latestInvoiceFromDB.timestamp && (
              <div className="p-4 rounded-lg border-2 mb-6" style={{
                borderColor: `${primaryColor}40`,
                background: `${primaryColor}05`
              }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2" style={{ color: primaryColor }}>
                      {i18n.language === 'ar' ? '🔍 تشخيص: أحدث فاتورة' : '🔍 Diagnostic: Latest Invoice'}
                    </h3>
                    <div className="space-y-1 text-sm">
                      <div>
                        <span className="font-medium">{i18n.language === 'ar' ? 'من قاعدة البيانات:' : 'From Database:'}</span>{' '}
                        <span className="font-mono">
                          {latestInvoiceFromDB.timestamp 
                            ? format(new Date(latestInvoiceFromDB.timestamp), 'MMM dd, yyyy HH:mm:ss')
                            : 'N/A'}
                        </span>
                        {latestInvoiceFromDB.invoiceId && (
                          <span className="ml-2 text-gray-500">
                            (ID: {latestInvoiceFromDB.invoiceId})
                          </span>
                        )}
                      </div>
                      {invoices.length > 0 && (
                        <>
                          <div>
                            <span className="font-medium">{i18n.language === 'ar' ? 'المعروض في الصفحة:' : 'Displayed on Page:'}</span>{' '}
                            <span className="font-mono">
                              {format(new Date(invoices[0].zoho_invoice_created_at || invoices[0].created_at), 'MMM dd, yyyy HH:mm:ss')}
                            </span>
                            {invoices[0].zoho_invoice_id && (
                              <span className="ml-2 text-gray-500">
                                (ID: {invoices[0].zoho_invoice_id})
                              </span>
                            )}
                          </div>
                          {(() => {
                            const dbTime = latestInvoiceFromDB.timestamp ? new Date(latestInvoiceFromDB.timestamp).getTime() : 0;
                            const displayedTime = new Date(invoices[0].zoho_invoice_created_at || invoices[0].created_at).getTime();
                            const isMatch = Math.abs(dbTime - displayedTime) < 1000; // Within 1 second
                            const isNewerInDB = dbTime > displayedTime;
                            
                            return (
                              <div className={`mt-2 p-2 rounded ${isMatch ? 'bg-green-100 text-green-800' : isNewerInDB ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {isMatch ? (
                                  <span>✅ {i18n.language === 'ar' ? 'متطابق - جميع الفواتير معروضة' : 'Match - All invoices displayed'}</span>
                                ) : isNewerInDB ? (
                                  <span>⚠️ {i18n.language === 'ar' ? `هناك فواتير أحدث في قاعدة البيانات (${Math.round((dbTime - displayedTime) / 1000)} ثانية)` : `Newer invoices exist in database (${Math.round((dbTime - displayedTime) / 1000)} seconds newer)`}</span>
                                ) : (
                                  <span>ℹ️ {i18n.language === 'ar' ? 'الفاتورة المعروضة أحدث من قاعدة البيانات' : 'Displayed invoice is newer than database'}</span>
                                )}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchLatestInvoiceFromDB}
                    disabled={latestInvoiceFromDB.loading}
                    className="flex items-center gap-2"
                  >
                    {latestInvoiceFromDB.loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {i18n.language === 'ar' ? 'جاري...' : 'Loading...'}
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        {i18n.language === 'ar' ? 'تحديث' : 'Refresh'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {invoices.map((invoice, index) => (
              <Card 
                key={invoice.id} 
                className="hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                style={{
                  border: `2px solid ${primaryColor}15`,
                  background: index % 2 === 0 
                    ? 'white' 
                    : `linear-gradient(135deg, ${primaryColor}03 0%, ${secondaryColor}03 100%)`
                }}
              >
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div 
                          className="p-2 rounded-lg"
                          style={{ 
                            background: `linear-gradient(135deg, ${primaryColor}15 0%, ${secondaryColor}15 100%)`
                          }}
                        >
                          <FileText className="w-5 h-5" style={{ color: primaryColor }} />
                        </div>
                        <CardTitle className="text-xl font-bold" style={{ color: primaryColor }}>
                          {i18n.language === 'ar' 
                            ? (invoice.service_name_ar || invoice.service_name) 
                            : (invoice.service_name || invoice.service_name_ar)}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-gray-600 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" style={{ color: primaryColor }} />
                          <span className="font-medium">
                            {invoice.slot_date ? format(new Date(invoice.slot_date), 'MMM dd, yyyy') : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" style={{ color: primaryColor }} />
                          <span className="font-medium">
                            {invoice.start_time && invoice.end_time 
                              ? `${format(new Date(`2000-01-01T${invoice.start_time}`), 'HH:mm')} - ${format(new Date(`2000-01-01T${invoice.end_time}`), 'HH:mm')}`
                              : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div 
                        className="text-3xl font-bold mb-2"
                        style={{ 
                          background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text'
                        }}
                      >
                        {invoice.total_price.toFixed(2)} SAR
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        {invoice.payment_status === 'paid' ? (
                          <span 
                            className="flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold"
                            style={{
                              background: '#10B98120',
                              color: '#10B981'
                            }}
                          >
                            <CheckCircle className="w-4 h-4" />
                            {i18n.language === 'ar' ? 'مدفوع' : 'Paid'}
                          </span>
                        ) : (
                          <span 
                            className="flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold"
                            style={{
                              background: '#F59E0B20',
                              color: '#F59E0B'
                            }}
                          >
                            <XCircle className="w-4 h-4" />
                            {i18n.language === 'ar' ? 'غير مدفوع' : 'Unpaid'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 rounded-lg" style={{
                    background: `${primaryColor}05`
                  }}>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: primaryColor }}>
                        {i18n.language === 'ar' ? 'رقم الفاتورة' : 'Invoice Number'}
                      </p>
                      <p className="font-mono text-sm font-medium bg-white px-3 py-2 rounded border" style={{
                        borderColor: `${primaryColor}20`
                      }}>
                        {invoice.zoho_invoice_id}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: primaryColor }}>
                        {i18n.language === 'ar' ? 'تاريخ الإنشاء' : 'Created Date'}
                      </p>
                      <p className="text-sm font-medium bg-white px-3 py-2 rounded border" style={{
                        borderColor: `${primaryColor}20`
                      }}>
                        {invoice.zoho_invoice_created_at 
                          ? format(new Date(invoice.zoho_invoice_created_at), 'MMM dd, yyyy HH:mm')
                          : 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-4 border-t" style={{
                    borderColor: `${primaryColor}20`
                  }}>
                    <Button
                      onClick={() => downloadInvoice(invoice.id, invoice.zoho_invoice_id)}
                      disabled={downloadingInvoice === invoice.id}
                      className="flex items-center gap-2 px-6 py-2 font-semibold transition-all duration-300 hover:scale-105"
                      style={{ 
                        background: downloadingInvoice === invoice.id
                          ? `${primaryColor}80`
                          : `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                        boxShadow: `0 4px 15px ${primaryColor}40`,
                        color: 'white'
                      }}
                    >
                      <Download className="w-5 h-5" />
                      {downloadingInvoice === invoice.id 
                        ? (i18n.language === 'ar' ? 'جاري التنزيل...' : 'Downloading...')
                        : (i18n.language === 'ar' ? 'تنزيل PDF' : 'Download PDF')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Lazy Loading Trigger */}
            {useLazyLoading && pagination.hasNextPage && (
              <div ref={observerTarget} className="py-8 flex justify-center">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{i18n.language === 'ar' ? 'جاري التحميل...' : 'Loading more...'}</span>
                  </div>
                ) : (
                  <Button
                    onClick={loadMoreInvoices}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    {i18n.language === 'ar' ? 'تحميل المزيد' : 'Load More'}
                  </Button>
                )}
              </div>
            )}

            {/* Pagination Controls */}
            {!useLazyLoading && pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-6 border-t" style={{ borderColor: `${primaryColor}20` }}>
                <Button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={!pagination.hasPrevPage}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {i18n.language === 'ar' ? 'السابق' : 'Previous'}
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.page >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = pagination.page - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        variant={pagination.page === pageNum ? "default" : "outline"}
                        className="min-w-[40px]"
                        style={
                          pagination.page === pageNum
                            ? {
                                background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                                color: 'white',
                              }
                            : {}
                        }
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={!pagination.hasNextPage}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {i18n.language === 'ar' ? 'التالي' : 'Next'}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* End of Results Message */}
            {!pagination.hasNextPage && invoices.length > 0 && (
              <div className="text-center py-4 text-gray-500 text-sm">
                {i18n.language === 'ar' 
                  ? 'تم عرض جميع الفواتير'
                  : 'All invoices displayed'}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

