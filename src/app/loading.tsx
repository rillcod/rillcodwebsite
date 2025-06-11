export default function Loading() {
  return (
    <div className="min-h-screen pt-16 flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="text-center">
        {/* Logo Animation */}
        <div className="mb-8">
          <div className="relative">
            <div className="w-20 h-20 bg-[#FF914D] rounded-full mx-auto mb-4 animate-pulse"></div>
            <div className="absolute inset-0 w-20 h-20 border-4 border-[#FF914D] border-t-transparent rounded-full mx-auto animate-spin"></div>
          </div>
          <h2 className="text-2xl font-bold text-[#FF914D] mb-2">RILLCOD Academy</h2>
          <p className="text-gray-600">Loading amazing content...</p>
        </div>

        {/* Progress Bar */}
        <div className="w-64 bg-gray-200 rounded-full h-2 mx-auto mb-4">
          <div className="bg-[#FF914D] h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
        </div>

        {/* Loading Dots */}
        <div className="flex justify-center space-x-2">
          <div className="w-3 h-3 bg-[#FF914D] rounded-full animate-bounce"></div>
          <div className="w-3 h-3 bg-[#FF914D] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-3 h-3 bg-[#FF914D] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    </div>
  );
} 