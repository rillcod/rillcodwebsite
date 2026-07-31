export default function ProgramsLoading() {
  return (
    <div className="min-h-screen bg-background pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12 animate-pulse">
      {/* Header Skeleton */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="h-4 w-32 bg-primary/20 rounded-full mx-auto" />
        <div className="h-10 w-3/4 sm:w-2/3 bg-muted rounded-xl mx-auto" />
        <div className="h-5 w-5/6 bg-muted/60 rounded-lg mx-auto" />
      </div>

      {/* Filter Tabs Skeleton */}
      <div className="flex justify-center gap-2 flex-wrap">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-24 sm:w-28 bg-muted rounded-xl" />
        ))}
      </div>

      {/* Program Cards Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="border border-border/50 bg-card rounded-2xl p-6 space-y-6 flex flex-col justify-between shadow-sm"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-6 w-20 bg-primary/20 rounded-full" />
                <div className="h-5 w-16 bg-muted rounded-lg" />
              </div>
              <div className="h-7 w-4/5 bg-muted rounded-lg" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-muted/60 rounded" />
                <div className="h-4 w-5/6 bg-muted/60 rounded" />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/40">
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-4 w-20 bg-muted rounded" />
              </div>
              <div className="h-11 w-full bg-muted rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
