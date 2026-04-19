'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GenerateContentPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/curriculum?tab=generate'); }, []);
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
