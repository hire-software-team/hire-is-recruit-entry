import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { HrController } from './hr.controller'
import { HrService } from './hr.service'
import { HrCleanupService } from './hr-cleanup.service'
import { StorageService } from '../storage/storage.service'
import { JwtStrategy } from './jwt.strategy'
import { jwtConstants } from './hr-auth.constants'

@Module({
  imports: [
    MulterModule.register({
      storage: require('multer').memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '24h' as const },
    }),
  ],
  controllers: [HrController],
  providers: [HrService, HrCleanupService, StorageService, JwtStrategy],
  exports: [HrService],
})
export class HrModule {}
