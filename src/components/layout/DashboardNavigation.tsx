'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
// Inline SVG icon components — avoids Turbopack HMR conflicts with heroicons
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}
function UserGroupIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
    </svg>
  );
}
function AcademicCapIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 3.741-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
    </svg>
  );
}
function BookOpenIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}
function ChartBarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}
function CogIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0 0 15 0m-15 0a7.5 7.5 0 1 1 15 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077 1.41-.513m14.095-5.13 1.41-.513M5.106 17.785l1.15-.964m11.49-9.642 1.149-.964M7.501 19.795l.75-1.3m7.5-12.99.75-1.3m-6.063 16.658.26-1.477m2.605-14.772.26-1.477m0 17.726-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205 12 12m6.894 5.785-1.149-.964M6.256 7.178l-1.15-.964m15.352 8.864-1.41-.513M4.954 9.435l-1.41-.514M12.002 12l-3.75 6.495" />
    </svg>
  );
}
function BuildingOfficeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}
function ClipboardDocumentListIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
    </svg>
  );
}
function PresentationChartLineIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
    </svg>
  );
}
function ClipboardDocumentCheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />
    </svg>
  );
}
function DocumentTextIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}
function DocumentChartBarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}
function UserIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}
function BellIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  );
}
function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  );
}
function ArrowRightOnRectangleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
    </svg>
  );
}
function Bars3Icon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}
function XMarkIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}
function SignalIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12Z" />
    </svg>
  );
}
function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-6.75c-.621 0-1.125.504-1.125 1.125V18.75m9 0h-9M12 7.5A3.75 3.75 0 0 0 8.25 3.75H5.625a3 3 0 0 0-3 3v.75c0 3.314 2.686 6 6 6h.75M12 7.5a3.75 3.75 0 0 1 3.75-3.75h2.625a3 3 0 0 1 3 3v.75c0 3.314-2.686 6-6 6h-.75M12 7.5v9" />
    </svg>
  );
}
function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}
function CodeBracketIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  );
}
function RocketLaunchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
  );
}
function CalendarDaysIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" />
    </svg>
  );
}
function BanknotesIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
    </svg>
  );
}
function VideoCameraIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}
function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
    </svg>
  );
}
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type NavItem    = { name: string; href: string; icon: any };
type NavDivider = { divider: true; label: string };
type NavEntry   = NavItem | NavDivider;

function isDivider(e: NavEntry): e is NavDivider {
  return 'divider' in e;
}

