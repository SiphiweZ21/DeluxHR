export const DEFAULT_DOCUMENT_EXPIRY_WARNING_DAYS = 30;

export type EmployeeDocumentValidityStatus =
  | 'NO_EXPIRY'
  | 'VALID'
  | 'EXPIRING_SOON'
  | 'EXPIRED';

export type EmployeeDocumentValidity = {
  status: EmployeeDocumentValidityStatus;
  daysUntilExpiry: number | null;
  expiryWarningDays: number;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function getEmployeeDocumentValidity(
  expiresAt: Date | null,
  now: Date = new Date(),
  expiryWarningDays = DEFAULT_DOCUMENT_EXPIRY_WARNING_DAYS,
): EmployeeDocumentValidity {
  if (!expiresAt) {
    return {
      status: 'NO_EXPIRY',
      daysUntilExpiry: null,
      expiryWarningDays,
    };
  }

  const expiryDate = startOfUtcDay(expiresAt);
  const currentDate = startOfUtcDay(now);

  const difference = expiryDate.getTime() - currentDate.getTime();

  const daysUntilExpiry = Math.ceil(difference / MILLISECONDS_PER_DAY);

  if (daysUntilExpiry < 0) {
    return {
      status: 'EXPIRED',
      daysUntilExpiry,
      expiryWarningDays,
    };
  }

  if (daysUntilExpiry <= expiryWarningDays) {
    return {
      status: 'EXPIRING_SOON',
      daysUntilExpiry,
      expiryWarningDays,
    };
  }

  return {
    status: 'VALID',
    daysUntilExpiry,
    expiryWarningDays,
  };
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}
