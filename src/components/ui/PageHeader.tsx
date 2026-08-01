import React from 'react';
import { LucideIcon } from 'lucide-react';
import Breadcrumb from './Breadcrumb';
import type { BreadcrumbItem } from './Breadcrumb';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  breadcrumbs,
  actions,
  className = '',
}) => {
  return (
    <div className={`rounded-2xl border border-border/80 bg-card px-4 py-5 shadow-sm sm:px-6 sm:py-6 ${className}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          {breadcrumbs && (
            <Breadcrumb items={breadcrumbs} className="mb-2" />
          )}
          
          <div className="flex items-start sm:items-center gap-3">
            {Icon && (
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            )}
            
            <div>
              <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        </div>
        
        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageHeader; 