import { workforceRequest as request } from "./api";
export type Site = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  attendanceEnabled: boolean;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number | null;
};
export type SiteAssignment = {
  id: string;
  employeeId: string;
  workLocationId: string;
  isPrimary: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  workLocation: Site;
};
const path = (employeeId: string) =>
  `employees/${encodeURIComponent(employeeId)}/work-locations`;
export const getSites = () => request<Site[]>("work-locations");
export const getSiteAssignments = (employeeId: string) =>
  request<SiteAssignment[]>(path(employeeId));
export const assignSite = (
  employeeId: string,
  data: { workLocationId: string; effectiveFrom: string; effectiveTo?: string },
) =>
  request<SiteAssignment>(`${path(employeeId)}/assign`, "POST", {
    ...data,
    isPrimary: true,
  });
export const endSiteAssignment = (
  employeeId: string,
  assignmentId: string,
  effectiveTo: string,
) =>
  request<SiteAssignment>(
    `${path(employeeId)}/${encodeURIComponent(assignmentId)}/end`,
    "PATCH",
    { effectiveTo },
  );
// Convert a calendar date to midnight at the site's timezone, including DST.
export function siteDateInstant(day: string, timezone: string) {
  const target = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(target)) throw new Error("Choose a valid date.");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let instant = target;
  for (let n = 0; n < 3; n++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((x) => [x.type, x.value]),
    );
    const local = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    instant += target - local;
  }
  return new Date(instant).toISOString();
}
