import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { HrModule } from '@/hr/hr.module';

@Module({
  imports: [ScheduleModule.forRoot(), HrModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
