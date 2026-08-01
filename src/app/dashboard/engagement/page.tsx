'use client';

import StudentActivityTrackerPanel from '@/components/audit/StudentActivityTrackerPanel';
import { MOBILE_PAGE_ROOT } from '@/components/mobile/mobile-styles';

export default function EngagementPage() {
  return (
    <div className={MOBILE_PAGE_ROOT}>
      <StudentActivityTrackerPanel />
    </div>
  );
}
