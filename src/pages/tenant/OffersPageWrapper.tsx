import { OffersPage } from './OffersPage';
import { TenantLayout } from '../../components/layout/TenantLayout';
import { useParams } from 'react-router-dom';

export function OffersPageWrapper() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  return (
    <TenantLayout tenantSlug={tenantSlug || ''}>
      <OffersPage />
    </TenantLayout>
  );
}




