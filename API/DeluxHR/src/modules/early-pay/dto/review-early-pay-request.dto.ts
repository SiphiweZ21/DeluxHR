import { IsIn, IsOptional, IsString } from 'class-validator';
export class ReviewEarlyPayRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() reason?: string;
}
