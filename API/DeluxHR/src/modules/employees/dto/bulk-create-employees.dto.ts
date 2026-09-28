import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateEmployeeDto } from './create-employee.dto';

export class BulkCreateEmployeesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEmployeeDto)
  employees: CreateEmployeeDto[];
}
