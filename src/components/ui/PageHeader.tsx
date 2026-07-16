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
    <div className={`bg-card border-b border-border px-4 py-6 sm:px-6 lg:px-8 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          {breadcrumbs && (
            <Breadcrumb items={breadcrumbs} className="mb-2" />
          )}
          
          <div className="flex items-start sm:items-center">
            {Icon && (
              <div className="flex-shrink-0 mr-4">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-r from-primary to-purple-600 rounded-lg flex items-center justify-center">
                  <Icon className="w-5 h-5 text-white sm:w-6 sm:h-6" />
                </div>
              </div>
            )}
            
            <div>
              <h1 className="text-xl font-bold leading-tight text-foreground sm:text-3xl">
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
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageHeader; 