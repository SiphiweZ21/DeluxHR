import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join, relative, resolve, sep } from 'path';

@Injectable()
export class EmployeeDocumentStorageService {
  private readonly storageRoot = resolve(
    process.env.EMPLOYEE_DOCUMENT_STORAGE_ROOT ||
      join(
        process.env.DELUXHR_STORAGE_ROOT || join(process.cwd(), 'storage'),
        'employee-documents',
      ),
  );

  async store(params: {
    organizationId: string;
    employeeId: string;
    file: Express.Multer.File;
  }): Promise<string> {
    const extension = this.getSafeExtension(
      params.file.originalname,
      params.file.mimetype,
    );

    const fileName = `${randomUUID()}${extension}`;

    const relativeDirectory = join(params.organizationId, params.employeeId);

    const relativeKey = join(relativeDirectory, fileName);

    const absoluteDirectory = this.resolveStoragePath(relativeDirectory);

    const absolutePath = this.resolveStoragePath(relativeKey);

    try {
      await mkdir(absoluteDirectory, {
        recursive: true,
        mode: 0o700,
      });

      await writeFile(absolutePath, params.file.buffer, {
        flag: 'wx',
        mode: 0o600,
      });

      return relativeKey;
    } catch {
      throw new InternalServerErrorException(
        'Unable to store employee document.',
      );
    }
  }

  async read(storageKey: string): Promise<Buffer> {
    const absolutePath = this.resolveStoragePath(storageKey);

    try {
      return await readFile(absolutePath);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        throw new NotFoundException('Employee document file not found.');
      }

      throw new InternalServerErrorException(
        'Unable to read employee document.',
      );
    }
  }

  async remove(storageKey: string): Promise<void> {
    let absolutePath: string;

    try {
      absolutePath = this.resolveStoragePath(storageKey);
    } catch {
      return;
    }

    try {
      await rm(absolutePath, {
        force: true,
      });
    } catch {
      // Cleanup is best-effort.
    }
  }

  private resolveStoragePath(storageKey: string): string {
    const absolutePath = resolve(this.storageRoot, storageKey);

    const relativePath = relative(this.storageRoot, absolutePath);

    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      relativePath === '' ||
      relativePath.startsWith(sep)
    ) {
      throw new InternalServerErrorException(
        'Invalid employee document storage reference.',
      );
    }

    return absolutePath;
  }

  private getSafeExtension(originalFileName: string, mimeType: string): string {
    switch (mimeType) {
      case 'application/pdf':
        return '.pdf';

      case 'image/jpeg':
        return '.jpg';

      case 'image/png':
        return '.png';

      default:
        throw new InternalServerErrorException('Unsupported document type');
    }
  }
}
