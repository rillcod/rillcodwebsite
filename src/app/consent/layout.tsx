import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Open Consent Form | Rillcod Technologies',
  description: 'Scan a Rillcod QR code or enter a form reference to open a secure registration, assessment, or consent form.',
};

export default function ConsentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
