import { useEffect, useState } from 'react';
import { db } from '../lib/db';

export interface TenantFeatures {
  employees_enabled: boolean;
  employee_assignment_mode: 'automatic' | 'manual' | 'both';
  packages_enabled: boolean;
  landing_page_enabled: boolean;
}

export function useTenantFeatures(tenantId: string | undefined) {
  const [features, setFeatures] = useState<TenantFeatures | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) {
      loadFeatures();
    }
  }, [tenantId]);

  const loadFeatures = async () => {
    if (!tenantId) return;

    try {
      const { data, error } = await db
        .from('tenant_features')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      // Default to all features enabled if no data
      setFeatures(data || {
        employees_enabled: true,
        employee_assignment_mode: 'both',
        packages_enabled: true,
        landing_page_enabled: true,
      });
    } catch (error) {
      console.error('Error loading tenant features:', error);
      // Default to all features enabled if there's an error
      setFeatures({
        employees_enabled: true,
        employee_assignment_mode: 'both',
        packages_enabled: true,
        landing_page_enabled: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return { features, loading };
}
