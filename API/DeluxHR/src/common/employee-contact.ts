import { BadRequestException } from '@nestjs/common';
export function normalizePhone(value: string): string {
  let phone = value.replace(/[\s()-]/g, '');
  if (/^0[6-8]\d{8}$/.test(phone)) phone = '+27' + phone.slice(1);
  else if (/^27[6-8]\d{8}$/.test(phone)) phone = '+' + phone;
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw new BadRequestException(
      'Enter a valid phone, for example 0844718499 or +27844718499.',
    );
  return phone;
}
export function normalizeEmployeeCode(value?: string | null): string | null {
  const code = value?.trim() || null;
  if (code && (code.length > 50 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(code)))
    throw new BadRequestException(
      'EmployeeCode must be at most 50 letters, digits, dots, underscores, slashes or hyphens.',
    );
  return code;
}
