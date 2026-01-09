import React from 'react';
import { useParams } from 'react-router-dom';
import { TenantLayout } from '../../components/layout/TenantLayout';
import { SettingsPage } from './SettingsPage';

export function SettingsPageWrapper() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  return (
    <TenantLayout tenantSlug={tenantSlug || ''}>
      <SettingsPage />
    </TenantLayout>
  );
}
