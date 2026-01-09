import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Package, Plus, Edit, Trash2, X, Upload, Search } from 'lucide-react';
import heic2any from 'heic2any';

interface ServicePackage {
  id: string;
  name: string;
  name_ar: string;
  description: string | null;
  description_ar: string | null;
  total_price: number;
  original_price: number | null;
  discount_percentage: number | null;
  image_url?: string | null;
  gallery_urls?: string[] | null;
  is_active: boolean;
  created_at: string;
}

interface PackageService {
  id: string;
  package_id: string;
  service_id: string;
  quantity: number; // Keep for backward compatibility with subscriptions
  services: {
    name: string;
    name_ar: string;
    base_price: number;
  };
}

interface Service {
  id: string;
  name: string;
  name_ar: string;
  base_price: number;
}


export function PackagesPage() {
  const { t, i18n } = useTranslation();
  const { userProfile } = useAuth();
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<ServicePackage | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [packageForm, setPackageForm] = useState({
    name: '',
    name_ar: '',
    description: '',
    description_ar: '',
    total_price: 0,
    original_price: null as number | null,
    discount_percentage: null as number | null,
    image_url: '',
    gallery_urls: [] as string[],
    is_active: true,
    selectedServices: [] as Array<{ service_id: string; quantity: number }>
  });


  useEffect(() => {
    fetchPackages();
    fetchServices();
  }, [userProfile]);

  // Auto-calculate original_price whenever selectedServices changes
  useEffect(() => {
    // Only calculate if services are loaded
    if (services.length === 0) return;
    
    if (packageForm.selectedServices.length > 0) {
      const calculatedTotal = calculateTotalPrice();
      const validTotal = typeof calculatedTotal === 'number' && !isNaN(calculatedTotal) && isFinite(calculatedTotal) && calculatedTotal >= 0
        ? calculatedTotal 
        : 0;
      
      // Only update if original_price is different to avoid infinite loops
      if (packageForm.original_price !== validTotal && validTotal > 0) {
        setPackageForm(prev => {
          const updated = { ...prev, original_price: validTotal };
          
          // If total_price was equal to old original_price, update it to new calculated total
          const oldOriginalPrice = prev.original_price || 0;
          const prevTotalPrice = prev.total_price || 0;
          if (prevTotalPrice === oldOriginalPrice || prevTotalPrice === 0 || prevTotalPrice === null) {
            updated.total_price = validTotal;
            updated.discount_percentage = null;
          } else if (prevTotalPrice > validTotal) {
            // If total_price is now greater than original_price, set it to original_price
            updated.total_price = validTotal;
            updated.discount_percentage = null;
          } else if (validTotal > prevTotalPrice && prevTotalPrice > 0) {
            // Recalculate discount percentage if original_price changed
            updated.discount_percentage = calculateDiscountPercentage(validTotal, prevTotalPrice);
          }
          
          return updated;
        });
      }
    } else {
      // Reset prices if no services selected
      if (packageForm.original_price !== null || packageForm.total_price !== 0) {
        setPackageForm(prev => ({
          ...prev,
          original_price: null,
          total_price: 0,
          discount_percentage: null
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageForm.selectedServices.map(s => s.service_id).join(','), services.length]);

  async function fetchPackages() {
    if (!userProfile?.tenant_id) {
      console.warn('No tenant_id in userProfile');
      setLoading(false);
      return;
    }
    
    console.log('Fetching packages for tenant:', userProfile.tenant_id);
    const { data, error } = await db
      .from('service_packages')
      .select('*')
      .eq('tenant_id', userProfile.tenant_id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching packages:', error);
      alert(i18n.language === 'ar' 
        ? `خطأ في جلب الحزم: ${error.message}` 
        : `Error fetching packages: ${error.message}`);
    }
    
    console.log('Fetched packages:', data?.length || 0, data);
    setPackages(data || []);
    setLoading(false);
  }

  async function fetchServices() {
    if (!userProfile?.tenant_id) {
      console.warn('No tenant_id in userProfile for fetchServices');
      return;
    }
    console.log('Fetching services for tenant:', userProfile.tenant_id);
    const { data, error } = await db
      .from('services')
      .select('id, name, name_ar, base_price')
      .eq('tenant_id', userProfile.tenant_id)
      .eq('is_active', true)
      .order('name');
    
    if (error) {
      console.error('Error fetching services:', error);
      alert(i18n.language === 'ar' 
        ? `خطأ في جلب الخدمات: ${error.message}` 
        : `Error fetching services: ${error.message}`);
    }
    
    console.log('Fetched services:', data?.length || 0);
    setServices(data || []);
  }


  // Calculate total price from selected services (quantity is always 1)
  function calculateTotalPrice(): number {
    let total = 0;
    packageForm.selectedServices.forEach(selected => {
      if (!selected.service_id || selected.service_id.trim() === '') {
        return; // Skip empty selections
      }
      const service = services.find(s => s.id === selected.service_id);
      if (service && service.base_price) {
        const basePrice = parseFloat(String(service.base_price)) || 0;
        if (typeof basePrice === 'number' && !isNaN(basePrice) && isFinite(basePrice) && basePrice > 0) {
          total += basePrice; // quantity always 1
        }
      }
    });
    return typeof total === 'number' && !isNaN(total) && isFinite(total) && total >= 0 ? total : 0;
  }

  // Calculate discount percentage from original_price and total_price
  function calculateDiscountPercentage(originalPrice: number, finalPrice: number): number {
    if (
      typeof originalPrice === 'number' && !isNaN(originalPrice) && isFinite(originalPrice) &&
      typeof finalPrice === 'number' && !isNaN(finalPrice) && isFinite(finalPrice) &&
      originalPrice > finalPrice && originalPrice > 0
    ) {
      const percentage = Math.round(((originalPrice - finalPrice) / originalPrice) * 100);
      return typeof percentage === 'number' && !isNaN(percentage) && isFinite(percentage) ? percentage : 0;
    }
    return 0;
  }

  async function handlePackageSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userProfile?.tenant_id) {
      alert(i18n.language === 'ar' ? 'خطأ: لا يوجد معرف للمستأجر' : 'Error: No tenant ID found');
      return;
    }

    // Validate required fields
    if (!packageForm.name || !packageForm.name.trim()) {
      alert(i18n.language === 'ar' ? 'يرجى إدخال اسم الحزمة' : 'Please enter package name');
      return;
    }

    if (!packageForm.name_ar || !packageForm.name_ar.trim()) {
      alert(i18n.language === 'ar' ? 'يرجى إدخال اسم الحزمة بالعربية' : 'Please enter package name in Arabic');
      return;
    }

    // Require at least 2 services
    if (packageForm.selectedServices.length < 2) {
      alert(t('packages.selectAtLeastTwoServices') || 'Please select at least 2 services for the package');
      return;
    }

    // Validate that all selected services have valid service_id
    const invalidServices = packageForm.selectedServices.filter(
      s => !s.service_id || s.service_id.trim() === ''
    );
    if (invalidServices.length > 0) {
      alert(i18n.language === 'ar' 
        ? 'يرجى اختيار خدمة لكل عنصر في الحزمة' 
        : 'Please select a service for each package item');
      return;
    }

    // Validate that all selected services exist and are valid
    const invalidServiceIds = packageForm.selectedServices.filter(selected => {
      const service = services.find(s => s.id === selected.service_id);
      return !service || !service.base_price || isNaN(service.base_price);
    });
    if (invalidServiceIds.length > 0) {
      alert(i18n.language === 'ar' 
        ? 'بعض الخدمات المحددة غير صالحة أو لا تحتوي على سعر' 
        : 'Some selected services are invalid or missing prices');
      return;
    }

    // Calculate total price from selected services (this is the original_price)
    const calculatedTotalPrice = calculateTotalPrice();
    
    if (calculatedTotalPrice <= 0) {
      alert(i18n.language === 'ar' 
        ? 'إجمالي سعر الخدمات المحددة يجب أن يكون أكبر من الصفر' 
        : 'Total price of selected services must be greater than zero');
      return;
    }
    
    // original_price should always be the sum of all services
    const originalPrice = calculatedTotalPrice;
    
    // Validate total_price
    const totalPrice = typeof packageForm.total_price === 'number' && !isNaN(packageForm.total_price) && isFinite(packageForm.total_price)
      ? packageForm.total_price
      : originalPrice;
    
    if (totalPrice <= 0) {
      alert(i18n.language === 'ar' 
        ? 'السعر الإجمالي يجب أن يكون أكبر من الصفر' 
        : 'Total price must be greater than zero');
      return;
    }
    
    // Calculate discount percentage if total_price is less than original_price
    let finalDiscountPercentage = packageForm.discount_percentage;
    if (originalPrice > totalPrice) {
      if (!finalDiscountPercentage || finalDiscountPercentage <= 0) {
        finalDiscountPercentage = calculateDiscountPercentage(originalPrice, totalPrice);
      }
    } else {
      // No discount if total_price >= original_price
      finalDiscountPercentage = null;
    }

    // Prepare gallery_urls - ensure it's a valid array (never null for JSONB)
    let galleryUrls: string[] = [];
    if (packageForm.gallery_urls && Array.isArray(packageForm.gallery_urls) && packageForm.gallery_urls.length > 0) {
      galleryUrls = packageForm.gallery_urls;
    } else if (packageForm.image_url) {
      galleryUrls = [packageForm.image_url];
    }
    // Always send as array, even if empty (JSONB columns should receive [] not null)

    const packagePayload: any = {
      tenant_id: userProfile.tenant_id,
      name: packageForm.name.trim(),
      name_ar: packageForm.name_ar.trim(),
      description: packageForm.description?.trim() || null,
      description_ar: packageForm.description_ar?.trim() || null,
      total_price: totalPrice, // Use validated totalPrice
      original_price: originalPrice, // Always set to calculated total
      image_url: packageForm.image_url || null,
      gallery_urls: galleryUrls, // Always send as array (empty array [] if no images)
      is_active: packageForm.is_active
    };

    // Add discount_percentage if there's a discount
    if (finalDiscountPercentage !== null && finalDiscountPercentage !== undefined && finalDiscountPercentage > 0) {
      const discountValue = parseInt(String(finalDiscountPercentage), 10);
      if (!isNaN(discountValue) && isFinite(discountValue) && discountValue >= 0 && discountValue <= 100) {
        packagePayload.discount_percentage = discountValue;
      } else {
        packagePayload.discount_percentage = null;
      }
    } else {
      packagePayload.discount_percentage = null;
    }

    try {
    if (editingPackage) {
        // Update existing package
        const { error: updateError } = await db
          .from('service_packages')
          .update(packagePayload)
          .eq('id', editingPackage.id);

        if (updateError) {
          console.error('Error updating package:', updateError);
          alert(i18n.language === 'ar' 
            ? `خطأ في تحديث الحزمة: ${updateError.message}` 
            : `Error updating package: ${updateError.message}`);
          return;
        }

      // Delete existing package services
        const { error: deleteError } = await db
          .from('package_services')
          .delete()
          .eq('package_id', editingPackage.id);

        if (deleteError) {
          console.error('Error deleting existing package services:', deleteError);
          alert(i18n.language === 'ar' 
            ? `خطأ في حذف خدمات الحزمة القديمة: ${deleteError.message}` 
            : `Error deleting existing package services: ${deleteError.message}`);
          return;
        }

      // Insert new package services
      const packageServices = packageForm.selectedServices.map(s => ({
        package_id: editingPackage.id,
          service_id: s.service_id.trim(),
          quantity: 1 // Always 1
        }));

        const { error: servicesError } = await db
          .from('package_services')
          .insert(packageServices)
          .then();

        if (servicesError) {
          console.error('Error inserting package services:', servicesError);
          alert(i18n.language === 'ar' 
            ? `تم تحديث الحزمة لكن حدث خطأ في إضافة الخدمات: ${servicesError.message}` 
            : `Package updated but error adding services: ${servicesError.message}`);
          // Refresh to show current state
          fetchPackages();
          return;
        }

        console.log('Package updated successfully');
    } else {
        // Create new package
        console.log('Creating new package with payload:', packagePayload);
        const { data: newPackage, error: insertError } = await db
        .from('service_packages')
        .insert(packagePayload)
        .select()
        .single();

        if (insertError) {
          console.error('Error creating package:', insertError);
          alert(i18n.language === 'ar' 
            ? `خطأ في إنشاء الحزمة: ${insertError.message}` 
            : `Error creating package: ${insertError.message}`);
          return;
        }

        if (!newPackage || !newPackage.id) {
          console.error('Package creation returned no data or missing ID');
          alert(i18n.language === 'ar' ? 'حدث خطأ في إنشاء الحزمة' : 'Error creating package');
          return;
        }

        console.log('Package created successfully:', newPackage);
        
        // Insert package services
        const packageServices = packageForm.selectedServices.map(s => ({
          package_id: newPackage.id,
          service_id: s.service_id.trim(),
          quantity: 1 // Always 1
        }));
        
        console.log('Inserting package services:', packageServices);
        const { error: servicesError } = await db
          .from('package_services')
          .insert(packageServices)
          .then();
        
        if (servicesError) {
          console.error('Error inserting package services:', servicesError);
          
          // Try to delete the package if services insertion failed
          await db
            .from('service_packages')
            .delete()
            .eq('id', newPackage.id);
          
          alert(i18n.language === 'ar' 
            ? `فشل في إضافة الخدمات للحزمة. تم إلغاء إنشاء الحزمة: ${servicesError.message}` 
            : `Failed to add services to package. Package creation cancelled: ${servicesError.message}`);
          return;
        }

        console.log('Package services inserted successfully');
      }

      // Success - close modal and refresh
      setIsPackageModalOpen(false);
      setEditingPackage(null);
      resetPackageForm();
      await fetchPackages();
      
      // Show success message
      alert(i18n.language === 'ar' 
        ? (editingPackage ? 'تم تحديث الحزمة بنجاح' : 'تم إنشاء الحزمة بنجاح')
        : (editingPackage ? 'Package updated successfully' : 'Package created successfully'));

    } catch (error: any) {
      console.error('Unexpected error in handlePackageSubmit:', error);
      alert(i18n.language === 'ar' 
        ? `حدث خطأ غير متوقع: ${error?.message || 'خطأ غير معروف'}` 
        : `Unexpected error: ${error?.message || 'Unknown error'}`);
    }

    setIsPackageModalOpen(false);
    setEditingPackage(null);
    resetPackageForm();
    fetchPackages();
  }


  async function handleDeletePackage(packageId: string) {
    if (!confirm(t('packages.confirmDelete'))) return;
    
    try {
      // First, delete all related package subscription usage records
      // Get subscription IDs first
      const { data: subscriptions, error: fetchSubsError } = await db
        .from('package_subscriptions')
        .select('id')
        .eq('package_id', packageId);

      if (!fetchSubsError && subscriptions && subscriptions.length > 0) {
        const subscriptionIds = subscriptions.map(sub => sub.id);
        
        // Delete usage records for these subscriptions one by one
        for (const subscriptionId of subscriptionIds) {
          const { error: usageError } = await db
            .from('package_subscription_usage')
            .delete()
            .eq('subscription_id', subscriptionId);

          if (usageError) {
            console.warn(`Error deleting subscription usage for ${subscriptionId}:`, usageError);
            // Continue with other deletions even if one fails
          }
        }
      }

      // Delete all related package subscriptions
      const { error: subscriptionsError } = await db
        .from('package_subscriptions')
        .delete()
        .eq('package_id', packageId);

      if (subscriptionsError) {
        console.error('Error deleting package subscriptions:', subscriptionsError);
        // If there are subscriptions, we need to delete them first
        if (subscriptionsError.message?.includes('Cannot delete')) {
          alert(i18n.language === 'ar' 
            ? 'لا يمكن حذف الحزمة لأنها مرتبطة باشتراكات. يرجى حذف الاشتراكات أولاً.' 
            : 'Cannot delete package because it has active subscriptions. Please delete subscriptions first.');
          return;
        }
      }

      // Delete package services (junction table)
      const { error: servicesError } = await db
        .from('package_services')
        .delete()
        .eq('package_id', packageId);

      if (servicesError) {
        console.error('Error deleting package services:', servicesError);
        alert(i18n.language === 'ar' 
          ? `خطأ في حذف خدمات الحزمة: ${servicesError.message}` 
          : `Error deleting package services: ${servicesError.message}`);
      return;
    }

      // Finally, delete the package itself
      const { error: packageError } = await db
        .from('service_packages')
        .delete()
        .eq('id', packageId);

      if (packageError) {
        console.error('Error deleting package:', packageError);
        alert(i18n.language === 'ar' 
          ? `خطأ في حذف الحزمة: ${packageError.message}` 
          : `Error deleting package: ${packageError.message}`);
        return;
      }

      // Refresh the packages list
    fetchPackages();
    } catch (error: any) {
      console.error('Error in handleDeletePackage:', error);
      alert(i18n.language === 'ar' 
        ? `حدث خطأ أثناء حذف الحزمة: ${error?.message || 'خطأ غير معروف'}` 
        : `Error deleting package: ${error?.message || 'Unknown error'}`);
    }
  }

  async function handleEditPackage(pkg: ServicePackage) {
    try {
      console.log('Editing package:', pkg);
      
      // Ensure services are loaded
      if (!services || services.length === 0) {
        console.warn('Services not loaded yet, fetching...');
        await fetchServices();
      }

      const { data: packageServices, error: servicesError } = await db
      .from('package_services')
      .select('service_id, quantity')
      .eq('package_id', pkg.id);

      if (servicesError) {
        console.error('Error fetching package services:', servicesError);
        alert(i18n.language === 'ar' 
          ? `خطأ في جلب خدمات الحزمة: ${servicesError.message}` 
          : `Error fetching package services: ${servicesError.message}`);
        return;
      }

      console.log('Package services:', packageServices);
      console.log('Available services:', services);

      // Filter out services that no longer exist or are inactive
      const validPackageServices = (packageServices || []).filter(ps => {
        const serviceExists = services.some(s => s.id === ps.service_id);
        if (!serviceExists) {
          console.warn(`Service ${ps.service_id} not found in available services, filtering out`);
        }
        return serviceExists;
      });

      console.log('Valid package services:', validPackageServices);

      // Calculate original_price from selected services (quantity is always 1)
      const calculatedOriginalPrice = validPackageServices.reduce((sum, ps) => {
        const service = services.find(s => s.id === ps.service_id);
        if (!service) {
          console.warn('Service not found for package service:', ps.service_id);
          return sum;
        }
        const basePrice = service.base_price || 0;
        const validPrice = typeof basePrice === 'number' && !isNaN(basePrice) && isFinite(basePrice) ? basePrice : 0;
        return sum + validPrice; // quantity always 1
      }, 0);

      console.log('Calculated original price:', calculatedOriginalPrice);

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
            // If parsing fails, treat as empty
          }
        }
      }
      // If no gallery but has image_url, use it
      if (galleryUrls.length === 0 && pkg.image_url) {
        galleryUrls = [pkg.image_url];
      }

      // Ensure selectedServices have valid structure
      const formattedSelectedServices = validPackageServices.map(ps => ({
        service_id: ps.service_id,
        quantity: ps.quantity || 1
      }));

      // Ensure all numeric values are valid
      const validTotalPrice = typeof pkg.total_price === 'number' && !isNaN(pkg.total_price) && isFinite(pkg.total_price)
        ? pkg.total_price
        : 0;
      const validCalculatedOriginal = typeof calculatedOriginalPrice === 'number' && !isNaN(calculatedOriginalPrice) && isFinite(calculatedOriginalPrice)
        ? calculatedOriginalPrice
        : 0;
      const validOriginalPrice = validCalculatedOriginal > 0 
        ? validCalculatedOriginal 
        : (typeof pkg.original_price === 'number' && !isNaN(pkg.original_price) && isFinite(pkg.original_price) ? pkg.original_price : null);
      const validDiscount = typeof pkg.discount_percentage === 'number' && !isNaN(pkg.discount_percentage) && isFinite(pkg.discount_percentage)
        ? pkg.discount_percentage
        : null;

    setEditingPackage(pkg);
    setPackageForm({
        name: pkg.name || '',
        name_ar: pkg.name_ar || '',
      description: pkg.description || '',
      description_ar: pkg.description_ar || '',
        total_price: validTotalPrice,
        original_price: validOriginalPrice,
        discount_percentage: validDiscount,
        image_url: pkg.image_url || '',
        gallery_urls: galleryUrls,
        is_active: pkg.is_active !== undefined ? pkg.is_active : true,
        selectedServices: formattedSelectedServices
      });
      
      console.log('Package form set, opening modal');
    setIsPackageModalOpen(true);
    } catch (error: any) {
      console.error('Error in handleEditPackage:', error);
      alert(i18n.language === 'ar' 
        ? `خطأ في تحميل الحزمة للتحرير: ${error?.message || 'خطأ غير معروف'}` 
        : `Error loading package for editing: ${error?.message || 'Unknown error'}`);
    }
  }


  function resetPackageForm() {
    setPackageForm({
      name: '',
      name_ar: '',
      description: '',
      description_ar: '',
      total_price: 0,
      original_price: null,
      discount_percentage: null,
      image_url: '',
      gallery_urls: [],
      is_active: true,
      selectedServices: []
    });
  }


  function addServiceToPackage() {
    setPackageForm(prev => ({
      ...prev,
      selectedServices: [...prev.selectedServices, { service_id: '', quantity: 1 }] // quantity always 1, not shown in UI
      // Note: original_price will be updated when the service is selected via updateServiceInPackage
    }));
  }

  function removeServiceFromPackage(index: number) {
    setPackageForm(prev => {
      const updated = {
      ...prev,
      selectedServices: prev.selectedServices.filter((_, i) => i !== index)
      };
      
      // Recalculate original_price after removing a service
      const calculatedTotal = updated.selectedServices.reduce((sum, selected) => {
        if (!selected.service_id || selected.service_id.trim() === '') {
          return sum;
        }
        const service = services.find(s => s.id === selected.service_id);
        if (!service) {
          return sum;
        }
        const basePrice = service.base_price || 0;
        if (typeof basePrice === 'number' && !isNaN(basePrice) && isFinite(basePrice) && basePrice > 0) {
          return sum + basePrice;
        }
        return sum;
      }, 0);
      
      const validTotal = typeof calculatedTotal === 'number' && !isNaN(calculatedTotal) && isFinite(calculatedTotal) && calculatedTotal >= 0
        ? calculatedTotal 
        : 0;
      
      updated.original_price = validTotal;
      
      // If total_price was equal to old original_price, update it to new calculated total
      const oldOriginalPrice = prev.original_price || 0;
      const prevTotalPrice = prev.total_price || 0;
      if (prevTotalPrice === oldOriginalPrice || prevTotalPrice === 0) {
        updated.total_price = validTotal;
      } else if (prevTotalPrice > validTotal) {
        // If total_price is now greater than original_price, set it to original_price
        updated.total_price = validTotal;
        updated.discount_percentage = null;
      } else {
        // Recalculate discount percentage if total_price is less than new original_price
        updated.discount_percentage = validTotal > prevTotalPrice 
          ? calculateDiscountPercentage(validTotal, prevTotalPrice)
          : null;
      }
      
      return updated;
    });
  }

  function updateServiceInPackage(index: number, field: 'service_id', value: string) {
    setPackageForm(prev => {
      const updated = {
      ...prev,
      selectedServices: prev.selectedServices.map((s, i) =>
          i === index ? { ...s, [field]: value.trim() } : s
        )
      };
      
      // Auto-calculate total price from all selected services (quantity is always 1)
      const calculatedTotal = updated.selectedServices.reduce((sum, selected) => {
        if (!selected.service_id || selected.service_id.trim() === '') {
          return sum; // Skip empty service selections
        }
        const service = services.find(s => s.id === selected.service_id);
        if (!service) {
          return sum; // Skip if service not found
        }
        const basePrice = service.base_price || 0;
        if (typeof basePrice === 'number' && !isNaN(basePrice) && isFinite(basePrice) && basePrice > 0) {
          return sum + basePrice; // quantity always 1
        }
        return sum;
      }, 0);
      
      // Ensure calculatedTotal is a valid number
      const validTotal = typeof calculatedTotal === 'number' && !isNaN(calculatedTotal) && isFinite(calculatedTotal) && calculatedTotal >= 0
        ? calculatedTotal 
        : 0;
      
      // Always update original_price to be the sum of all services
      updated.original_price = validTotal;
      
      // If total_price was equal to old original_price, update it to new calculated total
      // Otherwise, keep total_price as is (user may have set a discount)
      const oldOriginalPrice = prev.original_price || 0;
      const prevTotalPrice = prev.total_price || 0;
      if (prevTotalPrice === oldOriginalPrice || prevTotalPrice === 0) {
        updated.total_price = validTotal;
    } else {
        // Ensure total_price is still valid
        updated.total_price = typeof prev.total_price === 'number' && !isNaN(prev.total_price) && isFinite(prev.total_price)
          ? prev.total_price
          : validTotal;
      }
      
      // Recalculate discount percentage if original_price changed
      if (updated.original_price > updated.total_price && updated.total_price > 0) {
        updated.discount_percentage = calculateDiscountPercentage(updated.original_price, updated.total_price);
      } else {
        updated.discount_percentage = null;
      }
      
      return updated;
    });
  }


  if (loading) return <div className="p-4 md:p-8">{t('common.loading')}</div>;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 md:mb-8 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{t('packages.title')}</h1>
      </div>

      {/* Available Packages Section */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {t('packages.availablePackages')}
            </CardTitle>
            <Button onClick={() => setIsPackageModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('packages.addPackage')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search Bar */}
          {packages.length > 0 && (
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  type="text"
                  placeholder={i18n.language === 'ar' ? 'ابحث عن حزمة...' : 'Search packages...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full"
                />
              </div>
            </div>
          )}

          {/* Filtered Packages */}
          {(() => {
            const filteredPackages = packages.filter(pkg => {
              if (!searchQuery.trim()) return true;
              const query = searchQuery.toLowerCase().trim();
              const name = (pkg.name || '').toLowerCase();
              const nameAr = (pkg.name_ar || '').toLowerCase();
              const description = (pkg.description || '').toLowerCase();
              const descriptionAr = (pkg.description_ar || '').toLowerCase();
              return name.includes(query) || nameAr.includes(query) || 
                     description.includes(query) || descriptionAr.includes(query);
            });

            if (filteredPackages.length === 0 && packages.length > 0) {
              return (
                <div className="text-center py-12">
                  <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {i18n.language === 'ar' ? 'لا توجد نتائج' : 'No results found'}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {i18n.language === 'ar' 
                      ? `لم يتم العثور على حزم تطابق "${searchQuery}"`
                      : `No packages found matching "${searchQuery}"`}
                  </p>
                  <Button onClick={() => setSearchQuery('')} variant="secondary">
                    {i18n.language === 'ar' ? 'مسح البحث' : 'Clear Search'}
                  </Button>
                </div>
              );
            }

            if (filteredPackages.length === 0) {
              return <p className="text-gray-500 text-center py-8">{t('packages.noPackages')}</p>;
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPackages.map(pkg => (
                <div
                  key={pkg.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg">
                      {i18n.language === 'ar' ? pkg.name_ar : pkg.name}
                    </h3>
                    <span className={`px-2 py-1 text-xs rounded ${pkg.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {pkg.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                  </div>
                  {(pkg.description || pkg.description_ar) && (
                    <p className="text-sm text-gray-600 mb-3">
                      {i18n.language === 'ar' ? pkg.description_ar : pkg.description}
                    </p>
                  )}
                  <div className="text-2xl font-bold text-blue-600 mb-4">
                    {pkg.total_price} {t('common.sar')}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditPackage(pkg)}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                      <Edit className="w-4 h-4 inline mr-1" />
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDeletePackage(pkg.id)}
                      className="px-3 py-2 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Add/Edit Package Modal */}
      <Modal
        isOpen={isPackageModalOpen}
        onClose={() => {
          setIsPackageModalOpen(false);
          setEditingPackage(null);
          resetPackageForm();
        }}
        title={editingPackage ? t('packages.editPackage') : t('packages.addPackage')}
        size="xl"
      >
        {(() => {
          if (services.length === 0) {
            return (
              <div className="p-4 text-center">
                <p className="text-gray-600 mb-4">
                  {i18n.language === 'ar' ? 'جاري تحميل الخدمات...' : 'Loading services...'}
                </p>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            );
          }

          return (
        <form onSubmit={handlePackageSubmit} className="space-y-4">
          <Input
            label={t('packages.packageName')}
            value={packageForm.name}
            onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
            required
          />
          <Input
            label={t('packages.packageNameAr')}
            value={packageForm.name_ar}
            onChange={(e) => setPackageForm({ ...packageForm, name_ar: e.target.value })}
            required
          />
          <Input
            label={t('packages.description')}
            value={packageForm.description}
            onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })}
          />
          <Input
            label={t('packages.descriptionAr')}
            value={packageForm.description_ar}
            onChange={(e) => setPackageForm({ ...packageForm, description_ar: e.target.value })}
          />

          {/* Multiple Images Upload */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Upload className="w-5 h-5 text-blue-600" />
              {t('packages.packageImages') || 'Package Images'}
            </h3>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {i18n.language === 'ar' ? 'رفع صور الحزمة (متعدد)' : 'Upload Package Images (Multiple)'}
            </label>
            <div className="space-y-2">
              <input
                type="file"
                multiple
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/bmp,image/x-icon,image/vnd.microsoft.icon,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.ico,.heic,.heif"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;
                  
                  // Validate file sizes (200MB limit per file)
                  const maxSizePerFile = 200 * 1024 * 1024; // 200MB
                  const invalidFiles = files.filter(file => file.size > maxSizePerFile);
                  if (invalidFiles.length > 0) {
                    alert(`One or more files exceed the 200MB limit. Please select smaller files.`);
                    return;
                  }
                  
                  // Validate file extensions
                  const validImageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.heic', '.heif'];
                  const invalidExtensions = files.filter(file => {
                    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
                    return !validImageExtensions.includes(fileExtension) && !file.type.startsWith('image/');
                  });
                  if (invalidExtensions.length > 0) {
                    alert('Please select valid image files only (JPG, PNG, GIF, WEBP, SVG, BMP, ICO, HEIC, HEIF)');
                    return;
                  }
                  
                  // Helper function to convert HEIC to JPEG
                  const convertHeicToJpeg = async (file: File): Promise<File> => {
                    try {
                      const fileExtension = file.name.split('.').pop()?.toLowerCase();
                      if (fileExtension === 'heic' || fileExtension === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
                        const convertedBlob = await heic2any({
                          blob: file,
                          toType: 'image/jpeg',
                          quality: 0.9,
                        });
                        const convertedFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                        return new File([convertedFile], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
                      }
                      return file;
                    } catch (error) {
                      console.error('Error converting HEIC:', error);
                      throw new Error('Failed to convert HEIC file. Please try converting it to JPEG first.');
                    }
                  };

                  // Compress images before adding
                  const compressImage = async (file: File): Promise<string> => {
                    // Convert HEIC to JPEG first if needed
                    const processedFile = await convertHeicToJpeg(file);
                    
                    return new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                          const canvas = document.createElement('canvas');
                          let width = img.width;
                          let height = img.height;

                          // Calculate new dimensions (max 1200x1200 for package images)
                          const maxDimension = 1200;
                          if (width > height) {
                            if (width > maxDimension) {
                              height = (height * maxDimension) / width;
                              width = maxDimension;
                            }
                          } else {
                            if (height > maxDimension) {
                              width = (width * maxDimension) / height;
                              height = maxDimension;
                            }
                          }

                          canvas.width = width;
                          canvas.height = height;

                          const ctx = canvas.getContext('2d');
                          if (!ctx) {
                            reject(new Error('Could not get canvas context'));
                            return;
                          }

                          ctx.drawImage(img, 0, 0, width, height);
                          // Compress to JPEG with 0.75 quality for smaller file size
                          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
                          resolve(compressedBase64);
                        };
                        img.onerror = (error) => {
                          console.error('Image load error:', error);
                          reject(new Error('Failed to load image. Please ensure it is a valid image file.'));
                        };
                        img.src = e.target?.result as string;
                      };
                      reader.onerror = reject;
                      reader.readAsDataURL(processedFile);
                    });
                  };
                  
                  const newImages: string[] = [];
                  for (const file of files) {
                    try {
                      const compressedDataUrl = await compressImage(file);
                      newImages.push(compressedDataUrl);
                    } catch (error) {
                      console.error('Error compressing file:', error);
                      // Fallback: use original file if compression fails
                      try {
                        const reader = new FileReader();
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                          reader.onload = (e) => resolve(e.target?.result as string);
                          reader.onerror = reject;
                          reader.readAsDataURL(file);
                        });
                        newImages.push(dataUrl);
                      } catch (fallbackError) {
                        console.error('Error reading file:', fallbackError);
                      }
                    }
                  }
                  
                  if (newImages.length > 0) {
                    setPackageForm({
                      ...packageForm,
                      gallery_urls: [...packageForm.gallery_urls, ...newImages],
                      image_url: packageForm.image_url || newImages[0] || ''
                    });
                  }
                }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {/* Display existing images */}
              {packageForm.gallery_urls.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {packageForm.gallery_urls.map((url, idx) => (
                    <div key={idx} className="relative group">
                      <img 
                        src={url} 
                        alt={`Package image ${idx + 1}`} 
                        className="w-full h-20 object-cover rounded border border-gray-200" 
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newUrls = packageForm.gallery_urls.filter((_, i) => i !== idx);
                          setPackageForm({
                            ...packageForm,
                            gallery_urls: newUrls,
                            image_url: newUrls[0] || ''
                          });
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pricing Section */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-5 border border-blue-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-blue-600" />
              {i18n.language === 'ar' ? 'التسعير' : 'Pricing'}
            </h3>
            
            {/* Original Price - Auto-calculated */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-semibold">
                  {i18n.language === 'ar' ? 'تلقائي' : 'AUTO'}
                </span>
                {t('packages.originalPrice') || 'Original Price'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={(() => {
                    const price = packageForm.original_price;
                    if (typeof price === 'number' && !isNaN(price) && isFinite(price) && price > 0) {
                      return price.toFixed(2);
                    }
                    return '0.00';
                  })()}
                  readOnly
                  className="w-full px-4 py-3 border-2 border-blue-200 rounded-lg bg-white cursor-not-allowed font-semibold text-gray-700 text-lg"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                  {t('common.sar') || 'SAR'}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                <span className="text-green-600">✓</span>
                {t('packages.originalPriceDescription') || 'Sum of all selected services\' prices'}
              </p>
            </div>

            {/* Discount and Final Price */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Discount Percentage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('packages.discountPercentage') || 'Discount Percentage'}
            </label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={(() => {
                      const discount = packageForm.discount_percentage;
                      if (typeof discount === 'number' && !isNaN(discount) && isFinite(discount)) {
                        return discount;
                      }
                      return '';
                    })()}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      if (inputValue === '') {
                        setPackageForm(prev => {
                          const updated = { ...prev, discount_percentage: null };
                          updated.total_price = prev.original_price || 0;
                          return updated;
                        });
                        return;
                      }
                      
                      const value = parseInt(inputValue, 10);
                      if (isNaN(value) || !isFinite(value) || value < 0 || value > 100) {
                        return;
                      }
                      
                      setPackageForm(prev => {
                        const updated = { ...prev, discount_percentage: value };
                        if (value > 0 && prev.original_price && !isNaN(prev.original_price)) {
                          updated.total_price = Math.round(prev.original_price * (1 - value / 100) * 100) / 100;
                        } else if (value === 0) {
                          updated.total_price = prev.original_price || 0;
                        }
                        return updated;
                      });
                    }}
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">%</span>
                </div>
              </div>

              {/* Final Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('packages.finalPrice') || 'Final Price'}
                  {packageForm.discount_percentage && packageForm.discount_percentage > 0 && (
                    <span className="ml-2 text-green-600 font-semibold">
                      ({i18n.language === 'ar' ? 'وفر' : 'Save'} {packageForm.discount_percentage}%)
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={(() => {
                      const price = packageForm.total_price;
                      if (typeof price === 'number' && !isNaN(price) && isFinite(price) && price >= 0) {
                        return price;
                      }
                      // If total_price is 0 or invalid, show original_price if available
                      if (packageForm.original_price && typeof packageForm.original_price === 'number' && packageForm.original_price > 0) {
                        return packageForm.original_price;
                      }
                      return '';
                    })()}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      if (inputValue === '') {
                        setPackageForm(prev => ({ ...prev, total_price: 0, discount_percentage: null }));
                        return;
                      }
                      
                      const value = parseFloat(inputValue);
                      if (isNaN(value) || !isFinite(value)) {
                        return;
                      }
                      
                      setPackageForm(prev => {
                        const updated = { ...prev, total_price: value };
                        if (prev.original_price && value < prev.original_price && value > 0) {
                          updated.discount_percentage = calculateDiscountPercentage(prev.original_price, value);
                        } else if (value >= prev.original_price) {
                          updated.discount_percentage = null;
                        }
                        return updated;
                      });
                    }}
                    className="font-semibold text-lg"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                    {t('common.sar') || 'SAR'}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  {t('packages.finalPriceDescription') || 'Set a lower price to create a discount'}
                </p>
              </div>
            </div>
          </div>

          {/* Services Selection - Require at least 2 services */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-blue-600" />
              {t('packages.includedServices')} *
            </h3>
            {packageForm.selectedServices.length < 2 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-amber-800 flex items-center gap-2">
                  <span className="text-amber-600">⚠</span>
                  {t('packages.selectAtLeastTwoServices') || 'Please select at least 2 services'}
                </p>
              </div>
            )}
            <div className="space-y-3 mb-4">
              {packageForm.selectedServices.map((selected, index) => {
                if (!selected) {
                  console.warn('Invalid selected service at index:', index);
                  return null;
                }
                const selectedService = services.find(s => s.id === selected.service_id);
                return (
                  <div key={`${selected.service_id || 'new'}-${index}`} className="flex gap-2 items-center bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                  <select
                      value={selected.service_id || ''}
                    onChange={(e) => updateServiceInPackage(index, 'service_id', e.target.value)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    required
                  >
                    <option value="">{t('packages.selectService')}</option>
                      {services && services.length > 0 ? (
                        services
                          .filter(service => 
                            // Don't show services that are already selected (unless it's the current one)
                            selected.service_id === service.id || 
                            !packageForm.selectedServices.some(s => s.service_id === service.id && s.service_id !== selected.service_id)
                          )
                          .map(service => (
                      <option key={service.id} value={service.id}>
                              {i18n.language === 'ar' ? service.name_ar : service.name} - {service.base_price || 0} {t('common.sar')}
                      </option>
                          ))
                      ) : (
                        <option value="" disabled>{i18n.language === 'ar' ? 'لا توجد خدمات متاحة' : 'No services available'}</option>
                      )}
                  </select>
                    {selected.service_id && !selectedService && (
                      <span className="text-xs text-red-500 self-center px-2 whitespace-nowrap">
                        {i18n.language === 'ar' ? 'خدمة غير موجودة' : 'Service not found'}
                      </span>
                    )}
                  {selectedService && (
                    <div className="px-3 py-2 bg-blue-50 rounded-lg border border-blue-200 min-w-[120px] text-center">
                      <span className="text-sm font-semibold text-blue-700">
                        {selectedService.base_price || 0} {t('common.sar')}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeServiceFromPackage(index)}
                    className="px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 transition-colors flex items-center justify-center min-w-[40px]"
                    title={i18n.language === 'ar' ? 'حذف الخدمة' : 'Remove service'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            </div>
          
          <Button 
            type="button" 
            onClick={addServiceToPackage} 
            variant="outline" 
            className="w-full border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
              <Plus className="w-4 h-4 mr-2" />
              {t('packages.addService')}
            </Button>
          </div>

        {/* Active Status */}
        <div className="bg-gray-50 rounded-lg p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={packageForm.is_active}
              onChange={(e) => setPackageForm({ ...packageForm, is_active: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-2"
            />
            <span className="text-sm font-medium text-gray-700">{t('packages.isActive')}</span>
          </label>
        </div>

        {/* Form Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3">
              {editingPackage ? t('common.update') : t('common.create')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setIsPackageModalOpen(false);
                setEditingPackage(null);
                resetPackageForm();
              }}
            variant="outline"
            className="px-6"
            >
              {t('common.cancel')}
            </Button>
          </div>
        </form>
          );
        })()}
      </Modal>

    </div>
  );
}
