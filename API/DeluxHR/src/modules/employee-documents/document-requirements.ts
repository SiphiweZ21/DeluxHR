import { EmployeeDocumentType } from '@prisma/client';

export type EmployeeDocumentCategory =
  | 'IDENTITY'
  | 'EMPLOYMENT'
  | 'PAYROLL'
  | 'TAX'
  | 'RIGHT_TO_WORK'
  | 'QUALIFICATION'
  | 'MEDICAL'
  | 'OTHER';

export interface EmployeeDocumentRequirement {
  type: EmployeeDocumentType;
  label: string;
  category: EmployeeDocumentCategory;
  verificationRequired: boolean;
  expirySupported: boolean;
  description: string;
}

export const EMPLOYEE_DOCUMENT_REQUIREMENTS: Record<
  EmployeeDocumentType,
  EmployeeDocumentRequirement
> = {
  [EmployeeDocumentType.ID_DOCUMENT]: {
    type: EmployeeDocumentType.ID_DOCUMENT,
    label: 'Identity Document',
    category: 'IDENTITY',
    verificationRequired: true,
    expirySupported: false,
    description: 'Employee identity document.',
  },

  [EmployeeDocumentType.PASSPORT]: {
    type: EmployeeDocumentType.PASSPORT,
    label: 'Passport',
    category: 'IDENTITY',
    verificationRequired: true,
    expirySupported: true,
    description: 'Employee passport used for identity verification.',
  },

  [EmployeeDocumentType.EMPLOYMENT_CONTRACT]: {
    type: EmployeeDocumentType.EMPLOYMENT_CONTRACT,
    label: 'Employment Contract',
    category: 'EMPLOYMENT',
    verificationRequired: true,
    expirySupported: true,
    description: 'Employment agreement or contract.',
  },

  [EmployeeDocumentType.PROOF_OF_BANKING]: {
    type: EmployeeDocumentType.PROOF_OF_BANKING,
    label: 'Proof of Banking',
    category: 'PAYROLL',
    verificationRequired: true,
    expirySupported: false,
    description:
      'Supporting proof of banking. Verification does not approve or activate employee payment details.',
  },

  [EmployeeDocumentType.TAX_DOCUMENT]: {
    type: EmployeeDocumentType.TAX_DOCUMENT,
    label: 'Tax Document',
    category: 'TAX',
    verificationRequired: true,
    expirySupported: false,
    description: 'Employee tax-related supporting document.',
  },

  [EmployeeDocumentType.QUALIFICATION]: {
    type: EmployeeDocumentType.QUALIFICATION,
    label: 'Qualification',
    category: 'QUALIFICATION',
    verificationRequired: false,
    expirySupported: false,
    description: 'Academic or professional qualification.',
  },

  [EmployeeDocumentType.CERTIFICATE]: {
    type: EmployeeDocumentType.CERTIFICATE,
    label: 'Certificate',
    category: 'QUALIFICATION',
    verificationRequired: false,
    expirySupported: true,
    description: 'Professional, training or competency certificate.',
  },

  [EmployeeDocumentType.WORK_PERMIT]: {
    type: EmployeeDocumentType.WORK_PERMIT,
    label: 'Work Permit',
    category: 'RIGHT_TO_WORK',
    verificationRequired: true,
    expirySupported: true,
    description: 'Document supporting the employee right to work.',
  },

  [EmployeeDocumentType.VISA]: {
    type: EmployeeDocumentType.VISA,
    label: 'Visa',
    category: 'RIGHT_TO_WORK',
    verificationRequired: true,
    expirySupported: true,
    description: 'Visa or immigration document relevant to employment.',
  },

  [EmployeeDocumentType.MEDICAL_CERTIFICATE]: {
    type: EmployeeDocumentType.MEDICAL_CERTIFICATE,
    label: 'Medical Certificate',
    category: 'MEDICAL',
    verificationRequired: false,
    expirySupported: true,
    description: 'Medical certificate supplied for an HR process.',
  },

  [EmployeeDocumentType.OTHER]: {
    type: EmployeeDocumentType.OTHER,
    label: 'Other Document',
    category: 'OTHER',
    verificationRequired: false,
    expirySupported: true,
    description: 'Other employee document retained in the HR record.',
  },
};

export function getEmployeeDocumentRequirement(
  type: EmployeeDocumentType,
): EmployeeDocumentRequirement {
  return EMPLOYEE_DOCUMENT_REQUIREMENTS[type];
}
