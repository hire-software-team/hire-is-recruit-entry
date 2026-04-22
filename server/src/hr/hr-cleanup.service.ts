import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { HrService } from './hr.service'

@Injectable()
export class HrCleanupService {
  private readonly logger = new Logger(HrCleanupService.name)

  constructor(private readonly hrService: HrService) {}

  /**
   * 每天凌晨 3 点清理孤儿文件
   */
  @Cron('0 3 * * *', {
    name: 'cleanupOrphanFiles',
  })
  async handleCronCleanup() {
    this.logger.log('定时任务触发: 开始清理孤儿文件...')
    try {
      const result = await this.hrService.cleanupOrphanFiles()
      this.logger.log(`孤儿文件清理完成: 扫描 ${result.scanned}, 删除 ${result.deleted}, 保留 ${result.kept}`)
    } catch (error) {
      this.logger.error('孤儿文件清理失败:', error)
    }
  }

  /**
   * 手动触发清理（用于测试或管理操作）
   */
  async manualCleanup() {
    this.logger.log('手动触发: 开始清理孤儿文件...')
    const result = await this.hrService.cleanupOrphanFiles()
    this.logger.log(`孤儿文件清理完成: 扫描 ${result.scanned}, 删除 ${result.deleted}, 保留 ${result.kept}`)
    return result
  }
}
