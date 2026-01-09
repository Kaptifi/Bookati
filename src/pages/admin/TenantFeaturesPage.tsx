import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Save, AlertCircle, Check, ArrowLeft } from 'lucide-react';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

interface TenantFeatures {
  id: string;
  tenant_id: string;
  employees_enabled: boolean;
  employee_assignment_mode: 'automatic' | 'manual' | 'both';
  packages_enabled: boolean;
  landing_page_enabled: boolean;
}

interface Tenant {
  id: string;
  name: string;
  name_ar: string | null;
}

export function TenantFeaturesPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [features, setFeatures] = useState<TenantFeatures | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadTenants();
  }, []);

  useEffect(() => {
    if (selectedTenantId) {
      loadFeatures(selectedTenantId);
    }
  }, [selectedTenantId]);

  const getClient = () => {
    // Use regular client (solution owner uses regular auth)
    return db;
  };

  const loadTenants = async () => {
    try {
      const client = getClient();
      const { data, error } = await client
        .from('tenants')
        .select('id, name, name_ar')
        .order('name');

      if (error) throw error;
      setTenants(data || []);

      if (data && data.length > 0 && !selectedTenantId) {
        setSelectedTenantId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading tenants:', error);
      setMessage({ type: 'error', text: 'Failed to load tenants' });
    }
  };

  const loadFeatures = async (tenantId: string) => {
    setLoading(true);
    try {
      const client = getClient();
      const { data, error } = await client
        .from('tenant_features')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;
      setFeatures(data);
    } catch (error) {
      console.error('Error loading features:', error);
      setMessage({ type: 'error', text: 'Failed to load tenant features' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!features || !selectedTenantId) return;

    setSaving(true);
    setMessage(null);

    try {
      const client = getClient();
      const { error } = await client
        .from('tenant_features')
        .update({
          employees_enabled: features.employees_enabled,
          employee_assignment_mode: features.employee_assignment_mode,
          packages_enabled: features.packages_enabled,
          landing_page_enabled: features.landing_page_enabled,
        })
        .eq('tenant_id', selectedTenantId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Features updated successfully' });

      setTimeout(() => {
        setMessage(null);
      }, 3000);
    } catch (error) {
      console.error('Error saving features:', error);
      setMessage({ type: 'error', text: 'Failed to save features' });
    } finally {
      setSaving(false);
    }
  };

  const handleFeatureChange = (field: keyof TenantFeatures, value: any) => {
    if (!features) return;

    const updatedFeatures = { ...features, [field]: value };

    // If employees are disabled, force employee_assignment_mode to 'automatic'
    if (field === 'employees_enabled' && !value) {
      updatedFeatures.employee_assignment_mode = 'automatic';
    }

    setFeatures(updatedFeatures);
  };

  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/solution-admin')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <Settings className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Tenant Features Management</h1>
          </div>
          <p className="text-gray-600">
            Enable or disable features for individual tenants
          </p>
        </div>

        {/* Tenant Selection */}
        <Card className="mb-6">
          <div className="p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Tenant
            </label>
            <select
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} {tenant.name_ar ? `(${tenant.name_ar})` : ''}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.type === 'success' ? (
              <Check className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Features Configuration */}
        {loading ? (
          <Card>
            <div className="p-8 text-center text-gray-600">
              Loading features...
            </div>
          </Card>
        ) : features ? (
          <div className="space-y-6">
            <Card>
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">
                  Feature Settings for {selectedTenant?.name}
                </h2>

                <div className="space-y-6">
                  {/* Employees Module */}
                  <div className="border-b border-gray-200 pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          Employees Module
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Enable or disable the entire employees module. When disabled, employee-based capacity
                          and employee performance analytics will be hidden from the dashboard.
                        </p>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={features.employees_enabled}
                            onChange={(e) => handleFeatureChange('employees_enabled', e.target.checked)}
                            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">
                            Enable Employees Module
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Employee Assignment Mode */}
                  <div className="border-b border-gray-200 pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          Employee Assignment Mode
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Control how employees are assigned to bookings. This setting is only available
                          when the Employees Module is enabled.
                        </p>
                        <div className="space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="radio"
                              name="assignment_mode"
                              value="automatic"
                              checked={features.employee_assignment_mode === 'automatic'}
                              onChange={(e) => handleFeatureChange('employee_assignment_mode', 'automatic')}
                              disabled={!features.employees_enabled}
                              className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <div>
                              <span className="text-sm font-medium text-gray-700">Automatic Only</span>
                              <p className="text-xs text-gray-500">System automatically assigns employees</p>
                            </div>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="radio"
                              name="assignment_mode"
                              value="manual"
                              checked={features.employee_assignment_mode === 'manual'}
                              onChange={(e) => handleFeatureChange('employee_assignment_mode', 'manual')}
                              disabled={!features.employees_enabled}
                              className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <div>
                              <span className="text-sm font-medium text-gray-700">Manual Only</span>
                              <p className="text-xs text-gray-500">Receptionist must manually select employees</p>
                            </div>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="radio"
                              name="assignment_mode"
                              value="both"
                              checked={features.employee_assignment_mode === 'both'}
                              onChange={(e) => handleFeatureChange('employee_assignment_mode', 'both')}
                              disabled={!features.employees_enabled}
                              className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <div>
                              <span className="text-sm font-medium text-gray-700">Both (Automatic & Manual)</span>
                              <p className="text-xs text-gray-500">Receptionist can choose either mode</p>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Packages Module */}
                  <div className="border-b border-gray-200 pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          Service Packages Module
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Enable or disable the service packages and subscriptions feature. When disabled,
                          the packages menu item and functionality will be hidden.
                        </p>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={features.packages_enabled}
                            onChange={(e) => handleFeatureChange('packages_enabled', e.target.checked)}
                            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">
                            Enable Service Packages
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Landing Page */}
                  <div className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          Customer Landing Page
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Enable or disable the public customer landing page for this tenant. When disabled,
                          customers will not be able to access the public booking page.
                        </p>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={features.landing_page_enabled}
                            onChange={(e) => handleFeatureChange('landing_page_enabled', e.target.checked)}
                            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">
                            Enable Customer Landing Page
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="mt-8 flex justify-end">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </Card>

            {/* Impact Warning */}
            <Card className="bg-yellow-50 border-yellow-200">
              <div className="p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-yellow-900 mb-2">Important Notes</h4>
                    <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                      <li>Changes take effect immediately for the tenant</li>
                      <li>Disabling Employees will also disable employee-based capacity calculations</li>
                      <li>Employee analytics will be hidden from the dashboard when Employees are disabled</li>
                      <li>Disabling the Landing Page will prevent public customer bookings</li>
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <Card>
            <div className="p-8 text-center text-gray-600">
              No features configuration found for this tenant.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
