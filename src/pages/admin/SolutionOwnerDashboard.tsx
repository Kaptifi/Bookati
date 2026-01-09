import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { Building2, Users, Calendar, LogOut, Plus, Settings } from 'lucide-react';
import { Tenant } from '../../types';

export function SolutionOwnerDashboard() {
  const { userProfile, signOut, hasRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const [newTenant, setNewTenant] = useState({
    name: '',
    name_ar: '',
    industry: 'restaurant',
    contact_email: '',
    contact_phone: '',
    address: '',
    admin_password: '',
  });

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      return;
    }

    // Check if user is authenticated as solution owner
    if (!userProfile) {
      // Check session in localStorage before redirecting
      const sessionStr = localStorage.getItem('auth_session');
      const token = localStorage.getItem('auth_token');
      
      if (sessionStr || token) {
        // Session exists, wait a bit for profile to load
        const timeout = setTimeout(() => {
          if (!userProfile) {
            console.log('[SolutionOwnerDashboard] No profile after wait, redirecting to login');
            navigate('/login');
          }
        }, 2000);
        return () => clearTimeout(timeout);
      } else {
        // No session, redirect immediately
        navigate('/login');
        return;
      }
    }

    // Check role after profile is loaded
    if (userProfile.role !== 'solution_owner') {
      console.log('[SolutionOwnerDashboard] User is not solution_owner, redirecting to login', {
        role: userProfile.role
      });
      navigate('/login');
      return;
    }

    // User is solution_owner, fetch tenants
    fetchTenants();
  }, [authLoading, userProfile, hasRole, navigate]);

  async function fetchTenants() {
    try {
      // Use regular client (solution owner uses regular auth)
      const client = db;

      const { data, error } = await client
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('Fetched tenants:', data);
      console.log('Error:', error);

      if (error) throw error;
      setTenants(data || []);
    } catch (err) {
      console.error('Error fetching tenants:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTenant(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      const subscriptionEnd = new Date();
      subscriptionEnd.setDate(subscriptionEnd.getDate() + 30);

      // Use regular client (solution owner uses regular auth)
      const client = db;

      // Step 1: Create the tenant
      const { data: tenantData, error: tenantError } = await client
        .from('tenants')
        .insert({
          name: newTenant.name,
          name_ar: newTenant.name_ar,
          industry: newTenant.industry,
          contact_email: newTenant.contact_email,
          contact_phone: newTenant.contact_phone,
          address: newTenant.address,
          subscription_end: subscriptionEnd.toISOString(),
          is_active: true,
          public_page_enabled: true,
        })
        .select()
        .single();

      if (tenantError) throw tenantError;

      // Step 2: Create Supabase auth account for tenant admin
      const { data: authData, error: authError } = await db.auth.signUp({
        email: newTenant.contact_email,
        password: newTenant.admin_password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: `${newTenant.name} Admin`,
            role: 'tenant_admin',
            tenant_id: tenantData.id,
          },
        },
      });

      if (authError) {
        // If auth creation fails, we should delete the tenant
        await client.from('tenants').delete().eq('id', tenantData.id);
        throw new Error(`Failed to create admin account: ${authError.message}`);
      }

      // Step 3: Create user profile in users table
      if (authData.user) {
        const { error: profileError } = await client
          .from('users')
          .insert({
            id: authData.user.id,
            tenant_id: tenantData.id,
            email: newTenant.contact_email,
            phone: newTenant.contact_phone,
            full_name: `${newTenant.name} Admin`,
            role: 'tenant_admin',
            is_active: true,
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);
          // Continue anyway - the tenant is created
        }
      }

      setTenants([tenantData, ...tenants]);
      setShowCreateModal(false);
      setNewTenant({
        name: '',
        name_ar: '',
        industry: 'restaurant',
        contact_email: '',
        contact_phone: '',
        address: '',
        admin_password: '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create tenant');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(tenant: Tenant) {
    try {
      // Use regular client (solution owner uses regular auth)
      const client = db;

      const { error } = await client
        .from('tenants')
        .update({ is_active: !tenant.is_active })
        .eq('id', tenant.id);

      if (error) throw error;
      fetchTenants();
    } catch (err) {
      console.error('Error toggling tenant:', err);
    }
  }

  async function handleLogout() {
    // Sign out and redirect to login
    await signOut();
    navigate('/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Calendar className="w-8 h-8 text-blue-600" />
                <span className="text-2xl font-bold text-gray-900">Bookati</span>
              </Link>
              <span className="text-sm text-gray-500 border-l pl-4">{t('admin.solutionOwnerConsole')}</span>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/management/features')}
              >
                <Settings className="w-4 h-4 mr-2" />
                Tenant Features
              </Button>
              <span className="text-sm text-gray-600">
                {userProfile?.full_name || 'Solution Owner'}
              </span>
              <LanguageToggle />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                {t('auth.logout')}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('admin.totalTenants')}</p>
                  <p className="text-2xl font-bold text-gray-900">{tenants.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Users className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('admin.activeTenants')}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {tenants.filter((t) => t.is_active).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Calendar className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('admin.inactiveTenants')}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {tenants.filter((t) => !t.is_active).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tenants List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('admin.tenants')}</CardTitle>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('admin.createTenant')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {tenants.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">{t('admin.noTenantsYet')}</p>
                <Button onClick={() => setShowCreateModal(true)}>
                  {t('admin.createFirstTenant')}
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('admin.tenantName')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('tenant.industry')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('admin.contact')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('admin.status')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('admin.subscription')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('admin.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tenants.map((tenant) => (
                      <tr key={tenant.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          <div>{i18n.language === 'ar' && tenant.name_ar ? tenant.name_ar : tenant.name}</div>
                          {tenant.name_ar && <div className="text-xs text-gray-500">{i18n.language === 'ar' ? tenant.name : tenant.name_ar}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                          {t(`admin.industries.${tenant.industry}`)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {tenant.contact_email || tenant.contact_phone || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              tenant.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {tenant.is_active ? t('tenant.active') : t('tenant.inactive')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {tenant.subscription_end
                            ? new Date(tenant.subscription_end).toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : 'en-US')
                            : t('admin.noExpiry')}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleActive(tenant)}
                          >
                            {tenant.is_active ? t('admin.deactivate') : t('admin.activate')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Create Tenant Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('admin.createNewTenant')}
        size="lg"
      >
        <form onSubmit={handleCreateTenant} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Input
            label={t('admin.tenantName')}
            value={newTenant.name}
            onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
            required
            placeholder="e.g., Premium Salon"
          />

          <Input
            label={t('admin.tenantNameArabic')}
            value={newTenant.name_ar}
            onChange={(e) => setNewTenant({ ...newTenant, name_ar: e.target.value })}
            required
            placeholder="على سبيل المثال، صالون بريميوم"
            dir="rtl"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('tenant.industry')} <span className="text-red-500">*</span>
            </label>
            <select
              value={newTenant.industry}
              onChange={(e) => setNewTenant({ ...newTenant, industry: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="restaurant">{t('admin.industries.restaurant')}</option>
              <option value="salon">{t('admin.industries.salon')}</option>
              <option value="clinic">{t('admin.industries.clinic')}</option>
              <option value="parking">{t('admin.industries.parking')}</option>
              <option value="venue">{t('admin.industries.venue')}</option>
              <option value="other">{t('admin.industries.other')}</option>
            </select>
          </div>

          <Input
            type="email"
            label={t('tenant.contactEmail')}
            value={newTenant.contact_email}
            onChange={(e) => setNewTenant({ ...newTenant, contact_email: e.target.value })}
            placeholder="contact@tenant.com"
            required
          />

          <Input
            type="password"
            label={t('admin.adminPassword')}
            value={newTenant.admin_password}
            onChange={(e) => setNewTenant({ ...newTenant, admin_password: e.target.value })}
            placeholder={t('admin.adminPasswordPlaceholder')}
            required
          />

          <Input
            type="tel"
            label={t('tenant.contactPhone')}
            value={newTenant.contact_phone}
            onChange={(e) => setNewTenant({ ...newTenant, contact_phone: e.target.value })}
            placeholder="+966501234567"
          />

          <Input
            label={t('tenant.address')}
            value={newTenant.address}
            onChange={(e) => setNewTenant({ ...newTenant, address: e.target.value })}
            placeholder="123 Main St, Riyadh"
          />

          <div className="flex gap-3 pt-4">
            <Button type="submit" fullWidth loading={creating}>
              {t('admin.createTenant')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setShowCreateModal(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