export default function DashboardNavigation() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMinimal = searchParams.get('minimal') === 'true';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (isMinimal) return null;

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  useEffect(() => {
    if (!profile) return;
    createClient()
      .from('messages').select('id', { count: 'exact', head: true })
      .eq('recipient_id', profile.id).eq('is_read', false)
      .then(({ count }) => setUnreadCount(count ?? 0));
  }, [profile?.id]); // eslint-disable-line

  if (!profile) return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[#0b0b18] border-b border-white/10 h-14 flex items-center justify-between px-4 sm:px-6">
      <span className="text-white/30 text-sm font-semibold">Rillcod Academy</span>
      <div className="flex items-center gap-3">
        <a href="/login"
          className="text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2">
          Sign In
        </a>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 text-xs font-bold rounded-xl border border-rose-600/20 transition-all">
          <ArrowRightOnRectangleIcon className="w-3.5 h-3.5" /> Sign Out
        </button>
      </div>
    </div>
  );

  // ── Nav entries per role ────────────────────────────────────────────────────
  const getNavEntries = (): NavEntry[] => {
    const base: NavItem[] = [{ name: 'Dashboard', href: '/dashboard', icon: HomeIcon }];

    switch (profile.role) {
      case 'admin':
        return [
          ...base,
          { divider: true, label: 'People' },
          { name: 'Schools',          href: '/dashboard/schools',          icon: BuildingOfficeIcon },
          { name: 'Teachers',         href: '/dashboard/teachers',         icon: AcademicCapIcon },
          { name: 'Students',         href: '/dashboard/students',         icon: UserGroupIcon },
          { name: 'Register Students',href: '/dashboard/students/bulk-register', icon: UserPlusIcon },
          { name: 'Enrol Students',   href: '/dashboard/students/bulk-enroll',   icon: AcademicCapIcon },
          { name: 'Wipe Students',    href: '/dashboard/students/bulk-delete',   icon: TrashIcon },
          { name: 'Users',            href: '/dashboard/users',            icon: ShieldCheckIcon },
          { name: 'Approvals',        href: '/dashboard/approvals',        icon: ClipboardDocumentCheckIcon },
          { divider: true, label: 'Academics' },
          { name: 'Programs',         href: '/dashboard/programs',         icon: AcademicCapIcon },
          { name: 'Courses',          href: '/dashboard/courses',          icon: BookOpenIcon },
          { name: 'Assignments',      href: '/dashboard/assignments',      icon: ClipboardDocumentListIcon },
          { name: 'Grades',           href: '/dashboard/grades',           icon: ClipboardDocumentCheckIcon },
          { name: 'CBT Exams',        href: '/dashboard/cbt',              icon: AcademicCapIcon },
          { name: 'Timetable',        href: '/dashboard/timetable',        icon: CalendarDaysIcon },
          { divider: true, label: 'Content' },
          { name: 'Library',          href: '/dashboard/library',          icon: BookOpenIcon },
          { name: 'Leaderboard',      href: '/dashboard/leaderboard',      icon: TrophyIcon },
          { name: 'Live Sessions',    href: '/dashboard/live-sessions',    icon: VideoCameraIcon },
          { divider: true, label: 'Reports' },
          { name: 'Report Builder',   href: '/dashboard/reports/builder',  icon: DocumentTextIcon },
          { name: 'Progress Reports', href: '/dashboard/results',          icon: DocumentChartBarIcon },
          { name: 'Analytics',        href: '/dashboard/analytics',        icon: ChartBarIcon },
          { divider: true, label: 'Finance' },
          { name: 'Payments',         href: '/dashboard/payments',         icon: BanknotesIcon },
          { divider: true, label: 'System' },
          { name: 'Messages',         href: '/dashboard/messages',         icon: EnvelopeIcon },
          { name: 'IoT Monitor',      href: '/dashboard/iot',              icon: SignalIcon },
          { name: 'Settings',         href: '/dashboard/settings',         icon: CogIcon },
        ];

      case 'teacher':
        return [
          ...base,
          { divider: true, label: 'Teaching' },
          { name: 'My Classes',       href: '/dashboard/classes',          icon: BookOpenIcon },
          { name: 'Lessons',          href: '/dashboard/lessons',          icon: PresentationChartLineIcon },
          { name: 'Assignments',      href: '/dashboard/assignments',      icon: ClipboardDocumentListIcon },
          { name: 'CBT Exams',        href: '/dashboard/cbt',              icon: AcademicCapIcon },
          { name: 'Attendance',       href: '/dashboard/attendance',       icon: ClipboardDocumentCheckIcon },
          { name: 'Timetable',        href: '/dashboard/timetable',        icon: CalendarDaysIcon },
          { divider: true, label: 'Students' },
          { name: 'Students',         href: '/dashboard/students',         icon: UserGroupIcon },
          { name: 'Register Students',href: '/dashboard/students/bulk-register', icon: UserPlusIcon },
          { name: 'Enrol Students',   href: '/dashboard/students/bulk-enroll',   icon: AcademicCapIcon },
          { name: 'Grades',           href: '/dashboard/grades',           icon: ClipboardDocumentCheckIcon },
          { divider: true, label: 'Reports' },
          { name: 'Report Builder',   href: '/dashboard/reports/builder',  icon: DocumentTextIcon },
          { name: 'Progress Reports', href: '/dashboard/results',          icon: DocumentChartBarIcon },
          { divider: true, label: 'Content' },
          { name: 'Library',          href: '/dashboard/library',          icon: BookOpenIcon },
          { name: 'Code Playground',  href: '/dashboard/playground',       icon: CodeBracketIcon },
          { name: 'Leaderboard',      href: '/dashboard/leaderboard',      icon: TrophyIcon },
          { divider: true, label: 'More' },
          { name: 'Live Sessions',    href: '/dashboard/live-sessions',    icon: VideoCameraIcon },
          { name: 'Messages',         href: '/dashboard/messages',         icon: EnvelopeIcon },
          { name: 'Settings',         href: '/dashboard/settings',         icon: CogIcon },
        ];

      case 'student':
        return [
          ...base,
          { divider: true, label: 'Learn' },
          { name: 'My Courses',       href: '/dashboard/courses',          icon: BookOpenIcon },
          { name: 'Learning Centre',  href: '/dashboard/learning',         icon: AcademicCapIcon },
          { name: 'Assignments',      href: '/dashboard/assignments',      icon: ClipboardDocumentListIcon },
          { name: 'CBT Exams',        href: '/dashboard/cbt',              icon: AcademicCapIcon },
          { name: 'Library',          href: '/dashboard/library',          icon: BookOpenIcon },
          { divider: true, label: 'Activities' },
          { name: 'Code Playground',  href: '/dashboard/playground',       icon: CodeBracketIcon },
          { name: 'Live Sessions',    href: '/dashboard/live-sessions',    icon: VideoCameraIcon },
          { name: 'My Portfolio',     href: '/dashboard/portfolio',        icon: RocketLaunchIcon },
          { name: 'Leaderboard',      href: '/dashboard/leaderboard',      icon: TrophyIcon },
          { divider: true, label: 'Schedule' },
          { name: 'Timetable',        href: '/dashboard/timetable',        icon: CalendarDaysIcon },
          { name: 'Attendance',       href: '/dashboard/attendance',       icon: ClipboardDocumentCheckIcon },
          { divider: true, label: 'My Progress' },
          { name: 'Grades',           href: '/dashboard/grades',           icon: ClipboardDocumentCheckIcon },
          { name: 'My Report Card',   href: '/dashboard/results',          icon: DocumentChartBarIcon },
          { divider: true, label: 'More' },
          { name: 'Messages',         href: '/dashboard/messages',         icon: EnvelopeIcon },
          { name: 'Settings',         href: '/dashboard/settings',         icon: CogIcon },
        ];

      case 'school':
        return [
          ...base,
          { divider: true, label: 'My School' },
          { name: 'School Overview',  href: '/dashboard/school-overview',  icon: ChartBarIcon },
          { name: 'My Students',      href: '/dashboard/students',         icon: UserGroupIcon },
          { name: 'Attendance',       href: '/dashboard/attendance',       icon: ClipboardDocumentCheckIcon },
          { name: 'Timetable',        href: '/dashboard/timetable',        icon: CalendarDaysIcon },
          { divider: true, label: 'Reports' },
          { name: 'Student Reports',  href: '/dashboard/results',          icon: DocumentChartBarIcon },
          { name: 'Grades',           href: '/dashboard/grades',           icon: ClipboardDocumentCheckIcon },
          { name: 'Performance',      href: '/dashboard/progress',         icon: PresentationChartLineIcon },
          { divider: true, label: 'Finance' },
          { name: 'Payments',         href: '/dashboard/payments',         icon: BanknotesIcon },
          { divider: true, label: 'More' },
          { name: 'Messages',         href: '/dashboard/messages',         icon: EnvelopeIcon },
          { name: 'Settings',         href: '/dashboard/settings',         icon: CogIcon },
        ];

      default:
        return base;
    }
  };

  const navEntries = getNavEntries();

  // Extract plain nav items for bottom tab bar
  const navItems = navEntries.filter((e): e is NavItem => !isDivider(e));
  const BOTTOM_NAV_NAMES = new Set(
    profile?.role === 'student'
      ? ['Dashboard', 'My Courses', 'Code Playground', 'My Report Card', 'Messages']
      : profile?.role === 'school'
      ? ['Dashboard', 'My Students', 'Student Reports', 'Messages']
      : profile?.role === 'admin'
      ? ['Dashboard', 'Students', 'Approvals', 'Progress Reports', 'Messages']
      : profile?.role === 'teacher'
      ? ['Dashboard', 'My Classes', 'Students', 'Progress Reports', 'Messages']
      : ['Dashboard']
  );
  const bottomNavItems = navItems.filter(item => BOTTOM_NAV_NAMES.has(item.name)).slice(0, 4);

  const handleLogout = () => signOut();

  return (
    <>
      {/* ── Mobile Top Header ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-[#0B132B] px-4 py-2.5 text-white border-b-2 border-[#7a0606] shadow-lg">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Image src="/images/logo.png" alt="Rillcod" width={32} height={32} className="rounded-lg" priority />
          <span className="font-extrabold uppercase tracking-widest text-lg">Rillcod</span>
        </Link>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Link href="/dashboard/messages" className="relative p-1.5">
              <BellIcon className="w-5 h-5 text-gray-300" />
              <span className="absolute top-0 right-0 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </Link>
          )}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="p-1.5 text-white hover:text-[#FF914D] transition-colors rounded-lg hover:bg-white/10"
          >
            {mobileOpen ? <XMarkIcon className="w-7 h-7" /> : <Bars3Icon className="w-7 h-7" />}
          </button>
        </div>
      </div>

      {/* ── Backdrop (mobile only) ── */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <nav
        className={`
          fixed top-[53px] left-0 bottom-16 z-40 md:bottom-0
          md:static md:top-auto md:bottom-auto md:z-auto
          flex flex-col w-[280px] md:w-64
          bg-[#0B132B] text-gray-200
          border-r-4 border-[#7a0606] shadow-2xl
          transform transition-transform duration-300 ease-in-out
          md:translate-x-0 md:h-screen md:flex-shrink-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        aria-label="Dashboard navigation"
      >
        {/* Logo (desktop only) */}
        <div className="hidden md:flex flex-col items-center justify-center py-6 border-b border-gray-800">
          <Image src="/images/logo.png" alt="Rillcod Academy" width={64} height={64} className="rounded-2xl shadow-lg shadow-black/50 mb-3" priority />
          <span className="text-xl font-extrabold uppercase tracking-[0.2em] text-white">Rillcod</span>
          <span className="text-[10px] font-bold tracking-widest text-gray-400 mt-1 uppercase">Academy Portal</span>
        </div>

        {/* User badge */}
        <div className="px-4 md:px-6 py-4 flex items-center gap-3 border-b border-gray-800 bg-[#060c1d]">
          <div className="w-10 h-10 bg-[#7a0606] border border-gray-600 rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg font-black uppercase">
              {profile.full_name?.charAt(0) ?? 'U'}
            </span>
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-bold truncate text-white">{profile.full_name}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FF914D]">
              {profile.role === 'school' && profile.school_name
                ? profile.school_name
                : profile.role}
            </span>
          </div>
        </div>

        {/* Links */}
        <div className="flex-1 overflow-y-auto px-3 md:px-4 py-4 space-y-0.5">
          {navEntries.map((entry, idx) => {
            if (isDivider(entry)) {
              return (
                <div key={`divider-${idx}`} className="pt-3 pb-1 px-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 whitespace-nowrap">
                      {entry.label}
                    </span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                </div>
              );
            }

            const { name, href, icon: Icon } = entry;
            const active = pathname === href || pathname?.startsWith(href + '/');
            return (
              <Link
                key={name}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold tracking-wider uppercase transition-all duration-200 ${
                  active
                    ? 'bg-[#7a0606] text-white shadow-md'
                    : 'text-gray-400 hover:bg-[#1a2b54] hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-gray-400'}`} />
                <span className="truncate">{name}</span>
                {name === 'Messages' && unreadCount > 0 && (
                  <span className="ml-auto text-[10px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full font-black min-w-[1.25rem] text-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom actions */}
        <div className="p-3 md:p-4 border-t border-gray-800 bg-[#060c1d] space-y-1">
          <Link
            href="/dashboard/messages"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-xs font-bold uppercase text-gray-400 hover:bg-[#1a2b54] hover:text-white transition-colors"
          >
            <div className="relative flex-shrink-0">
              <BellIcon className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            Notifications
            {unreadCount > 0 && (
              <span className="ml-auto text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full">{unreadCount}</span>
            )}
          </Link>
          <Link
            href="/dashboard/profile"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-xs font-bold uppercase text-gray-400 hover:bg-[#1a2b54] hover:text-white transition-colors"
          >
            <UserIcon className="w-5 h-5 flex-shrink-0" /> Profile
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-xs font-bold uppercase text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5 flex-shrink-0" /> Sign Out
          </button>
        </div>
      </nav>

      {/* ── Mobile Bottom Navigation ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0B132B] border-t-2 border-[#7a0606] px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        {bottomNavItems.map(({ name, href, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={`mobile-${name}`}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex flex-col items-center gap-1 px-2 py-1 rounded-xl min-w-[3.5rem] transition-all duration-200 ${
                active ? 'text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <div className={`relative p-2 rounded-lg transition-all duration-200 ${active ? 'bg-[#7a0606] shadow-md shadow-black/40' : ''}`}>
                <Icon className={`w-6 h-6 ${active ? 'text-white' : 'text-gray-400'}`} />
                {name === 'Messages' && unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wide leading-none ${active ? 'text-white' : 'text-gray-500'}`}>
                {name === 'My Courses' ? 'Courses' :
                 name === 'My Classes' ? 'Classes' :
                 name === 'My Report Card' ? 'Report' :
                 name === 'Code Playground' ? 'Play' :
                 name === 'Progress Reports' ? 'Reports' :
                 name === 'Student Reports' ? 'Reports' :
                 name === 'My Students' ? 'Students' :
                 name === 'School Overview' ? 'Overview' :
                 name}
              </span>
            </Link>
          );
        })}

        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-1 px-2 py-1 rounded-xl min-w-[3.5rem] transition-all duration-200 text-red-500 hover:text-red-400 group"
        >
          <div className="relative p-2 rounded-lg transition-all duration-200 group-active:bg-red-500/20">
            <ArrowRightOnRectangleIcon className="w-6 h-6" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wide leading-none">Sign Out</span>
        </button>
      </div>
    </>
  );
}
