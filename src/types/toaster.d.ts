import { ReactNode } from 'react';

declare module '@/components/ui/toaster' {
  export interface ToasterProps {
    children?: ReactNode;
  }

  export function Toaster(props?: ToasterProps): JSX.Element;
} 