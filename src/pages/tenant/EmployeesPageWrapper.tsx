import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { TenantLayout } from '../../components/layout/TenantLayout';
import { EmployeesPage } from './EmployeesPage';

export function EmployeesPageWrapper() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Only tenant_admin can access employees page
    if (!authLoading && userProfile) {
      if (userProfile.role !== 'tenant_admin') {
        // Redirect cashier/receptionist to reception page
        if (userProfile.role === 'cashier' || userProfile.role === 'receptionist') {
          navigate(`/${tenantSlug}/reception`);
        } else {
          // Other roles go to admin dashboard
          navigate(`/${tenantSlug}/admin`);
        }
      }
    }
  }, [userProfile, authLoading, tenantSlug, navigate]);

  // Don't render if user is not tenant_admin
  if (!authLoading && userProfile && userProfile.role !== 'tenant_admin') {
    return null;
  }

  return (
    <TenantLayout tenantSlug={tenantSlug || ''}>
      <EmployeesPage />
    </TenantLayout>
  );
}

