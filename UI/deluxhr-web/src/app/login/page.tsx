import { LoginForm } from '../../components/auth/login-form';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-2">
        <div className="hidden bg-indigo-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-indigo-100">
              DeluxHR
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-tight">
              Modern HR platform — with workforce intelligence and payroll.
            </h1>
            <p className="mt-4 max-w-md text-sm text-indigo-100">
              Manage employees, leave, attendance, timesheets, payroll, payslips, and approvals in one calm, professional workspace.
            </p>
          </div>

          <p className="text-sm text-indigo-100">
            Secure access for admins, managers, employees, and business leaders.
          </p>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
                DeluxHR
              </p>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-slate-900">Welcome back</h2>
              <p className="mt-2 text-sm text-slate-600">
                Sign in to continue to your workspace.
              </p>
            </div>

            <LoginForm />
          </div>
        </div>
      </div>
    </main>
  );
}