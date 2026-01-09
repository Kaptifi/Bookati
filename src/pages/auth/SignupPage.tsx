import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../../lib/db';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { Calendar } from 'lucide-react';

export function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessNameAr, setBusinessNameAr] = useState('');
  const [industry, setIndustry] = useState('restaurant');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // CRITICAL: Ensure we're not authenticated before creating tenant
      // This ensures we use the anon role, not authenticated role
      const { data: { session } } = await db.auth.getSession();
      if (session) {
        console.log('Found existing session, signing out first');
        await db.auth.signOut();
      }

      // Step 1: Create the tenant FIRST (using anonymous access)
      const subscriptionEnd = new Date();
      subscriptionEnd.setDate(subscriptionEnd.getDate() + 30);

      // Generate a slug from the business name
      const slug = businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);

      const { data: tenant, error: tenantError } = await db
        .from('tenants')
        .insert({
          name: businessName,
          name_ar: businessNameAr || businessName,
          slug,
          industry,
          contact_email: email,
          contact_phone: phone,
          subscription_end: subscriptionEnd.toISOString(),
          is_active: true,
          public_page_enabled: true,
        })
        .select()
        .single();

      if (tenantError) {
        console.error('Tenant creation error:', tenantError);
        console.error('Full error details:', JSON.stringify(tenantError, null, 2));
        setError(`Failed to set up business: ${tenantError.message || tenantError.hint || 'Unknown error'}`);
        setLoading(false);
        return;
      }

      console.log('Tenant created successfully:', tenant);

      // Step 2: Create auth user with tenant_id already set
      // The backend signup endpoint creates the user in the users table, so we don't need a separate insert
      const { data: authData, error: authError } = await db.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: fullName,
            role: 'tenant_admin',
            tenant_id: tenant.id,
            phone: phone, // Include phone in signup
          },
        },
      });

      if (authError) {
        // If auth creation fails, delete the tenant
        await db.from('tenants').delete().eq('id', tenant.id);
        setError(authError.message || 'Failed to create account');
        setLoading(false);
        return;
      }

      // Step 3: User profile is already created by the backend signup endpoint
      // If we need to update additional fields, we can do it here
      if (authData.user) {
        // User is already created with all fields, no need for separate insert
        console.log('User created successfully:', authData.user);
      }

      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Calendar className="w-10 h-10 text-blue-600" />
            <span className="text-3xl font-bold text-gray-900">Bookati</span>
          </div>
          <div className="flex justify-center">
            <LanguageToggle />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Start Your Free Trial</CardTitle>
            <p className="text-sm text-gray-600 text-center mt-2">
              Sign up to create your booking management system
            </p>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-center">
                <p className="font-medium">Account created successfully!</p>
                <p className="text-sm mt-1">Redirecting to login...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <Input
                  type="text"
                  label="Business Name (English)"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  placeholder="e.g., Premium Salon"
                />

                <Input
                  type="text"
                  label="Business Name (Arabic)"
                  value={businessNameAr}
                  onChange={(e) => setBusinessNameAr(e.target.value)}
                  required
                  dir="rtl"
                  placeholder="مثال: صالون بريميوم"
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Industry <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="restaurant">Restaurant</option>
                    <option value="salon">Salon & Beauty</option>
                    <option value="clinic">Medical Clinic</option>
                    <option value="parking">Parking</option>
                    <option value="venue">Event Venue</option>
                    <option value="touristic_venue">Touristic Venue</option>
                    <option value="work_space">Work Space</option>
                    <option value="technical_services">Technical Services</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <Input
                  type="text"
                  label="Your Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="John Doe"
                />

                <Input
                  type="email"
                  label="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="your@email.com"
                />

                <PhoneInput
                  label="Phone Number"
                  value={phone}
                  onChange={(value) => setPhone(value)}
                  defaultCountry="+966"
                  required
                />

                <Input
                  type="password"
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  helperText="Minimum 6 characters"
                />

                <Button type="submit" fullWidth loading={loading}>
                  Start Free Trial
                </Button>

                <div className="text-center text-sm text-gray-600">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Sign In
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
