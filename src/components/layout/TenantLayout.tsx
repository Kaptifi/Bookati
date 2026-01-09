import React, { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useTenantFeatures } from '../../hooks/useTenantFeatures';
import { LanguageToggle } from './LanguageToggle';
import { Calendar, Users, Briefcase, Settings, LogOut, LayoutDashboard, Globe, Package, Gift, Menu, X, Eye, ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';

interface TenantLayoutProps {
  children: React.ReactNode;
  tenantSlug?: string;
}

export function TenantLayout({ children, tenantSlug: propTenantSlug }: TenantLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ tenantSlug?: string }>();
  const { userProfile, tenant, signOut } = useAuth();
  const { features } = useTenantFeatures(tenant?.id);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Get tenantSlug from props, URL params, or tenant slug
  const tenantSlug = propTenantSlug || params.tenantSlug || tenant?.slug || '';

  const baseNavigation = [
    {
      name: t('navigation.home'),
      href: `/${tenantSlug}/admin`,
      icon: LayoutDashboard,
      current: location.pathname === `/${tenantSlug}/admin`,
      visible: true,
    },
    {
      name: t('navigation.services'),
      href: `/${tenantSlug}/admin/services`,
      icon: Briefcase,
      current: location.pathname.startsWith(`/${tenantSlug}/admin/services`),
      visible: true,
    },
    {
      name: t('navigation.packages'),
      href: `/${tenantSlug}/admin/packages`,
      icon: Package,
      current: location.pathname.startsWith(`/${tenantSlug}/admin/packages`),
      visible: features?.packages_enabled ?? true,
    },
    {
      name: t('navigation.offers'),
      href: `/${tenantSlug}/admin/offers`,
      icon: Gift,
      current: location.pathname.startsWith(`/${tenantSlug}/admin/offers`),
      visible: true,
    },
    {
      name: t('navigation.bookings'),
      href: `/${tenantSlug}/admin/bookings`,
      icon: Calendar,
      current: location.pathname.startsWith(`/${tenantSlug}/admin/bookings`),
      visible: true,
    },
    {
      name: t('navigation.employees'),
      href: `/${tenantSlug}/admin/employees`,
      icon: Users,
      current: location.pathname.startsWith(`/${tenantSlug}/admin/employees`),
      visible: (features?.employees_enabled ?? true) && userProfile?.role === 'tenant_admin',
    },
    {
      name: t('navigation.landingPage'),
      href: `/${tenantSlug}/admin/landing`,
      icon: Globe,
      current: location.pathname.startsWith(`/${tenantSlug}/admin/landing`),
      visible: features?.landing_page_enabled ?? true,
    },
    {
      name: t('navigation.settings'),
      href: `/${tenantSlug}/admin/settings`,
      icon: Settings,
      current: location.pathname.startsWith(`/${tenantSlug}/admin/settings`),
      visible: true,
    },
  ];

  const navigation = baseNavigation.filter((item) => item.visible);

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-30">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-blue-600" />
            <h1 className="text-lg font-bold text-gray-900">
              {tenant?.name || 'Bookati'}
            </h1>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className="flex h-screen pt-16 lg:pt-0">
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 bg-white border-r border-gray-200 flex flex-col
          transform transition-transform duration-300 ease-in-out
          lg:transform-none
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <div className="hidden lg:block p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {tenant?.name || 'Bookati'}
                </h1>
                <p className="text-xs text-gray-500">{userProfile?.full_name}</p>
              </div>
            </div>
          </div>

          {/* Mobile Header in Sidebar */}
          <div className="lg:hidden p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="w-8 h-8 text-blue-600" />
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    {tenant?.name || 'Bookati'}
                  </h1>
                  <p className="text-xs text-gray-500">{userProfile?.full_name}</p>
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    item.current
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
            
            {/* Preview Mode Section */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {t('navigation.previewMode') || 'Preview Mode'}
              </p>
              <Link
                to={`/${tenantSlug}/book`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-50"
              >
                <Eye className="w-5 h-5" />
                <span>{t('navigation.viewBookingPage') || 'View Booking Page'}</span>
                <ExternalLink className="w-4 h-4 ml-auto" />
              </Link>
              <Link
                to={`/${tenantSlug}/customer`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-50"
              >
                <Eye className="w-5 h-5" />
                <span>{t('navigation.viewCustomerPage') || 'View Customer Page'}</span>
                <ExternalLink className="w-4 h-4 ml-auto" />
              </Link>
            </div>
          </nav>

          <div className="p-4 border-t border-gray-200 space-y-3">
            <div className="flex justify-center">
              <LanguageToggle />
            </div>
            <Button
              variant="secondary"
              fullWidth
              onClick={handleLogout}
              icon={<LogOut className="w-4 h-4" />}
            >
              Logout
            </Button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
