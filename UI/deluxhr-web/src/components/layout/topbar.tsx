'use client';

type TopbarProps = {
  onMenuClick: () => void;
};

export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 lg:hidden"
        >
          Menu
        </button>

        <div>
          <p className="text-sm text-slate-500">Organization</p>
          <h2 className="text-sm font-semibold text-slate-900">
            DeluxHR Demo Company
          </h2>
        </div>
      </div>

      <div className="text-right">
        <p className="text-sm font-medium text-slate-900">Admin User</p>
        <p className="text-xs text-slate-500">admin@deluxhr.com</p>
      </div>
    </header>
  );
}