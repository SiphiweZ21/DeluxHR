'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import * as api from '../../lib/platform-api';
import { dateTimeLabel } from '../../lib/people-services-api';
import { PlatformPageTitle, UsageCards } from '../../components/platform-admin/common';
import { Badge, Card, Notice, secondary, useAction } from '../../components/leave/ui';
export default function Page() {
  const [usage, setUsage] = useState<api.PlatformUsage | null>(null), [health, setHealth] = useState<api.PlatformHealth | null>(null); const action = useAction();
  async function load() { const results = await Promise.allSettled([api.getPlatformUsage(), api.getPlatformHealth()]); if (results[0].status === 'fulfilled') setUsage(results[0].value); if (results[1].status === 'fulfilled') setHealth(results[1].value); const failed = results.find(r => r.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason; }
  useEffect(() => { void action.run(load); }, []);
  return <div className="space-y-6"><PlatformPageTitle title="Platform overview" text="Manage DeluxHR companies, packages, access and operational health."/><Notice error={action.error} message={action.message}/><div className="flex flex-wrap gap-2"><button disabled={action.busy} className={secondary} onClick={() => void action.run(load)}>Refresh overview</button><Link className={secondary} href="/platform-admin/companies">Manage companies</Link><Link className={secondary} href="/platform-admin/packages">Manage packages</Link></div>{usage && <><UsageCards usage={usage}/><p className="text-sm text-slate-500">Stored record counts across all companies and statuses; these totals do not imply active subscriptions or active employees.</p></>}{health && <Card title="System health"><Badge value={health.status}/><p className="text-sm">Database: {health.database}</p><p className="text-sm text-slate-500">API process uptime: {Math.floor(health.uptimeSeconds / 3600)}h {Math.floor(health.uptimeSeconds % 3600 / 60)}m · Checked {dateTimeLabel(health.checkedAt)}</p><p className="text-xs text-slate-500">This check covers database reachability and the current API process. Other services and deployment monitoring are not included.</p></Card>}</div>;
}
