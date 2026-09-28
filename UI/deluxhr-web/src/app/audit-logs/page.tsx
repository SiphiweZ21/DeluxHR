'use client';

import { useEffect, useState } from 'react';
import { getAuditLogs, type AuditLog } from '../../lib/api';

export default function AuditLogsPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');

      const data = await getAuditLogs();

      setAuditLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load audit logs',
      );
      setAuditLogs([]); // 🔒 ensure it's never null
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const safeAuditLogs = Array.isArray(auditLogs) ? auditLogs : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Audit Logs
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {safeAuditLogs.length} audit log
          {safeAuditLogs.length === 1 ? '' : 's'}
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-600">Loading audit logs...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : safeAuditLogs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 p-6 text-sm text-slate-600">
          No audit logs found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-6 py-3 font-medium">Action</th>
                <th className="px-6 py-3 font-medium">Entity</th>
                <th className="px-6 py-3 font-medium">Entity ID</th>
                <th className="px-6 py-3 font-medium">Date</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {safeAuditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-6 py-4 text-slate-900">
                    {log.action}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {log.entity}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {log.entityId}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {formatDate(log.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}