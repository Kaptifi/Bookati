import React from 'react';
import { useParams } from 'react-router-dom';
import { TenantLayout } from '../../components/layout/TenantLayout';
import { BookingsPage } from './BookingsPage';

export function BookingsPageWrapper() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  return (
    <TenantLayout tenantSlug={tenantSlug || ''}>
      <BookingsPage />
    </TenantLayout>
  );
}
