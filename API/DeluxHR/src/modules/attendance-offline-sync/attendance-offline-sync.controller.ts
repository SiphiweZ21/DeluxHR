import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import { AttendanceOfflineSyncService } from './attendance-offline-sync.service';
import { SyncOfflineAttendanceDto } from './dto/sync-offline-attendance.dto';

@Controller('attendance/kiosks/offline')
export class AttendanceOfflineSyncController {
  constructor(
    private readonly attendanceOfflineSyncService: AttendanceOfflineSyncService,
  ) {}

  // Kiosk-device authenticated endpoint. Employee JWT is intentionally not required.
  @Post('sync')
  sync(@Body() dto: SyncOfflineAttendanceDto) {
    return this.attendanceOfflineSyncService.sync(dto);
  }
}
