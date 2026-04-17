'use client';

import { useSystemStatus } from '@/hooks/useSystemStatus';
import MaintenanceBanner from '@/components/ui/MaintenanceBanner';
import ForceRefreshBanner from '@/components/ui/ForceRefreshBanner';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';

function semverLt(a: string, b: string): boolean {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 < b1;
  if (a2 !== b2) return a2 < b2;
  return a3 < b3;
}

export default function SystemStatusBanners() {
  const { maintenanceMode, minimumWebVersion, loading } = useSystemStatus();

  if (loading) return null;

  const needsRefresh = semverLt(APP_VERSION, minimumWebVersion);

  return (
    <>
      <MaintenanceBanner visible={maintenanceMode} />
      <ForceRefreshBanner visible={!maintenanceMode && needsRefresh} />
    </>
  );
}
