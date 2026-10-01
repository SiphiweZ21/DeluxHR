import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

import { EmployeeDocumentsController } from './employee-documents.controller';
import { EmployeeDocumentsService } from './employee-documents.service';
import { EmployeeDocumentStorageService } from './employee-document-storage.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [EmployeeDocumentsController],
  providers: [EmployeeDocumentsService, EmployeeDocumentStorageService],
  exports: [EmployeeDocumentsService, EmployeeDocumentStorageService],
})
export class EmployeeDocumentsModule {}
