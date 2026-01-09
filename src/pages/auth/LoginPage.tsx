import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { Calendar, Eye, EyeOff, LogIn, Mail, Lock, Rocket } from 'lucide-react';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    let loginEmail = email;
    if (!email.includes('@')) {
      loginEmail = `${email}@bookati.local`;
    }

    // Pass forCustomer: false to block customers from admin/service provider/employee login
    const { error: signInError, userProfile, tenant } = await signIn(loginEmail, password, false);

    if (signInError) {
      console.error('Sign in error:', signInError);
      
      // Show user-friendly error message
      let errorMessage = signInError.message || t('auth.invalidCredentials');
      
      // If it's a server connection error, preserve the helpful message with newlines
      // Don't replace newlines - they'll be displayed properly in the error div
      if (errorMessage.includes('Backend server is not running') || 
          errorMessage.includes('Cannot connect to server') ||
          errorMessage.includes('ERR_CONNECTION_REFUSED') ||
          errorMessage.includes('Failed to fetch')) {
        // Keep the message as is - it has helpful instructions
      }
      
      setError(errorMessage);
      setLoading(false);
      return;
    }

    if (!userProfile) {
      console.error('No user profile returned');
      setError(t('auth.invalidCredentials'));
      setLoading(false);
      return;
    }

    console.log('Login successful:', { userProfile, tenant });

    // SECURITY: Block customers from logging in on this page
    // This page is for admin, service provider, and employees only
    // Customers should use the customer-specific login page
    if (userProfile.role === 'customer') {
      console.warn('[LoginPage] Security: Customer attempted to login through admin/employee login page', { email: loginEmail, userId: userProfile.id });
      setError('Access denied: This login page is for administrators, service providers, and employees only. Customers must use the customer login page.');
      setLoading(false);
      // Clear any session data that might have been set
      try {
        await db.auth.signOut();
      } catch (err) {
        console.error('Error signing out customer:', err);
      }
      return;
    }

    // Handle solution owner (no tenant needed)
    if (userProfile.role === 'solution_owner') {
      navigate('/solution-admin');
      return;
    }

    // Handle tenant-based roles (tenant_admin, receptionist, cashier, etc.)
    if (tenant && tenant.slug) {
      if (userProfile.role === 'tenant_admin') {
        navigate(`/${tenant.slug}/admin`);
      } else if (userProfile.role === 'receptionist' || userProfile.role === 'cashier') {
        navigate(`/${tenant.slug}/reception`);
      } else {
        navigate(`/${tenant.slug}/admin`);
      }
      return;
    }

    // If tenant is missing but user has tenant_id, try to fetch it
    if (userProfile.tenant_id && !tenant) {
      try {
        const { data: tenantData, error: tenantError } = await db
          .from('tenants')
          .select('*')
          .eq('id', userProfile.tenant_id)
          .maybeSingle();

        if (tenantError) {
          console.error('Error fetching tenant:', tenantError);
        } else if (tenantData && tenantData.slug) {
          if (userProfile.role === 'tenant_admin') {
            navigate(`/${tenantData.slug}/admin`);
          } else if (userProfile.role === 'receptionist' || userProfile.role === 'cashier') {
            navigate(`/${tenantData.slug}/reception`);
          } else {
            navigate(`/${tenantData.slug}/admin`);
          }
          return;
        }
      } catch (err) {
        console.error('Exception fetching tenant:', err);
      }
    }

    // Error cases
    if (userProfile.role === 'tenant_admin' && !userProfile.tenant_id) {
      setError(t('auth.accountSetupIncomplete') || 'Account setup incomplete. Please contact support.');
      setLoading(false);
      return;
    }

    // Fallback error
    console.error('Unable to determine redirect path:', { userProfile, tenant });
    setError(t('auth.accountConfigError') || 'Account configuration error. Please contact support.');
    setLoading(false);
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
            <div className="flex items-center justify-center gap-2">
              <LogIn className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-center">Sign In</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm whitespace-pre-line">
                  {error}
                </div>
              )}

              <div className="relative">
                <Mail className="absolute left-3 top-[38px] w-5 h-5 text-gray-400" />
                <Input
                  type="text"
                  label="Email or Username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Enter email or username"
                  autoComplete="email"
                  className="pl-10"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-[38px] w-5 h-5 text-gray-400" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[38px] text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700 transition-colors z-10"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {t('auth.forgotPassword')}
                </button>
              </div>

              <Button type="submit" fullWidth loading={loading}>
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </Button>

              <div className="text-center text-sm text-gray-600">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/signup')}
                  className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                >
                  <Rocket className="w-4 h-4" />
                  Start Free Trial
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
