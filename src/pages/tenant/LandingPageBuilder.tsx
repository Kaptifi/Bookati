import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Save, Eye, Globe, Upload, X } from 'lucide-react';

interface LandingPageSettings {
  hero_title: string;
  hero_title_ar: string;
  hero_subtitle: string;
  hero_subtitle_ar: string;
  hero_image_url: string | null;
  about_title: string;
  about_title_ar: string;
  about_description: string;
  about_description_ar: string;
  primary_color: string;
  secondary_color: string;
  show_services: boolean;
  contact_email: string | null;
  contact_phone: string | null;
  social_facebook: string | null;
  social_twitter: string | null;
  social_instagram: string | null;
  hero_video_url?: string | null;
  hero_images?: string[];
  video_url?: string | null;
  faq_items?: Array<{
    question: string;
    question_ar?: string;
    answer: string;
    answer_ar?: string;
  }>;
  trust_indicators?: {
    message?: string;
  };
  payment_methods?: string[];
}

export function LandingPageBuilder() {
  const { t, i18n } = useTranslation();
  const { userProfile, tenant } = useAuth();
  const [settings, setSettings] = useState<LandingPageSettings>({
    hero_title: 'Experience Luxury Like Never Before',
    hero_title_ar: 'اختبر الفخامة كما لم تختبرها من قبل',
    hero_subtitle: 'Book your exclusive appointment today and discover world-class services',
    hero_subtitle_ar: 'احجز موعدك الحصري اليوم واكتشف خدمات عالمية المستوى',
    hero_image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1920',
    hero_video_url: null,
    hero_images: [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1920',
      'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1920',
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1920',
    ],
    about_title: 'About Our Premium Services',
    about_title_ar: 'حول خدماتنا المميزة',
    about_description: 'We are a leading provider of luxury services, committed to excellence and customer satisfaction. With over 10 years of experience, we have served thousands of satisfied customers with our professional team and state-of-the-art facilities.',
    about_description_ar: 'نحن مزود رائد للخدمات الفاخرة، ملتزمون بالتميز ورضا العملاء. مع أكثر من 10 سنوات من الخبرة، خدمنا آلاف العملاء الراضين بفريقنا المحترف ومرافقنا الحديثة.',
    primary_color: '#2563eb',
    secondary_color: '#3b82f6',
    show_services: true,
    contact_email: 'info@example.com',
    contact_phone: '+966 50 123 4567',
    social_facebook: 'https://facebook.com/example',
    social_twitter: 'https://twitter.com/example',
    social_instagram: 'https://instagram.com/example',
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    faq_items: [
      {
        question: 'How do I book an appointment?',
        question_ar: 'كيف أحجز موعداً؟',
        answer: 'You can easily book an appointment through our online booking system. Simply select your preferred service, choose a date and time, and complete your booking. You will receive a confirmation email with all the details.',
        answer_ar: 'يمكنك بسهولة حجز موعد من خلال نظام الحجز الإلكتروني. ببساطة اختر الخدمة المفضلة لديك، واختر التاريخ والوقت، وأكمل حجزك. ستصلك رسالة تأكيد بالبريد الإلكتروني مع جميع التفاصيل.',
      },
      {
        question: 'What payment methods do you accept?',
        question_ar: 'ما هي طرق الدفع المقبولة؟',
        answer: 'We accept all major credit cards (VISA, Mastercard, American Express), debit cards, and cash payments. Online bookings can be paid securely through our payment gateway.',
        answer_ar: 'نقبل جميع بطاقات الائتمان الرئيسية (فيزا، ماستركارد، أمريكان إكسبريس)، وبطاقات الخصم، والدفع النقدي. يمكن دفع الحجوزات عبر الإنترنت بأمان من خلال بوابة الدفع الخاصة بنا.',
      },
      {
        question: 'Can I cancel or reschedule my appointment?',
        question_ar: 'هل يمكنني إلغاء أو إعادة جدولة موعدي؟',
        answer: 'Yes, you can cancel or reschedule your appointment up to 24 hours before your scheduled time. Please contact us through our customer service or use the online booking system to make changes.',
        answer_ar: 'نعم، يمكنك إلغاء أو إعادة جدولة موعدك حتى 24 ساعة قبل الوقت المحدد. يرجى الاتصال بنا من خلال خدمة العملاء أو استخدام نظام الحجز الإلكتروني لإجراء التغييرات.',
      },
      {
        question: 'Do you offer gift cards or vouchers?',
        question_ar: 'هل تقدمون بطاقات هدايا أو قسائم؟',
        answer: 'Yes, we offer gift cards and vouchers that can be purchased online or at our location. They make perfect gifts for your loved ones and can be used for any of our services.',
        answer_ar: 'نعم، نقدم بطاقات هدايا وقسائم يمكن شراؤها عبر الإنترنت أو في موقعنا. إنها هدايا مثالية لأحبائك ويمكن استخدامها لأي من خدماتنا.',
      },
      {
        question: 'What safety measures do you have in place?',
        question_ar: 'ما هي إجراءات السلامة التي لديكم؟',
        answer: 'We follow strict hygiene and safety protocols. All equipment is sanitized between uses, and our staff follows health guidelines. We maintain a clean and safe environment for all our customers.',
        answer_ar: 'نتبع بروتوكولات صارمة للنظافة والسلامة. يتم تعقيم جميع المعدات بين الاستخدامات، ويتبع فريقنا إرشادات الصحة. نحافظ على بيئة نظيفة وآمنة لجميع عملائنا.',
      },
      {
        question: 'Do you have parking available?',
        question_ar: 'هل لديكم موقف سيارات متاح؟',
        answer: 'Yes, we have complimentary parking available for all our customers. The parking area is located right next to our facility and is monitored for your safety.',
        answer_ar: 'نعم، لدينا موقف سيارات مجاني متاح لجميع عملائنا. يقع موقف السيارات بجوار منشأتنا مباشرة ويتم مراقبته لسلامتك.',
      },
      {
        question: 'What are your operating hours?',
        question_ar: 'ما هي ساعات العمل لديكم؟',
        answer: 'We are open from 9:00 AM to 9:00 PM, Sunday through Thursday. On Fridays and Saturdays, we operate from 2:00 PM to 10:00 PM. We are closed on public holidays.',
        answer_ar: 'نحن مفتوحون من الساعة 9:00 صباحاً حتى 9:00 مساءً، من الأحد إلى الخميس. يومي الجمعة والسبت، نعمل من الساعة 2:00 ظهراً حتى 10:00 مساءً. نحن مغلقون في العطلات الرسمية.',
      },
      {
        question: 'Do you offer group bookings or packages?',
        question_ar: 'هل تقدمون حجوزات جماعية أو باقات؟',
        answer: 'Yes, we offer special packages for groups and families. Our group booking options include discounted rates and customized service packages. Please contact us for more information about group rates and availability.',
        answer_ar: 'نعم، نقدم باقات خاصة للجماعات والعائلات. خيارات الحجز الجماعي لدينا تشمل أسعار مخفضة وباقات خدمات مخصصة. يرجى الاتصال بنا لمزيد من المعلومات حول الأسعار الجماعية والتوفر.',
      },
      {
        question: 'What should I bring to my appointment?',
        question_ar: 'ماذا يجب أن أحضر معي إلى موعدي؟',
        answer: 'Please bring a valid ID and your booking confirmation. For certain services, you may need to bring specific items, which will be mentioned in your confirmation email. We provide all necessary equipment and materials for our services.',
        answer_ar: 'يرجى إحضار هوية صالحة وتأكيد الحجز الخاص بك. لبعض الخدمات، قد تحتاج إلى إحضار عناصر محددة، والتي سيتم ذكرها في رسالة التأكيد بالبريد الإلكتروني. نوفر جميع المعدات والمواد اللازمة لخدماتنا.',
      },
      {
        question: 'How far in advance should I book?',
        question_ar: 'كم يجب أن أحجز مسبقاً؟',
        answer: 'We recommend booking at least 24-48 hours in advance to secure your preferred date and time. However, we do accept same-day bookings subject to availability. Popular time slots tend to fill up quickly, so early booking is advised.',
        answer_ar: 'نوصي بالحجز قبل 24-48 ساعة على الأقل لتأمين التاريخ والوقت المفضل لديك. ومع ذلك، نقبل الحجوزات في نفس اليوم حسب التوفر. تميل الأوقات الشائعة إلى الامتلاء بسرعة، لذا يُنصح بالحجز المبكر.',
      },
      {
        question: 'Do you have a loyalty program or membership?',
        question_ar: 'هل لديكم برنامج ولاء أو عضوية؟',
        answer: 'Yes, we offer a loyalty program where you can earn points with every visit. Members also receive exclusive discounts, priority booking, and special offers. You can sign up for our loyalty program at our facility or through our website.',
        answer_ar: 'نعم، نقدم برنامج ولاء حيث يمكنك كسب نقاط مع كل زيارة. يحصل الأعضاء أيضاً على خصومات حصرية وحجز ذي أولوية وعروض خاصة. يمكنك التسجيل في برنامج الولاء الخاص بنا في منشأتنا أو من خلال موقعنا الإلكتروني.',
      },
    ],
    trust_indicators: {
      message: 'Loved by thousands of customers worldwide',
    },
    payment_methods: [
      'VISA',
      'Mastercard',
      'American Express',
      'Mada',
      'Apple Pay',
      'PayPal',
    ],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadMode, setUploadMode] = useState<{
    heroImage: 'url' | 'upload';
    heroVideo: 'url' | 'upload';
    videoSection: 'url' | 'upload';
  }>({
    heroImage: 'url',
    heroVideo: 'url',
    videoSection: 'url',
  });

  // Helper function to convert file to base64 data URL
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Helper function to compress image
  const compressImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions (max 1920x1920 for hero images)
          const maxDimension = 1920;
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
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          resolve(compressedBase64);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  useEffect(() => {
    fetchLandingPageSettings();
  }, [userProfile]);

  async function fetchLandingPageSettings() {
    if (!userProfile?.tenant_id) return;

    try {
      const { data, error } = await db
        .from('tenants')
        .select('landing_page_settings')
        .eq('id', userProfile.tenant_id)
        .maybeSingle();

      if (error) throw error;

      if (data?.landing_page_settings) {
        // Merge with defaults to ensure all fields are present
        const savedSettings = data.landing_page_settings;
        const savedFaqs = savedSettings.faq_items || [];
        
        // Define default FAQs with 10 items
        const defaultFaqs = [
          {
            question: 'How do I book an appointment?',
            question_ar: 'كيف أحجز موعداً؟',
            answer: 'You can easily book an appointment through our online booking system. Simply select your preferred service, choose a date and time, and complete your booking. You will receive a confirmation email with all the details.',
            answer_ar: 'يمكنك بسهولة حجز موعد من خلال نظام الحجز الإلكتروني. ببساطة اختر الخدمة المفضلة لديك، واختر التاريخ والوقت، وأكمل حجزك. ستصلك رسالة تأكيد بالبريد الإلكتروني مع جميع التفاصيل.',
          },
          {
            question: 'What payment methods do you accept?',
            question_ar: 'ما هي طرق الدفع المقبولة؟',
            answer: 'We accept all major credit cards (VISA, Mastercard, American Express), debit cards, and cash payments. Online bookings can be paid securely through our payment gateway.',
            answer_ar: 'نقبل جميع بطاقات الائتمان الرئيسية (فيزا، ماستركارد، أمريكان إكسبريس)، وبطاقات الخصم، والدفع النقدي. يمكن دفع الحجوزات عبر الإنترنت بأمان من خلال بوابة الدفع الخاصة بنا.',
          },
          {
            question: 'Can I cancel or reschedule my appointment?',
            question_ar: 'هل يمكنني إلغاء أو إعادة جدولة موعدي؟',
            answer: 'Yes, you can cancel or reschedule your appointment up to 24 hours before your scheduled time. Please contact us through our customer service or use the online booking system to make changes.',
            answer_ar: 'نعم، يمكنك إلغاء أو إعادة جدولة موعدك حتى 24 ساعة قبل الوقت المحدد. يرجى الاتصال بنا من خلال خدمة العملاء أو استخدام نظام الحجز الإلكتروني لإجراء التغييرات.',
          },
          {
            question: 'Do you offer gift cards or vouchers?',
            question_ar: 'هل تقدمون بطاقات هدايا أو قسائم؟',
            answer: 'Yes, we offer gift cards and vouchers that can be purchased online or at our location. They make perfect gifts for your loved ones and can be used for any of our services.',
            answer_ar: 'نعم، نقدم بطاقات هدايا وقسائم يمكن شراؤها عبر الإنترنت أو في موقعنا. إنها هدايا مثالية لأحبائك ويمكن استخدامها لأي من خدماتنا.',
          },
          {
            question: 'What safety measures do you have in place?',
            question_ar: 'ما هي إجراءات السلامة التي لديكم؟',
            answer: 'We follow strict hygiene and safety protocols. All equipment is sanitized between uses, and our staff follows health guidelines. We maintain a clean and safe environment for all our customers.',
            answer_ar: 'نتبع بروتوكولات صارمة للنظافة والسلامة. يتم تعقيم جميع المعدات بين الاستخدامات، ويتبع فريقنا إرشادات الصحة. نحافظ على بيئة نظيفة وآمنة لجميع عملائنا.',
          },
          {
            question: 'Do you have parking available?',
            question_ar: 'هل لديكم موقف سيارات متاح؟',
            answer: 'Yes, we have complimentary parking available for all our customers. The parking area is located right next to our facility and is monitored for your safety.',
            answer_ar: 'نعم، لدينا موقف سيارات مجاني متاح لجميع عملائنا. يقع موقف السيارات بجوار منشأتنا مباشرة ويتم مراقبته لسلامتك.',
          },
          {
            question: 'What are your operating hours?',
            question_ar: 'ما هي ساعات العمل لديكم؟',
            answer: 'We are open from 9:00 AM to 9:00 PM, Sunday through Thursday. On Fridays and Saturdays, we operate from 2:00 PM to 10:00 PM. We are closed on public holidays.',
            answer_ar: 'نحن مفتوحون من الساعة 9:00 صباحاً حتى 9:00 مساءً، من الأحد إلى الخميس. يومي الجمعة والسبت، نعمل من الساعة 2:00 ظهراً حتى 10:00 مساءً. نحن مغلقون في العطلات الرسمية.',
          },
          {
            question: 'Do you offer group bookings or packages?',
            question_ar: 'هل تقدمون حجوزات جماعية أو باقات؟',
            answer: 'Yes, we offer special packages for groups and families. Our group booking options include discounted rates and customized service packages. Please contact us for more information about group rates and availability.',
            answer_ar: 'نعم، نقدم باقات خاصة للجماعات والعائلات. خيارات الحجز الجماعي لدينا تشمل أسعار مخفضة وباقات خدمات مخصصة. يرجى الاتصال بنا لمزيد من المعلومات حول الأسعار الجماعية والتوفر.',
          },
          {
            question: 'What should I bring to my appointment?',
            question_ar: 'ماذا يجب أن أحضر معي إلى موعدي؟',
            answer: 'Please bring a valid ID and your booking confirmation. For certain services, you may need to bring specific items, which will be mentioned in your confirmation email. We provide all necessary equipment and materials for our services.',
            answer_ar: 'يرجى إحضار هوية صالحة وتأكيد الحجز الخاص بك. لبعض الخدمات، قد تحتاج إلى إحضار عناصر محددة، والتي سيتم ذكرها في رسالة التأكيد بالبريد الإلكتروني. نوفر جميع المعدات والمواد اللازمة لخدماتنا.',
          },
          {
            question: 'How far in advance should I book?',
            question_ar: 'كم يجب أن أحجز مسبقاً؟',
            answer: 'We recommend booking at least 24-48 hours in advance to secure your preferred date and time. However, we do accept same-day bookings subject to availability. Popular time slots tend to fill up quickly, so early booking is advised.',
            answer_ar: 'نوصي بالحجز قبل 24-48 ساعة على الأقل لتأمين التاريخ والوقت المفضل لديك. ومع ذلك، نقبل الحجوزات في نفس اليوم حسب التوفر. تميل الأوقات الشائعة إلى الامتلاء بسرعة، لذا يُنصح بالحجز المبكر.',
          },
          {
            question: 'Do you have a loyalty program or membership?',
            question_ar: 'هل لديكم برنامج ولاء أو عضوية؟',
            answer: 'Yes, we offer a loyalty program where you can earn points with every visit. Members also receive exclusive discounts, priority booking, and special offers. You can sign up for our loyalty program at our facility or through our website.',
            answer_ar: 'نعم، نقدم برنامج ولاء حيث يمكنك كسب نقاط مع كل زيارة. يحصل الأعضاء أيضاً على خصومات حصرية وحجز ذي أولوية وعروض خاصة. يمكنك التسجيل في برنامج الولاء الخاص بنا في منشأتنا أو من خلال موقعنا الإلكتروني.',
          },
        ];
        
        // Use saved FAQs if they exist and have 10 or more, otherwise use the 10 defaults
        const finalFaqs = (savedFaqs.length >= 10) ? savedFaqs : defaultFaqs;
        
        setSettings({ 
          ...settings, 
          ...savedSettings,
          faq_items: finalFaqs
        });
      } else {
        // If no settings exist, keep defaults but mark as loaded
        setLoading(false);
      }
    } catch (err) {
      console.error('Error fetching landing page settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!userProfile?.tenant_id) return;

    setSaving(true);
    try {
      const { error } = await db
        .from('tenants')
        .update({ landing_page_settings: settings })
        .eq('id', userProfile.tenant_id);

      if (error) throw error;

      alert('Landing page settings saved successfully!');
    } catch (err: any) {
      console.error('Error saving landing page settings:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function handlePreview() {
    if (tenant?.slug) {
      window.open(`/${tenant.slug}/book`, '_blank');
    } else {
      alert('Tenant slug not available. Please save settings first.');
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Landing Page Builder</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">Customize your public booking page</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            icon={<Eye className="w-4 h-4" />}
            onClick={handlePreview}
          >
            Preview
          </Button>
          <Button
            icon={<Save className="w-4 h-4" />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Hero Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Hero Title (English)"
                value={settings.hero_title}
                onChange={(e) => setSettings({ ...settings, hero_title: e.target.value })}
              />
              <Input
                label="Hero Title (Arabic)"
                value={settings.hero_title_ar}
                onChange={(e) => setSettings({ ...settings, hero_title_ar: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Hero Subtitle (English)"
                value={settings.hero_subtitle}
                onChange={(e) => setSettings({ ...settings, hero_subtitle: e.target.value })}
              />
              <Input
                label="Hero Subtitle (Arabic)"
                value={settings.hero_subtitle_ar}
                onChange={(e) => setSettings({ ...settings, hero_subtitle_ar: e.target.value })}
              />
            </div>
            {/* Hero Image - Upload or URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hero Image (Optional - Legacy)
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setUploadMode({ ...uploadMode, heroImage: 'url' })}
                  className={`px-3 py-1 text-sm rounded ${
                    uploadMode.heroImage === 'url'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Use URL
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode({ ...uploadMode, heroImage: 'upload' })}
                  className={`px-3 py-1 text-sm rounded ${
                    uploadMode.heroImage === 'upload'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Upload Image
                </button>
              </div>
              {uploadMode.heroImage === 'url' ? (
            <Input
              value={settings.hero_image_url || ''}
              onChange={(e) => setSettings({ ...settings, hero_image_url: e.target.value || null })}
              placeholder="https://example.com/image.jpg"
            />
              ) : (
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      // Validate file size (200MB limit)
                      const maxSize = 200 * 1024 * 1024;
                      if (file.size > maxSize) {
                        alert('File size exceeds 200MB limit');
                        return;
                      }
                      
                      try {
                        const base64 = await compressImage(file);
                        setSettings({ ...settings, hero_image_url: base64 });
                      } catch (error) {
                        console.error('Error processing image:', error);
                        alert('Error processing image. Please try again.');
                      }
                    }}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {settings.hero_image_url && settings.hero_image_url.startsWith('data:') && (
                    <div className="mt-2 flex items-center gap-2">
                      <img src={settings.hero_image_url} alt="Preview" className="h-20 w-20 object-cover rounded border" />
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, hero_image_url: null })}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Hero Video - Upload or URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hero Video (YouTube/Vimeo URL or Upload - Optional)
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setUploadMode({ ...uploadMode, heroVideo: 'url' })}
                  className={`px-3 py-1 text-sm rounded ${
                    uploadMode.heroVideo === 'url'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Use URL
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode({ ...uploadMode, heroVideo: 'upload' })}
                  className={`px-3 py-1 text-sm rounded ${
                    uploadMode.heroVideo === 'upload'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Upload Video
                </button>
              </div>
              {uploadMode.heroVideo === 'url' ? (
            <Input
              value={settings.hero_video_url || ''}
              onChange={(e) => setSettings({ ...settings, hero_video_url: e.target.value || null })}
              placeholder="https://youtube.com/watch?v=..."
            />
              ) : (
                <div>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      // Validate file size (200MB limit)
                      const maxSize = 200 * 1024 * 1024;
                      if (file.size > maxSize) {
                        alert('File size exceeds 200MB limit');
                        return;
                      }
                      
                      try {
                        const base64 = await fileToBase64(file);
                        setSettings({ ...settings, hero_video_url: base64 });
                      } catch (error) {
                        console.error('Error processing video:', error);
                        alert('Error processing video. Please try again.');
                      }
                    }}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {settings.hero_video_url && settings.hero_video_url.startsWith('data:') && (
                    <div className="mt-2 flex items-center gap-2">
                      <video src={settings.hero_video_url} className="h-20 w-20 object-cover rounded border" controls={false} />
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, hero_video_url: null })}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hero Images (for carousel) - URLs or Upload
              </label>
              <div className="mb-2">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length === 0) return;
                    
                    // Validate file sizes (200MB limit per file)
                    const maxSize = 200 * 1024 * 1024;
                    const invalidFiles = files.filter(file => file.size > maxSize);
                    if (invalidFiles.length > 0) {
                      alert('One or more files exceed the 200MB limit');
                      return;
                    }
                    
                    const newImages: string[] = [];
                    for (const file of files) {
                      try {
                        const base64 = await compressImage(file);
                        newImages.push(base64);
                      } catch (error) {
                        console.error('Error processing image:', error);
                        try {
                          // Fallback: use original file
                          const base64 = await fileToBase64(file);
                          newImages.push(base64);
                        } catch (fallbackError) {
                          console.error('Error reading file:', fallbackError);
                        }
                      }
                    }
                    
                    if (newImages.length > 0) {
                      setSettings({
                        ...settings,
                        hero_images: [...(settings.hero_images || []), ...newImages],
                      });
                    }
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-2"
                />
              </div>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                value={(settings.hero_images || []).join('\n')}
                onChange={(e) => {
                  const urls = e.target.value.split('\n').filter(url => url.trim());
                  setSettings({ ...settings, hero_images: urls });
                }}
                placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg&#10;Or upload images above"
              />
              {settings.hero_images && settings.hero_images.length > 0 && (
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {settings.hero_images.map((url, index) => (
                    <div key={index} className="relative">
                      <img
                        src={url}
                        alt={`Hero ${index + 1}`}
                        className="w-full h-20 object-cover rounded border"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newImages = [...(settings.hero_images || [])];
                          newImages.splice(index, 1);
                          setSettings({ ...settings, hero_images: newImages });
                        }}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 hover:bg-red-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
              <strong>Note:</strong> Video takes priority over images. If video is set, images will be ignored.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trust Indicators</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Rating and review count are automatically calculated from your reviews in the database. You only need to set the trust message here.
              </p>
            </div>
            <Input
              label="Trust Message (e.g., 'Loved by thousands of customers')"
              value={settings.trust_indicators?.message || ''}
              onChange={(e) => setSettings({
                ...settings,
                trust_indicators: {
                  ...settings.trust_indicators,
                  message: e.target.value || undefined,
                },
              })}
              placeholder="Loved by thousands of customers"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Video Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Video (YouTube/Vimeo URL or Upload)
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setUploadMode({ ...uploadMode, videoSection: 'url' })}
                  className={`px-3 py-1 text-sm rounded ${
                    uploadMode.videoSection === 'url'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Use URL
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode({ ...uploadMode, videoSection: 'upload' })}
                  className={`px-3 py-1 text-sm rounded ${
                    uploadMode.videoSection === 'upload'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Upload Video
                </button>
              </div>
              {uploadMode.videoSection === 'url' ? (
            <Input
              value={settings.video_url || ''}
              onChange={(e) => setSettings({ ...settings, video_url: e.target.value || null })}
              placeholder="https://youtube.com/watch?v=..."
            />
              ) : (
                <div>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      // Validate file size (200MB limit)
                      const maxSize = 200 * 1024 * 1024;
                      if (file.size > maxSize) {
                        alert('File size exceeds 200MB limit');
                        return;
                      }
                      
                      try {
                        const base64 = await fileToBase64(file);
                        setSettings({ ...settings, video_url: base64 });
                      } catch (error) {
                        console.error('Error processing video:', error);
                        alert('Error processing video. Please try again.');
                      }
                    }}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {settings.video_url && settings.video_url.startsWith('data:') && (
                    <div className="mt-2 flex items-center gap-2">
                      <video src={settings.video_url} className="h-20 w-20 object-cover rounded border" controls={false} />
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, video_url: null })}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="About Title (English)"
                value={settings.about_title}
                onChange={(e) => setSettings({ ...settings, about_title: e.target.value })}
              />
              <Input
                label="About Title (Arabic)"
                value={settings.about_title_ar}
                onChange={(e) => setSettings({ ...settings, about_title_ar: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  About Description (English)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={4}
                  value={settings.about_description}
                  onChange={(e) => setSettings({ ...settings, about_description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  About Description (Arabic)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={4}
                  value={settings.about_description_ar}
                  onChange={(e) => setSettings({ ...settings, about_description_ar: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Design & Colors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Primary Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={settings.primary_color}
                    onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                    className="w-20 h-10 rounded border border-gray-300"
                  />
                  <Input
                    value={settings.primary_color}
                    onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                    placeholder="#2563eb"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secondary Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={settings.secondary_color}
                    onChange={(e) => setSettings({ ...settings, secondary_color: e.target.value })}
                    className="w-20 h-10 rounded border border-gray-300"
                  />
                  <Input
                    value={settings.secondary_color}
                    onChange={(e) => setSettings({ ...settings, secondary_color: e.target.value })}
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.show_services}
                  onChange={(e) => setSettings({ ...settings, show_services: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Show Services Section</span>
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Contact Email"
                type="email"
                value={settings.contact_email || ''}
                onChange={(e) => setSettings({ ...settings, contact_email: e.target.value || null })}
                placeholder="contact@example.com"
              />
              <Input
                label="Contact Phone"
                value={settings.contact_phone || ''}
                onChange={(e) => setSettings({ ...settings, contact_phone: e.target.value || null })}
                placeholder="+966 50 123 4567"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Social Media Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Facebook URL"
              value={settings.social_facebook || ''}
              onChange={(e) => setSettings({ ...settings, social_facebook: e.target.value || null })}
              placeholder="https://facebook.com/yourpage"
            />
            <Input
              label="Twitter URL"
              value={settings.social_twitter || ''}
              onChange={(e) => setSettings({ ...settings, social_twitter: e.target.value || null })}
              placeholder="https://twitter.com/yourpage"
            />
            <Input
              label="Instagram URL"
              value={settings.social_instagram || ''}
              onChange={(e) => setSettings({ ...settings, social_instagram: e.target.value || null })}
              placeholder="https://instagram.com/yourpage"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>FAQ Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              {(settings.faq_items || []).map((faq, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">FAQ {index + 1}</h4>
                    <button
                      type="button"
                      onClick={() => {
                        const newFaqs = [...(settings.faq_items || [])];
                        newFaqs.splice(index, 1);
                        setSettings({ ...settings, faq_items: newFaqs });
                      }}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Question (English)"
                      value={faq.question}
                      onChange={(e) => {
                        const newFaqs = [...(settings.faq_items || [])];
                        newFaqs[index] = { ...faq, question: e.target.value };
                        setSettings({ ...settings, faq_items: newFaqs });
                      }}
                    />
                    <Input
                      label="Question (Arabic)"
                      value={faq.question_ar || ''}
                      onChange={(e) => {
                        const newFaqs = [...(settings.faq_items || [])];
                        newFaqs[index] = { ...faq, question_ar: e.target.value || undefined };
                        setSettings({ ...settings, faq_items: newFaqs });
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Answer (English)</label>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        rows={3}
                        value={faq.answer}
                        onChange={(e) => {
                          const newFaqs = [...(settings.faq_items || [])];
                          newFaqs[index] = { ...faq, answer: e.target.value };
                          setSettings({ ...settings, faq_items: newFaqs });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Answer (Arabic)</label>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        rows={3}
                        value={faq.answer_ar || ''}
                        onChange={(e) => {
                          const newFaqs = [...(settings.faq_items || [])];
                          newFaqs[index] = { ...faq, answer_ar: e.target.value || undefined };
                          setSettings({ ...settings, faq_items: newFaqs });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSettings({
                    ...settings,
                    faq_items: [
                      ...(settings.faq_items || []),
                      { question: '', answer: '' },
                    ],
                  });
                }}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400"
              >
                + Add FAQ Item
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Methods (One per line)
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                rows={3}
                value={(settings.payment_methods || []).join('\n')}
                onChange={(e) => {
                  const methods = e.target.value.split('\n').filter(m => m.trim());
                  setSettings({ ...settings, payment_methods: methods });
                }}
                placeholder="VISA&#10;Mastercard&#10;PayPal"
              />
            </div>
          </CardContent>
        </Card>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <Globe className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">Your Public Booking Page</h3>
            <p className="text-sm text-blue-700 mt-1">
              Your customers can book services at: <strong>/{tenant?.slug}/book</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
