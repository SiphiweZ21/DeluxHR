import { BadRequestException } from '@nestjs/common';
import { EmployeeDocumentsService } from './employee-documents.service';

describe('employee document upload', () => {
  it('rejects forged PDF contents before writing a file', () => {
    const service = Object.create(
      EmployeeDocumentsService.prototype,
    ) as EmployeeDocumentsService;
    const forged = {
      mimetype: 'application/pdf',
      size: 12,
      buffer: Buffer.from('not a pdf!!!'),
    } as Express.Multer.File;
    expect(() => (service as any).validateFile(forged)).toThrow(
      BadRequestException,
    );
    const valid = {
      mimetype: 'application/pdf',
      size: 9,
      buffer: Buffer.from('%PDF-1.7\n'),
    } as Express.Multer.File;
    expect(() => (service as any).validateFile(valid)).not.toThrow();
  });
});
