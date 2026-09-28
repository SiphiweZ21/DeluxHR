'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  createLeaveType,
  getLeaveTypes,
  type LeaveType,
} from '../../lib/api';

export default function LeaveTypesPage() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveTypeName, setLeaveTypeName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function loadLeaveTypes() {
    try {
      setIsLoading(true);
      setErrorMessage('');

      const data = await getLeaveTypes();
      setLeaveTypes(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load leave types.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLeaveTypes();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!leaveTypeName.trim()) {
      setErrorMessage('Leave type name is required.');
      return;
    }

    try {
      setIsSubmitting(true);

      const newLeaveType = await createLeaveType({
        name: leaveTypeName.trim(),
      });

      setLeaveTypes((current) => [newLeaveType, ...current]);
      setLeaveTypeName('');
      setSuccessMessage('Leave type created successfully.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create leave type.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Leave Types</h1>
        <p className="mt-1 text-slate-600">
          Manage leave categories for your organization.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Add Leave Type
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Create a new leave category such as annual or sick leave.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="leaveTypeName"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Leave Type Name
              </label>

              <input
                id="leaveTypeName"
                type="text"
                value={leaveTypeName}
                onChange={(event) => setLeaveTypeName(event.target.value)}
                placeholder="e.g. Annual Leave"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {errorMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {successMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Creating...' : 'Create Leave Type'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Leave Type List
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {leaveTypes.length} leave type
                {leaveTypes.length === 1 ? '' : 's'}
              </p>
            </div>

            <button
              onClick={loadLeaveTypes}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          {isLoading ? (
            <p className="mt-6 text-sm text-slate-500">
              Loading leave types...
            </p>
          ) : leaveTypes.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              No leave types found yet.
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-[minmax(0,1fr)_180px] bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                <div>Name</div>
                <div>Created</div>
              </div>

              <div className="divide-y divide-slate-200">
                {leaveTypes.map((leaveType) => (
                  <div
                    key={leaveType.id}
                    className="grid grid-cols-[minmax(0,1fr)_180px] px-4 py-4 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {leaveType.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {leaveType.id}
                      </p>
                    </div>

                    <div className="text-slate-600">
                      {leaveType.createdAt
                        ? new Date(leaveType.createdAt).toLocaleDateString()
                        : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}