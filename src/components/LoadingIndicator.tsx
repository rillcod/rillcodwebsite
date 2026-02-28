"use client";

import { useEffect, useState } from 'react';

export default function LoadingIndicator() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Hide loading indicator after initial load
    const timer = setTimeout(() => {
      const loadingIndicator = document.getElementById('loading-indicator');
      if (loadingIndicator) {
        loadingIndicator.style.opacity = '0';
        setTimeout(() => {
          loadingIndicator.style.display = 'none';
        }, 300); // Match the transition duration
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return null;

  return (
    <div 
      id="loading-indicator" 
      className="fixed inset-0 bg-white dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 flex items-center justify-center z-[9999] transition-opacity duration-300"
      style={{ opacity: 1 }}
    >
      <div className="flex flex-col items-center space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-600 dark:text-gray-300 font-medium">Loading...</p>
      </div>
    </div>
  );
} 