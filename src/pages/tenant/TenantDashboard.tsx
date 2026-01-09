import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { TenantLayout } from '../../components/layout/TenantLayout';
import { TenantDashboardContent } from './TenantDashboardContent';

export function TenantDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { userProfile, tenant: authTenant, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tenantSlugResolved, setTenantSlugResolved] = useState<string>('');
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCheckedSessionRef = useRef(false);

  useEffect(() => {
    console.log('[TenantDashboard] useEffect triggered', {
      authLoading,
      hasUserProfile: !!userProfile,
      userProfileId: userProfile?.id,
      tenantSlug,
      pathname: window.location.pathname,
    });

    // Clear any pending redirect timeout
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }

    // Wait for auth to finish loading before checking
    if (authLoading) {
      console.log('[TenantDashboard] Auth still loading, waiting...');
      return;
    }

    // Only redirect if auth is done loading and userProfile is still null
    // Check session from localStorage first to avoid false redirects
    if (!userProfile) {
      console.log('[TenantDashboard] No userProfile, checking session...');
      
      // Check if session exists in localStorage before redirecting
      const sessionStr = localStorage.getItem('auth_session');
      const token = localStorage.getItem('auth_token');
      
      if (sessionStr || token) {
        // Session exists, don't redirect immediately
        // The AuthContext should load the profile soon
        console.log('[TenantDashboard] Session exists, waiting for AuthContext to load profile...');
        
        // Set a longer timeout before redirecting as last resort
        // Increased to 5 seconds to give more time for profile to load
        if (!hasCheckedSessionRef.current) {
          hasCheckedSessionRef.current = true;
          redirectTimeoutRef.current = setTimeout(() => {
            // Final check after delay
            const stillNoSession = !localStorage.getItem('auth_session') && !localStorage.getItem('auth_token');
            const stillNoProfile = !userProfile;
            
            if (stillNoSession && stillNoProfile) {
              // Only redirect if both session and profile are missing
              console.log('[TenantDashboard] Session and profile missing after wait, redirecting');
              navigate('/login');
            } else {
              console.log('[TenantDashboard] Session or profile exists after wait, staying on page', {
                hasSession: !stillNoSession,
                hasProfile: !stillNoProfile,
              });
              // Session or profile exists, don't redirect
            }
            hasCheckedSessionRef.current = false;
          }, 5000); // Wait 5 seconds before final check (increased from 2)
        }
        return;
      } else {
        // No session at all, but add a small delay to prevent race conditions
        console.log('[TenantDashboard] No session found, scheduling redirect check...');
        redirectTimeoutRef.current = setTimeout(() => {
          // Double-check before redirecting
          const finalCheck = !localStorage.getItem('auth_session') && !localStorage.getItem('auth_token') && !userProfile;
          if (finalCheck) {
            console.log('[TenantDashboard] Confirmed no session, redirecting to login');
            navigate('/login');
          } else {
            console.log('[TenantDashboard] Session or profile appeared, staying on page');
          }
        }, 500); // Small delay to prevent race conditions
        return;
      }
    } else {
      // UserProfile exists, clear any pending redirect and reset check flag
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      hasCheckedSessionRef.current = false;
    }

    console.log('[TenantDashboard] UserProfile exists', {
      userId: userProfile.id,
      role: userProfile.role,
    });

    // Redirect cashier and receptionist to reception page (not admin dashboard)
    if (userProfile.role === 'cashier' || userProfile.role === 'receptionist') {
      console.log('[TenantDashboard] Cashier/Receptionist detected, redirecting to reception page', {
        role: userProfile.role,
      });
      if (tenantSlug) {
        navigate(`/${tenantSlug}/reception`);
      } else if (authTenant?.slug) {
        navigate(`/${authTenant.slug}/reception`);
      } else {
        // Try to fetch tenant slug
        validateTenantAccess().then(() => {
          if (tenantSlugResolved) {
            navigate(`/${tenantSlugResolved}/reception`);
          }
        });
      }
      return;
    }

    // Only tenant_admin can access admin dashboard
    if (userProfile.role !== 'tenant_admin') {
      console.log('[TenantDashboard] Wrong role, redirecting to home', {
        role: userProfile.role,
      });
      navigate('/');
      return;
    }

    console.log('[TenantDashboard] Validating tenant access...');
    validateTenantAccess();
    
    // Cleanup on unmount
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      hasCheckedSessionRef.current = false;
    };
  }, [userProfile, authLoading, navigate, tenantSlug]);

  async function validateTenantAccess() {
    if (!userProfile?.tenant_id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await db
        .from('tenants')
        .select('slug')
        .eq('id', userProfile.tenant_id)
        .single();

      if (error) {
        console.error('[TenantDashboard] Error validating tenant:', error);
        // Don't redirect on error - might be temporary network issue
        // Use tenant from auth context if available
        if (authTenant?.slug) {
          setTenantSlugResolved(authTenant.slug);
        }
        setLoading(false);
        return;
      }

      if (tenantSlug && tenantSlug !== data.slug) {
        // Tenant slug mismatch - redirect to correct tenant
        console.log('[TenantDashboard] Tenant slug mismatch, redirecting to correct tenant');
        navigate(`/${data.slug}/admin`);
        return;
      }

      setTenantSlugResolved(data.slug);
    } catch (err) {
      console.error('[TenantDashboard] Exception validating tenant:', err);
      // Don't redirect on exception - use tenant from auth context
      if (authTenant?.slug) {
        setTenantSlugResolved(authTenant.slug);
      }
    } finally {
      setLoading(false);
    }
  }

  // Show loading if auth is still loading or tenant validation is in progress
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <TenantLayout tenantSlug={tenantSlugResolved}>
      <TenantDashboardContent />
    </TenantLayout>
  );
}
