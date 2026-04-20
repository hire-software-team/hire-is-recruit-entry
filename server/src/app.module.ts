import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { HrModule } from '@/hr/hr.module';

@Module({
  imports: [HrModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
