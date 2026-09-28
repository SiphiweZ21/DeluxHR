export function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-10 rounded-lg bg-slate-200" />
      ))}
    </div>
  );
}