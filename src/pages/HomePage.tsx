import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  TrendingUp,
  Clock,
  Users,
  Sparkles,
  LineChart,
  CheckCircle,
  ArrowRight,
  Smartphone,
  Shield,
  Zap,
  UserCheck,
  Package,
  Settings,
  Layers,
  Target,
  Gift
} from 'lucide-react';
import { LanguageToggle } from '../components/layout/LanguageToggle';
import { Button } from '../components/ui/Button';

export function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isRTL = i18n.language === 'ar';

  return (
    <div className="min-h-screen bg-white" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-2 rounded-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                Bookati
              </span>
            </div>
            <div className="flex items-center gap-4">
              <LanguageToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-blue-50">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10" />
        <div className="container mx-auto px-4 py-24 md:py-32">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-8">
              <Sparkles className="w-4 h-4" />
              {t('landingPage.transformBusiness')}
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              {t('landingPage.heroTitle')}
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                {t('landingPage.heroTitleHighlight')}
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              {t('landingPage.heroSubtitle')}
            </p>
            <p className="text-sm text-gray-500">
              ✓ {t('landingPage.noCreditCard')}  ✓ {t('landingPage.freeTrial')}  ✓ {t('landingPage.cancelAnytime')}
            </p>
          </div>

          {/* Stats Section */}
          <div className="max-w-5xl mx-auto mt-20 grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatCard number="40%" label={t('landingPage.moreBookings')} />
            <StatCard number="60%" label={t('landingPage.timeSaved')} />
            <StatCard number="95%" label={t('landingPage.customerSatisfaction')} />
            <StatCard number="24/7" label={t('landingPage.onlineBooking')} />
          </div>
        </div>
      </section>

      {/* ROI Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {t('landingPage.whyChooseTitle')}
            </h2>
            <p className="text-xl text-gray-600">
              {t('landingPage.whyChooseSubtitle')}
            </p>
          </div>

          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
            <ROICard
              icon={<TrendingUp className="w-8 h-8 text-green-600" />}
              title={t('landingPage.increaseRevenue')}
              description={t('landingPage.increaseRevenueDesc')}
              benefit={t('landingPage.increaseRevenueBenefit')}
              color="green"
            />
            <ROICard
              icon={<Clock className="w-8 h-8 text-blue-600" />}
              title={t('landingPage.saveTime')}
              description={t('landingPage.saveTimeDesc')}
              benefit={t('landingPage.saveTimeBenefit')}
              color="blue"
            />
            <ROICard
              icon={<LineChart className="w-8 h-8 text-purple-600" />}
              title={t('landingPage.smartDecisions')}
              description={t('landingPage.smartDecisionsDesc')}
              benefit={t('landingPage.smartDecisionsBenefit')}
              color="purple"
            />
          </div>
        </div>
      </section>

      {/* Advanced Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium mb-6">
              <Target className="w-4 h-4" />
              {t('landingPage.whatMakesDifferent')}
            </div>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {t('landingPage.advancedFeaturesTitle')}
            </h2>
            <p className="text-xl text-gray-600">
              {t('landingPage.advancedFeaturesSubtitle')}
            </p>
          </div>

          <div className="max-w-6xl mx-auto space-y-16">
            {/* Dual Capacity System */}
            <AdvancedFeature
              icon={<Layers className="w-16 h-16 text-blue-600" />}
              title={t('landingPage.dualCapacity')}
              subtitle={t('landingPage.dualCapacitySubtitle')}
              description={t('landingPage.dualCapacityDesc')}
              benefits={[
                t('landingPage.dualCapacityBenefit1'),
                t('landingPage.dualCapacityBenefit2'),
                t('landingPage.dualCapacityBenefit3'),
                t('landingPage.dualCapacityBenefit4'),
              ]}
              highlight={t('landingPage.dualCapacityHighlight')}
            />

            {/* Smart Assignment */}
            <AdvancedFeature
              icon={<UserCheck className="w-16 h-16 text-purple-600" />}
              title={t('landingPage.intelligentAssignment')}
              subtitle={t('landingPage.intelligentAssignmentSubtitle')}
              description={t('landingPage.intelligentAssignmentDesc')}
              benefits={[
                t('landingPage.intelligentAssignmentBenefit1'),
                t('landingPage.intelligentAssignmentBenefit2'),
                t('landingPage.intelligentAssignmentBenefit3'),
                t('landingPage.intelligentAssignmentBenefit4'),
              ]}
              highlight={t('landingPage.intelligentAssignmentHighlight')}
              reversed
            />

            {/* Service Packages */}
            <AdvancedFeature
              icon={<Gift className="w-16 h-16 text-green-600" />}
              title={t('landingPage.servicePackages')}
              subtitle={t('landingPage.servicePackagesSubtitle')}
              description={t('landingPage.servicePackagesDesc')}
              benefits={[
                t('landingPage.servicePackagesBenefit1'),
                t('landingPage.servicePackagesBenefit2'),
                t('landingPage.servicePackagesBenefit3'),
                t('landingPage.servicePackagesBenefit4'),
              ]}
              highlight={t('landingPage.servicePackagesHighlight')}
            />

            {/* Parallel & Sequential Booking */}
            <AdvancedFeature
              icon={<Settings className="w-16 h-16 text-orange-600" />}
              title={t('landingPage.flexibleBooking')}
              subtitle={t('landingPage.flexibleBookingSubtitle')}
              description={t('landingPage.flexibleBookingDesc')}
              benefits={[
                t('landingPage.flexibleBookingBenefit1'),
                t('landingPage.flexibleBookingBenefit2'),
                t('landingPage.flexibleBookingBenefit3'),
                t('landingPage.flexibleBookingBenefit4'),
              ]}
              highlight={t('landingPage.flexibleBookingHighlight')}
              reversed
            />
          </div>
        </div>
      </section>

      {/* Core Features Section */}
      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {t('landingPage.coreFeaturesTitle')}
            </h2>
            <p className="text-xl text-gray-600">
              {t('landingPage.coreFeaturesSubtitle')}
            </p>
          </div>

          <div className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Calendar className="w-6 h-6 text-blue-600" />}
              title={t('landingPage.smartScheduling')}
              description={t('landingPage.smartSchedulingDesc')}
            />
            <FeatureCard
              icon={<Smartphone className="w-6 h-6 text-blue-600" />}
              title={t('landingPage.mobileFirst')}
              description={t('landingPage.mobileFirstDesc')}
            />
            <FeatureCard
              icon={<Users className="w-6 h-6 text-blue-600" />}
              title={t('landingPage.customerManagement')}
              description={t('landingPage.customerManagementDesc')}
            />
            <FeatureCard
              icon={<Zap className="w-6 h-6 text-blue-600" />}
              title={t('landingPage.instantNotifications')}
              description={t('landingPage.instantNotificationsDesc')}
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6 text-blue-600" />}
              title={t('landingPage.secureReliable')}
              description={t('landingPage.secureReliableDesc')}
            />
            <FeatureCard
              icon={<LineChart className="w-6 h-6 text-blue-600" />}
              title={t('landingPage.businessAnalytics')}
              description={t('landingPage.businessAnalyticsDesc')}
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {t('landingPage.howItWorksTitle')}
            </h2>
            <p className="text-xl text-gray-600">
              {t('landingPage.howItWorksSubtitle')}
            </p>
          </div>

          <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
            <StepCard
              step="1"
              title={t('landingPage.step1Title')}
              description={t('landingPage.step1Desc')}
            />
            <StepCard
              step="2"
              title={t('landingPage.step2Title')}
              description={t('landingPage.step2Desc')}
            />
            <StepCard
              step="3"
              title={t('landingPage.step3Title')}
              description={t('landingPage.step3Desc')}
            />
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-20 bg-gradient-to-br from-blue-50 to-white">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                {t('landingPage.testimonialTitle')}
              </h2>
              <p className="text-xl text-gray-600">
                {t('landingPage.testimonialSubtitle')}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <TestimonialCard
                quote={t('landingPage.testimonial1')}
                author={t('landingPage.testimonial1Author')}
                role={t('landingPage.testimonial1Role')}
              />
              <TestimonialCard
                quote={t('landingPage.testimonial2')}
                author={t('landingPage.testimonial2Author')}
                role={t('landingPage.testimonial2Role')}
              />
              <TestimonialCard
                quote={t('landingPage.testimonial3')}
                author={t('landingPage.testimonial3Author')}
                role={t('landingPage.testimonial3Role')}
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              {t('landingPage.ctaTitle')}
            </h2>
            <p className="text-xl mb-10 text-blue-100">
              {t('landingPage.ctaSubtitle')}
            </p>
            <p className="mt-6 text-blue-100 text-sm">
              {t('landingPage.ctaFooter')}
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gray-50">
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-2 rounded-lg">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">Bookati</span>
            </div>
            <div className="text-center md:text-right text-gray-600">
              <p>&copy; 2025 Bookati. {t('landingPage.allRightsReserved')}</p>
              <p className="text-sm mt-1">{t('landingPage.footerTagline')}</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl font-bold text-blue-600 mb-2">{number}</div>
      <div className="text-gray-600 font-medium">{label}</div>
    </div>
  );
}

