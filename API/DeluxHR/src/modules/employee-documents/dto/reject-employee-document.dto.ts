import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectEmployeeDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
