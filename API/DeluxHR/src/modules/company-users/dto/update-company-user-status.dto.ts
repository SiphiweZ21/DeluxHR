import { IsBoolean } from 'class-validator';

export class UpdateCompanyUserStatusDto {
  @IsBoolean()
  isActive!: boolean;
}