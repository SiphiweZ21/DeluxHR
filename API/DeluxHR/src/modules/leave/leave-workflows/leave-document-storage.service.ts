import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, resolve, relative, sep } from 'path';
@Injectable()
export class LeaveDocumentStorageService {
 private readonly root = resolve(process.env.DELUXHR_STORAGE_ROOT||join(process.cwd(),'storage'),'leave-documents');
 private path(key: string) {
   const full = resolve(this.root,key), rel = relative(this.root,full);
   if (!rel || rel === '..' || rel.startsWith('..'+sep) || rel.startsWith(sep)) throw new BadRequestException('Invalid document key');
   return full;
 }
 async store(organizationId: string, requestId: string, file: Express.Multer.File) {
   const allowed: Record<string, { ext: string; signature: number[] }> = { 'application/pdf': { ext: '.pdf', signature: [0x25,0x50,0x44,0x46] }, 'image/png': { ext: '.png', signature: [0x89,0x50,0x4e,0x47] }, 'image/jpeg': { ext: '.jpg', signature: [0xff,0xd8,0xff] } };
   const kind = file && allowed[file.mimetype];
   if (!kind || !file.buffer || file.buffer.length < kind.signature.length || file.buffer.length > 10*1024*1024 || !kind.signature.every((v,i)=>file.buffer[i] === v)) throw new BadRequestException('Upload a PDF, PNG, or JPEG up to 10 MB');
   const key = join(organizationId,requestId,randomUUID()+kind.ext);
   await mkdir(this.path(join(organizationId,requestId)),{ recursive: true });
   await writeFile(this.path(key),file.buffer,{ flag: 'wx' });
   return key;
 }
 async read(key: string) { try { return await readFile(this.path(key)); } catch { throw new NotFoundException('Leave document file not found'); } }
}
