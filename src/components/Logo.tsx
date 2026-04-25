"use client";
import Image from 'next/image';
import { brandAssets } from '../config/brand';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showText?: boolean;
  className?: string;
  textColor?: string;
  variant?: 'default' | 'sidebar' | 'auth';
}

const SIZE_MAP = {
  sm:  { container: 'w-8 h-8',   img: 28,  text: 'text-sm',  sub: 'text-[8px]'  },
  md:  { container: 'w-10 h-10', img: 36,  text: 'text-base',sub: 'text-[9px]'  },
  lg:  { container: 'w-12 h-12', img: 44,  text: 'text-lg',  sub: 'text-[10px]' },
  xl:  { container: 'w-16 h-16', img: 56,  text: 'text-xl',  sub: 'text-[11px]' },
  '2xl':{ container: 'w-20 h-20',img: 72,  text: 'text-2xl', sub: 'text-xs'     },
};

export default function Logo({
  size = 'md',
  showText = true,
  className = '',
  variant = 'default',
}: LogoProps) {
  const s = SIZE_MAP[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo mark — white bg so it looks correct on any background */}
      <div className={`
        ${s.container} flex-shrink-0 flex items-center justify-center
        bg-white rounded-xl overflow-hidden
        shadow-md border border-border/40
        dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]
      `}>
        <Image
          src={brandAssets.logo}
          alt="Rillcod Technologies"
          width={s.img}
          height={s.img}
          className="w-[80%] h-[80%] object-contain"
          priority
          onError={(e) => {
            const t = e.target as HTMLImageElement;
            if (t.src !== brandAssets.logoCloudinary) t.src = brandAssets.logoCloudinary;
          }}
        />
      </div>

      {showText && (
        <div className="leading-tight min-w-0">
          <span className={`${s.text} font-black uppercase tracking-tighter block italic text-foreground`}>
            RILLCOD<span className="not-italic text-brand-red-600">.</span>
          </span>
          <span className={`${s.sub} font-bold uppercase tracking-[0.25em] text-muted-foreground block`}>
            Technologies
          </span>
        </div>
      )}
    </div>
  );
}
