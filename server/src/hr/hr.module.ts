import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { HrController } from './hr.controller'
import { HrService } from './hr.service'
import { HrCleanupService } from './hr-cleanup.service'
import { StorageService } from '../storage/storage.service'

@Module({
  imports: [
    MulterModule.register({
      storage: require('multer').memoryStorage(), // 使用内存存储
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
  controllers: [HrController],
  providers: [HrService, HrCleanupService, StorageService],
  exports: [HrService],
})
export class HrModule {}
