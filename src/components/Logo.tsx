"use client";
import Image from 'next/image';
import { brandAssets } from '../config/brand';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  textColor?: string;
  useSvg?: boolean;
}

export default function Logo({ size = 'md', showText = true, className = '', textColor = 'text-gray-900 dark:text-white', useSvg = false }: LogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const imgSizes = { sm: 32, md: 40, lg: 48, xl: 64 };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl',
    xl: 'text-2xl',
  };

  const src = useSvg ? brandAssets.logoSvg : brandAssets.logo;

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <div className={`${sizeClasses[size]} rounded-xl overflow-hidden shadow-lg flex-shrink-0`}>
        <Image
          src={src}
          alt="Rillcod Academy Logo"
          width={imgSizes[size]}
          height={imgSizes[size]}
          className="w-full h-full object-contain"
          priority
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            // Try PNG fallback if SVG fails
            if (target.src.includes('.svg')) {
              target.src = brandAssets.logo;
            } else if (target.src !== brandAssets.logoCloudinary) {
              target.src = brandAssets.logoCloudinary;
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
