import { normalizePhone, normalizeEmployeeCode } from './employee-contact';
describe('Employee contact and optional code', () => {
  it('normalizes SA local and international phone formats', () => {
    for (const value of ['0844718499', '27844718499', '+27 84 471 8499'])
      expect(normalizePhone(value)).toBe('+27844718499');
  });
  it('rejects empty and invalid phone numbers', () => {
    for (const value of ['', '123', '+000000000'])
      expect(() => normalizePhone(value)).toThrow();
  });
  it('preserves leading zero codes and clears blanks', () => {
    expect(normalizeEmployeeCode(' 000123 ')).toBe('000123');
    expect(normalizeEmployeeCode(' ')).toBeNull();
    expect(normalizeEmployeeCode(null)).toBeNull();
    expect(() => normalizeEmployeeCode('invalid code')).toThrow();
  });
});
