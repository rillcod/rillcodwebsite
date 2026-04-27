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
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          {breadcrumbs && (
            <Breadcrumb items={breadcrumbs} className="mb-2" />
          )}
          
          <div className="flex items-center">
            {Icon && (
              <div className="flex-shrink-0 mr-4">
                <div className="w-10 h-10 bg-gradient-to-r from-primary to-purple-600 rounded-lg flex items-center justify-center">
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            )}
            
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
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
          <div className="flex items-center space-x-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageHeader; 