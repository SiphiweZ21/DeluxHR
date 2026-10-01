'use client';
import * as api from '../../lib/people-services-api';
export function Sla({ request: r }: { request: api.HrRequest }) {
  const responseLate = r.responseDueAt && Date.parse(r.firstResponseAt ?? new Date().toISOString()) > Date.parse(r.responseDueAt);
  const resolutionLate = r.resolutionDueAt && Date.parse(r.resolvedAt ?? new Date().toISOString()) > Date.parse(r.resolutionDueAt);
  return <div className="space-y-1 text-xs"><p className={responseLate ? 'text-red-700' : 'text-slate-500'}>Response due: {r.responseDueAt ? api.dateTimeLabel(r.responseDueAt) : 'Not set'}{r.firstResponseAt ? ` · Responded ${api.dateTimeLabel(r.firstResponseAt)}` : ' · Awaiting first response'}{responseLate ? ' · SLA breached' : ''}</p><p className={resolutionLate ? 'text-red-700' : 'text-slate-500'}>Resolution due: {r.resolutionDueAt ? api.dateTimeLabel(r.resolutionDueAt) : 'Not set'}{r.resolvedAt ? ` · Resolved ${api.dateTimeLabel(r.resolvedAt)}` : ''}{resolutionLate ? ' · SLA breached' : ''}</p></div>;
}