function ROICard({
  icon,
  title,
  description,
  benefit,
  color
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  benefit: string;
  color: 'green' | 'blue' | 'purple';
}) {
  const colorClasses = {
    green: 'from-green-50 to-green-100 border-green-200',
    blue: 'from-blue-50 to-blue-100 border-blue-200',
    purple: 'from-purple-50 to-purple-100 border-purple-200'
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 hover:shadow-xl transition-shadow">
      <div className={`w-16 h-16 bg-gradient-to-br ${colorClasses[color]} rounded-xl flex items-center justify-center mb-6`}>
        {icon}
      </div>
      <h3 className="text-2xl font-bold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-600 mb-4 leading-relaxed">{description}</p>
      <div className="flex items-center gap-2 text-sm font-semibold text-blue-600">
        <CheckCircle className="w-5 h-5" />
        {benefit}
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all">
      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({
  step,
  title,
  description
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4 shadow-lg">
        {step}
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

function TestimonialCard({
  quote,
  author,
  role
}: {
  quote: string;
  author: string;
  role: string;
}) {
  return (
    <div className="bg-white rounded-xl p-8 shadow-md border border-gray-100">
      <div className="text-4xl text-blue-600 mb-4">"</div>
      <p className="text-gray-700 mb-6 leading-relaxed">{quote}</p>
      <div className="border-t pt-4">
        <p className="font-semibold text-gray-900">{author}</p>
        <p className="text-sm text-gray-500">{role}</p>
      </div>
    </div>
  );
}

function AdvancedFeature({
  icon,
  title,
  subtitle,
  description,
  benefits,
  highlight,
  reversed = false
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  benefits: string[];
  highlight: string;
  reversed?: boolean;
}) {
  return (
    <div className={`flex flex-col ${reversed ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-12 items-center`}>
      <div className="flex-1">
        <div className="bg-gradient-to-br from-blue-50 via-white to-blue-50 p-16 rounded-2xl border-2 border-blue-100 flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
          {icon}
        </div>
      </div>
      <div className="flex-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold mb-4">
          <Sparkles className="w-3 h-3" />
          {highlight}
        </div>
        <h3 className="text-3xl font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-lg text-blue-600 font-semibold mb-4">{subtitle}</p>
        <p className="text-gray-600 mb-6 leading-relaxed">{description}</p>
        <ul className="space-y-3">
          {benefits.map((benefit, index) => (
            <li key={index} className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700">{benefit}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
