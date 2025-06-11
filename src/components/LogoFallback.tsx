interface LogoFallbackProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  textColor?: string;
}

export default function LogoFallback({ size = 'md', showText = true, className = '', textColor = 'text-gray-900' }: LogoFallbackProps) {
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

  const iconSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <div className={`${sizeClasses[size]} rounded-lg overflow-hidden shadow-lg flex-shrink-0 bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center`}>
        <span className={`text-white font-bold ${iconSizes[size]}`}>RA</span>
      </div>
      {showText && (
        <span className={`font-bold ${textColor} ${textSizes[size]} whitespace-nowrap`}>
          Rillcod Academy
        </span>
      )}
    </div>
  );
} 