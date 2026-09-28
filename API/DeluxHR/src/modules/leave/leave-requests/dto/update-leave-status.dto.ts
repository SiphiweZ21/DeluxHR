import { IsIn } from 'class-validator';

export class UpdateLeaveStatusDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';
}
