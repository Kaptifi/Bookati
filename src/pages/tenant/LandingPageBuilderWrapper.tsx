import { useParams, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { TenantLayout } from '../../components/layout/TenantLayout';
import { LandingPageBuilder } from './LandingPageBuilder';

export function LandingPageBuilderWrapper() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Check session in localStorage before redirecting
  if (!userProfile) {
    const sessionStr = localStorage.getItem('auth_session');
    const token = localStorage.getItem('auth_token');
    
    if (sessionStr || token) {
      // Session exists, wait for profile to load
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      );
    }
    
    // No session, redirect to login
    return <Navigate to="/login" replace />;
  }

  if (userProfile.role !== 'tenant_admin') {
    return <Navigate to="/login" replace />;
  }

  return (
    <TenantLayout tenantSlug={tenantSlug || ''}>
      <LandingPageBuilder />
    </TenantLayout>
  );
}
