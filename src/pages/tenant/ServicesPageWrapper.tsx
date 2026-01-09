import React from 'react';
import { useParams } from 'react-router-dom';
import { TenantLayout } from '../../components/layout/TenantLayout';
import { ServicesPage } from './ServicesPage';

export function ServicesPageWrapper() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  return (
    <TenantLayout tenantSlug={tenantSlug || ''}>
      <ServicesPage />
    </TenantLayout>
  );
}
