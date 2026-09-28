export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Register</h1>
        <p className="mt-2 text-sm text-slate-500">
          Create your organization and admin account.
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="text"
            placeholder="Organization Name"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500"
          />
          <input
            type="text"
            placeholder="Full Name"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500"
          />
          <input
            type="email"
            placeholder="Email"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500"
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500"
          />
          <button className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white hover:bg-indigo-500">
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
}