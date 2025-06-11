"use client";
import Image from 'next/image';
import { brandAssets } from '../config/brand';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  textColor?: string;
}

export default function Logo({ size = 'md', showText = true, className = '', textColor = 'text-gray-900 dark:text-white' }: LogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl'
  };

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <div className={`${sizeClasses[size]} rounded-lg overflow-hidden shadow-lg flex-shrink-0`}>
        <Image 
          src={brandAssets.logo}
          alt="Rillcod Academy Logo" 
          width={48}
          height={48}
          className="w-full h-full object-contain"
          priority
          unoptimized
          onError={(e) => {
            // Fallback to a simple div with brand colors if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `
                <div class="w-full h-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center">
                  <span class="text-white font-bold text-xs">RA</span>
                </div>
              `;
            }
          }}
        />
      </div>
      {showText && (
        <span className={`font-bold ${textColor} ${textSizes[size]} whitespace-nowrap`}>
          Rillcod Academy
        </span>
      )}
    </div>
  );
} 