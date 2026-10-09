import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
export class ReviewProfileChangeDto {
 @IsIn(['APPROVED','REJECTED']) status!: 'APPROVED' | 'REJECTED';
 @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}
