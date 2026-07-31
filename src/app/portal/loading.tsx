export default function PortalLoading() {
  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-6 animate-pulse">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="w-16 h-16 bg-primary/20 rounded-2xl mx-auto flex items-center justify-center">
          <div className="w-8 h-8 bg-primary/40 rounded-lg animate-spin" />
        </div>
        <div className="space-y-3">
          <div className="h-7 w-2/3 bg-muted rounded-lg mx-auto" />
          <div className="h-4 w-5/6 bg-muted/60 rounded mx-auto" />
        </div>
        <div className="p-6 bg-card border border-border/50 rounded-2xl space-y-4 shadow-sm">
          <div className="h-12 bg-muted rounded-xl w-full" />
          <div className="h-12 bg-muted/60 rounded-xl w-full" />
        </div>
      </div>
    </div>
  );
}
