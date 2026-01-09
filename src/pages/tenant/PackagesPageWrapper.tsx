import React from 'react';
import { PackagesPage } from './PackagesPage';
import { TenantLayout } from '../../components/layout/TenantLayout';
import { ErrorBoundary } from '../../components/ErrorBoundary';

export function PackagesPageWrapper() {
  return (
    <TenantLayout>
      <ErrorBoundary>
        <PackagesPage />
      </ErrorBoundary>
    </TenantLayout>
  );
}
