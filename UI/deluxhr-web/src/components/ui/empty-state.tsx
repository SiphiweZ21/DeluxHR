type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-slate-200 p-8 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && (
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      )}
    </div>
  );
}