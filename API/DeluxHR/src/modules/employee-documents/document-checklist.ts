import { EmployeeDocumentType } from '@prisma/client';

export const DEFAULT_EMPLOYEE_DOCUMENT_CHECKLIST: readonly EmployeeDocumentType[] =
  [
    EmployeeDocumentType.ID_DOCUMENT,
    EmployeeDocumentType.EMPLOYMENT_CONTRACT,
    EmployeeDocumentType.PROOF_OF_BANKING,
    EmployeeDocumentType.TAX_DOCUMENT,
  ];

export type EmployeeDocumentChecklistStatus =
  | 'MISSING'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';
