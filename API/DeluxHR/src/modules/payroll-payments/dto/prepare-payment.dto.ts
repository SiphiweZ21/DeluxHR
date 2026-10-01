import { IsOptional, IsUUID } from 'class-validator';
export class PreparePaymentDto {
  @IsOptional() @IsUUID() fundingProfileId?: string;
}
