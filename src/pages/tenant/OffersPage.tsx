import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Plus, Edit, Trash2, Gift, X, Star, TrendingUp, Zap, Search } from 'lucide-react';

interface Service {
  id: string;
  name: string;
  name_ar: string;
  base_price: number;
  duration_minutes?: number;
}

interface ServiceOffer {
  id: string;
  service_id: string;
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
  is_active: boolean;
  services?: Service;
}

export function OffersPage() {
  const { t, i18n } = useTranslation();
  const { userProfile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [offers, setOffers] = useState<ServiceOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ServiceOffer | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [filterServiceId, setFilterServiceId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [offerForm, setOfferForm] = useState({
    service_id: '',
    name: '',
    name_ar: '',
    description: '',
    description_ar: '',
    price: 0,
    original_price: null as number | null,
    discount_percentage: null as number | null,
    duration_minutes: null as number | null,
    perks: [] as string[],
    perks_ar: [] as string[],
    badge: '',
    badge_ar: '',
    is_active: true
  });

  useEffect(() => {
    fetchServices();
    fetchOffers();
  }, [userProfile]);

  useEffect(() => {
    if (filterServiceId !== 'all') {
      fetchOffers(filterServiceId);
    } else {
      fetchOffers();
    }
  }, [filterServiceId]);

  // Auto-fill offer form when service is selected (only when creating new offer, not editing)
  useEffect(() => {
    if (offerForm.service_id && !editingOffer && isOfferModalOpen) {
      const selectedService = services.find(s => s.id === offerForm.service_id);
      if (selectedService) {
        setOfferForm(prev => ({
          ...prev,
          duration_minutes: selectedService.duration_minutes || prev.duration_minutes,
          original_price: selectedService.base_price || prev.original_price,
          price: prev.price || selectedService.base_price || 0
        }));
      }
    }
  }, [offerForm.service_id, services, editingOffer, isOfferModalOpen]);

  async function fetchServices() {
    if (!userProfile?.tenant_id) return;
    try {
      const { data, error } = await db
        .from('services')
        .select('id, name, name_ar, base_price, duration_minutes')
        .eq('tenant_id', userProfile.tenant_id)
        .eq('is_active', true)
        .order('name');
      
      if (error) {
        console.error('Error fetching services:', error);
        return;
      }
      setServices(data || []);
      setLoading(false);
    } catch (error: any) {
      console.error('Error fetching services:', error);
      setLoading(false);
    }
  }

  async function fetchOffers(serviceId?: string) {
    if (!userProfile?.tenant_id) return;
    try {
      let query = db
        .from('service_offers')
        .select(`
          *,
          services(id, name, name_ar, base_price)
        `)
        .eq('tenant_id', userProfile.tenant_id)
        .order('created_at', { ascending: false });

      if (serviceId && serviceId !== 'all') {
        query = query.eq('service_id', serviceId);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching offers:', error);
        return;
      }
      
      // Parse perks if they come as JSON strings
      const parsedOffers = (data || []).map((offer: any) => {
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
    } catch (error: any) {
      console.error('Error fetching offers:', error);
    }
  }

  function openCreateOffer(serviceId?: string) {
    setSelectedServiceId(serviceId || '');
    setOfferForm({
      service_id: serviceId || '',
      name: '',
      name_ar: '',
      description: '',
      description_ar: '',
      price: 0,
      original_price: null,
      discount_percentage: null,
      duration_minutes: null,
      perks: [],
      perks_ar: [],
      badge: '',
      badge_ar: '',
      is_active: true
    });
    setEditingOffer(null);
    setIsOfferModalOpen(true);
  }

  function openEditOffer(offer: ServiceOffer) {
    setEditingOffer(offer);
    setSelectedServiceId(offer.service_id);
    setOfferForm({
      service_id: offer.service_id,
      name: offer.name,
      name_ar: offer.name_ar || '',
      description: offer.description || '',
      description_ar: offer.description_ar || '',
      price: offer.price,
      original_price: offer.original_price || null,
      discount_percentage: offer.discount_percentage || null,
      duration_minutes: offer.duration_minutes || null,
      perks: Array.isArray(offer.perks) ? offer.perks : [],
      perks_ar: Array.isArray(offer.perks_ar) ? offer.perks_ar : [],
      badge: offer.badge || '',
      badge_ar: offer.badge_ar || '',
      is_active: offer.is_active
    });
    setIsOfferModalOpen(true);
  }

  async function handleOfferSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userProfile?.tenant_id || !offerForm.service_id) {
      alert(t('offers.selectService') || 'Please select a service');
      return;
    }

    try {
      // Prepare perks arrays - ensure they're arrays and filter out empty strings
      const perksArray = Array.isArray(offerForm.perks) 
        ? offerForm.perks.filter(p => p && p.trim().length > 0)
        : [];
      const perksArArray = Array.isArray(offerForm.perks_ar)
        ? offerForm.perks_ar.filter(p => p && p.trim().length > 0)
        : [];

      const payload: any = {
        service_id: offerForm.service_id,
        tenant_id: userProfile.tenant_id,
        name: offerForm.name.trim(),
        name_ar: offerForm.name_ar?.trim() || null,
        description: offerForm.description?.trim() || null,
        description_ar: offerForm.description_ar?.trim() || null,
        price: parseFloat(String(offerForm.price)) || 0,
        original_price: offerForm.original_price ? parseFloat(String(offerForm.original_price)) : null,
        discount_percentage: offerForm.discount_percentage ? parseInt(String(offerForm.discount_percentage)) : null,
        duration_minutes: offerForm.duration_minutes ? parseInt(String(offerForm.duration_minutes)) : null,
        perks: perksArray.length > 0 ? perksArray : null,
        perks_ar: perksArArray.length > 0 ? perksArArray : null,
        badge: offerForm.badge?.trim() || null,
        badge_ar: offerForm.badge_ar?.trim() || null,
        is_active: offerForm.is_active
      };

      console.log('📝 Offer payload:', payload);
      console.log('📝 Editing offer:', editingOffer?.id);

      if (editingOffer) {
        const result = await db.from('service_offers').update(payload).eq('id', editingOffer.id).then();
        if (result.error) {
          console.error('❌ Update error:', result.error);
          const errorMessage = result.error?.message || result.error?.error || JSON.stringify(result.error) || 'Unknown error';
          alert(`Error updating offer: ${errorMessage}`);
          return;
        }
        console.log('✅ Offer updated successfully');
      } else {
        const result = await db.from('service_offers').insert(payload).then();
        if (result.error) {
          console.error('❌ Insert error:', result.error);
          const errorMessage = result.error?.message || result.error?.error || JSON.stringify(result.error) || 'Unknown error';
          alert(`Error creating offer: ${errorMessage}`);
          return;
        }
        console.log('✅ Offer created successfully');
      }

      setIsOfferModalOpen(false);
      setEditingOffer(null);
      await fetchOffers(filterServiceId !== 'all' ? filterServiceId : undefined);
    } catch (error: any) {
      console.error('❌ Offer submit error:', error);
      const errorMessage = error?.message || error?.error || JSON.stringify(error) || 'Failed to save offer';
      alert(`Error: ${errorMessage}`);
    }
  }

  async function deleteOffer(id: string) {
    const confirmMessage = t('offers.deleteOffer') || 'Are you sure you want to delete this offer?';
    if (!confirm(confirmMessage)) return;
    
    try {
      const result = await db.from('service_offers').delete().eq('id', id);
      if (result.error) {
        alert(`Error deleting offer: ${result.error.message}`);
        return;
      }
      const serviceIdToFetch = filterServiceId !== 'all' ? filterServiceId : undefined;
      await fetchOffers(serviceIdToFetch);
    } catch (error: any) {
      console.error('Delete offer error:', error);
      alert(`Error: ${error.message || 'Failed to delete offer'}`);
    }
  }

  function addPerk(lang: 'en' | 'ar') {
    if (lang === 'en') {
      setOfferForm({ ...offerForm, perks: [...offerForm.perks, ''] });
    } else {
      setOfferForm({ ...offerForm, perks_ar: [...offerForm.perks_ar, ''] });
    }
  }

  function updatePerk(index: number, value: string, lang: 'en' | 'ar') {
    if (lang === 'en') {
      const newPerks = [...offerForm.perks];
      newPerks[index] = value;
      setOfferForm({ ...offerForm, perks: newPerks });
    } else {
      const newPerks = [...offerForm.perks_ar];
      newPerks[index] = value;
      setOfferForm({ ...offerForm, perks_ar: newPerks });
    }
  }

  function removePerk(index: number, lang: 'en' | 'ar') {
    if (lang === 'en') {
      setOfferForm({ ...offerForm, perks: offerForm.perks.filter((_, i) => i !== index) });
    } else {
      setOfferForm({ ...offerForm, perks_ar: offerForm.perks_ar.filter((_, i) => i !== index) });
    }
  }

  // Filter offers by service and search query
  const filteredOffers = (filterServiceId === 'all' 
    ? offers 
    : offers.filter(offer => offer.service_id === filterServiceId)
  ).filter(offer => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const name = (offer.name || '').toLowerCase();
    const nameAr = (offer.name_ar || '').toLowerCase();
    const description = (offer.description || '').toLowerCase();
    const descriptionAr = (offer.description_ar || '').toLowerCase();
    const serviceName = offer.services 
      ? (i18n.language === 'ar' ? (offer.services.name_ar || '').toLowerCase() : (offer.services.name || '').toLowerCase())
      : '';
    return name.includes(query) || nameAr.includes(query) || 
           description.includes(query) || descriptionAr.includes(query) ||
           serviceName.includes(query);
  });

  const selectedService = services.find(s => s.id === selectedServiceId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('offers.title') || 'Service Offers'}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {t('offers.description') || 'Create and manage offers for your services'}
          </p>
        </div>
        <Button
          onClick={() => openCreateOffer()}
          icon={<Plus className="w-4 h-4" />}
        >
          {t('offers.createOffer') || 'Create Offer'}
        </Button>
      </div>

      {/* Filter and Search */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Filter by Service */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                {t('offers.filterByService') || 'Filter by Service'}:
              </label>
              <select
                value={filterServiceId}
                onChange={(e) => setFilterServiceId(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">{t('offers.allServices') || 'All Services'}</option>
                {services.map(service => (
                  <option key={service.id} value={service.id}>
                    {i18n.language === 'ar' ? service.name_ar : service.name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Search Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder={i18n.language === 'ar' ? 'ابحث عن عرض...' : 'Search offers...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-full"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Offers List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-500">{t('common.loading') || 'Loading...'}</div>
        </div>
      ) : filteredOffers.length === 0 && offers.length > 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {i18n.language === 'ar' ? 'لا توجد نتائج' : 'No results found'}
            </h3>
            <p className="text-gray-600 mb-6">
              {i18n.language === 'ar' 
                ? `لم يتم العثور على عروض تطابق "${searchQuery}"`
                : `No offers found matching "${searchQuery}"`}
            </p>
            <Button onClick={() => setSearchQuery('')} variant="secondary">
              {i18n.language === 'ar' ? 'مسح البحث' : 'Clear Search'}
            </Button>
          </CardContent>
        </Card>
      ) : filteredOffers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Gift className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">{t('offers.noOffers') || 'No offers found'}</p>
            <Button
              onClick={() => openCreateOffer()}
              className="mt-4"
              variant="outline"
              icon={<Plus className="w-4 h-4" />}
            >
              {t('offers.createFirstOffer') || 'Create Your First Offer'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOffers.map((offer) => {
            const service = offer.services || services.find(s => s.id === offer.service_id);
            return (
              <Card key={offer.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        {i18n.language === 'ar' ? offer.name_ar || offer.name : offer.name}
                      </CardTitle>
                      <p className="text-sm text-gray-600 mt-1">
                        {service ? (i18n.language === 'ar' ? service.name_ar : service.name) : 'Unknown Service'}
                      </p>
                    </div>
                    {offer.badge && (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        {i18n.language === 'ar' ? offer.badge_ar || offer.badge : offer.badge}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{t('offers.price') || 'Price'}:</span>
                      <div className="text-right">
                        {offer.original_price && offer.original_price > offer.price && (
                          <div className="text-xs text-gray-400 line-through">
                            {offer.original_price} {t('common.sar') || 'SAR'}
                          </div>
                        )}
                        <div className="text-lg font-bold text-blue-600">
                          {offer.price} {t('common.sar') || 'SAR'}
                        </div>
                        {offer.discount_percentage && (
                          <div className="text-xs text-red-600 font-semibold">
                            {offer.discount_percentage}% {t('offers.off') || 'off'}
                          </div>
                        )}
                      </div>
                    </div>

                    {offer.duration_minutes && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{t('offers.duration') || 'Duration'}:</span>
                        <span className="font-medium">{offer.duration_minutes} {i18n.language === 'ar' ? 'دقيقة' : 'minutes'}</span>
                      </div>
                    )}

                    {offer.perks && Array.isArray(offer.perks) && offer.perks.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-gray-700 mb-1">
                          {t('offers.perks') || 'Perks'}:
                        </div>
                        <ul className="text-xs text-gray-600 space-y-1">
                          {(i18n.language === 'ar' ? offer.perks_ar || offer.perks : offer.perks).slice(0, 3).map((perk, idx) => (
                            <li key={idx}>• {perk}</li>
                          ))}
                          {((i18n.language === 'ar' ? offer.perks_ar || offer.perks : offer.perks).length > 3) && (
                            <li className="text-gray-500">+{((i18n.language === 'ar' ? offer.perks_ar || offer.perks : offer.perks).length - 3)} more</li>
                          )}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className={`text-xs px-2 py-1 rounded ${offer.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {offer.is_active ? (t('common.active') || 'Active') : (t('common.inactive') || 'Inactive')}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditOffer(offer)}
                          icon={<Edit className="w-4 h-4" />}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => deleteOffer(offer.id)}
                          icon={<Trash2 className="w-4 h-4" />}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Offer Modal */}
      <Modal
        isOpen={isOfferModalOpen}
        onClose={() => {
          setIsOfferModalOpen(false);
          setEditingOffer(null);
        }}
        title={editingOffer ? (t('offers.editOffer') || 'Edit Offer') : (t('offers.createOffer') || 'Create Offer')}
        size="lg"
      >
        <form onSubmit={handleOfferSubmit} className="space-y-4">
          {/* Service Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('offers.service') || 'Service'} *
            </label>
            <select
              value={offerForm.service_id}
              onChange={(e) => {
                const serviceId = e.target.value;
                const selectedService = services.find(s => s.id === serviceId);
                setOfferForm(prev => {
                  // Auto-fill basic fields from service when creating new offer
                  if (selectedService && !editingOffer) {
                    return {
                      ...prev,
                      service_id: serviceId,
                      duration_minutes: selectedService.duration_minutes || prev.duration_minutes,
                      original_price: selectedService.base_price || prev.original_price,
                      price: prev.price || selectedService.base_price || 0
                    };
                  }
                  return { ...prev, service_id: serviceId };
                });
                setSelectedServiceId(serviceId);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              disabled={!!editingOffer}
            >
              <option value="">{t('offers.selectService') || 'Select a service'}</option>
              {services.map(service => (
                <option key={service.id} value={service.id}>
                  {i18n.language === 'ar' ? service.name_ar : service.name} - {service.base_price} {t('common.sar') || 'SAR'}
                </option>
              ))}
            </select>
            {offerForm.service_id && !editingOffer && (
              <p className="mt-1 text-xs text-gray-500">
                {i18n.language === 'ar' 
                  ? 'تم تعبئة المدة والسعر الأصلي تلقائياً من الخدمة'
                  : 'Duration and original price auto-filled from service'}
              </p>
            )}
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('offers.name') || 'Name'} (EN) *
              </label>
              <Input
                value={offerForm.name}
                onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('offers.name') || 'Name'} (AR)
              </label>
              <Input
                value={offerForm.name_ar}
                onChange={(e) => setOfferForm({ ...offerForm, name_ar: e.target.value })}
              />
            </div>
          </div>

          {/* Description */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('offers.description') || 'Description'} (EN)
              </label>
              <textarea
                value={offerForm.description}
                onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('offers.description') || 'Description'} (AR)
              </label>
              <textarea
                value={offerForm.description_ar}
                onChange={(e) => setOfferForm({ ...offerForm, description_ar: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('offers.price') || 'Price'} *
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={offerForm.price}
                onChange={(e) => setOfferForm({ ...offerForm, price: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('offers.originalPrice') || 'Original Price'}
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={offerForm.original_price || ''}
                onChange={(e) => setOfferForm({ ...offerForm, original_price: e.target.value ? parseFloat(e.target.value) : null })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('offers.discountPercentage') || 'Discount %'}
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                value={offerForm.discount_percentage || ''}
                onChange={(e) => setOfferForm({ ...offerForm, discount_percentage: e.target.value ? parseInt(e.target.value) : null })}
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('offers.durationMinutes') || 'Duration (minutes)'}
              {offerForm.service_id && !editingOffer && (
                <span className="ml-2 text-xs text-gray-500 font-normal">
                  ({i18n.language === 'ar' ? 'مأخوذ من الخدمة' : 'From service'})
                </span>
              )}
            </label>
            <Input
              type="number"
              min="1"
              value={offerForm.duration_minutes || ''}
              onChange={(e) => setOfferForm({ ...offerForm, duration_minutes: e.target.value ? parseInt(e.target.value) : null })}
              placeholder={offerForm.service_id && !editingOffer 
                ? (i18n.language === 'ar' ? 'سيتم ملؤه تلقائياً' : 'Will be auto-filled')
                : ''}
            />
          </div>

          {/* Badge */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('offers.badge') || 'Badge'} (EN) - e.g., "Most Popular", "Best Value"
              </label>
              <Input
                value={offerForm.badge}
                onChange={(e) => setOfferForm({ ...offerForm, badge: e.target.value })}
                placeholder="Most Popular"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('offers.badge') || 'Badge'} (AR)
              </label>
              <Input
                value={offerForm.badge_ar}
                onChange={(e) => setOfferForm({ ...offerForm, badge_ar: e.target.value })}
                placeholder="الأكثر شعبية"
              />
            </div>
          </div>

          {/* Perks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                {t('offers.perks') || 'Perks'} (EN)
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addPerk('en')}
                icon={<Plus className="w-4 h-4" />}
              >
                {t('offers.addPerk') || 'Add Perk'}
              </Button>
            </div>
            <div className="space-y-2">
              {offerForm.perks.map((perk, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={perk}
                    onChange={(e) => updatePerk(index, e.target.value, 'en')}
                    placeholder="e.g., Fast-track entry"
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => removePerk(index, 'en')}
                    icon={<X className="w-4 h-4" />}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                {t('offers.perks') || 'Perks'} (AR)
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addPerk('ar')}
                icon={<Plus className="w-4 h-4" />}
              >
                {t('offers.addPerk') || 'Add Perk'}
              </Button>
            </div>
            <div className="space-y-2">
              {offerForm.perks_ar.map((perk, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={perk}
                    onChange={(e) => updatePerk(index, e.target.value, 'ar')}
                    placeholder="مثل: دخول سريع"
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => removePerk(index, 'ar')}
                    icon={<X className="w-4 h-4" />}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Closing Time & Meeting Point */}
          <div className="grid grid-cols-2 gap-4">
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={offerForm.is_active}
              onChange={(e) => setOfferForm({ ...offerForm, is_active: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
              {t('common.active') || 'Active'}
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsOfferModalOpen(false);
                setEditingOffer(null);
              }}
            >
              {t('common.cancel') || 'Cancel'}
            </Button>
            <Button type="submit">
              {editingOffer ? (t('common.update') || 'Update') : (t('common.create') || 'Create')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

