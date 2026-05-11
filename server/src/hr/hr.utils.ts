/**
 * HR 模块工具函数
 */

/**
 * 手机号脱敏：138****1234
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

/**
 * 身份证号脱敏：110***********1234
 */
export function maskIdCard(idCard: string): string {
  if (!idCard || idCard.length < 8) return idCard
  return idCard.replace(/(\d{3})\d+(\d{4})/, '$1***********$2')
}

/**
 * 日志脱敏：自动替换手机号和身份证号
 */
export function maskSensitive(data: string): string {
  let result = data
  // 脱敏手机号
  result = result.replace(/1[3-9]\d{9}/g, (match) => maskPhone(match))
  // 脱敏身份证号
  result = result.replace(/[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, (match) => maskIdCard(match))
  return result
}

/**
 * 简易内存限流器
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map()
  private lastCleanup = Date.now()

  /**
   * 检查是否超过限流
   * @param key 限流键（如 IP 地址）
   * @param limit 时间窗口内最大请求数
   * @param windowMs 时间窗口（毫秒）
   * @returns true 表示被限流，false 表示放行
   */
  isRateLimited(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now()
    const requests = this.requests.get(key) || []

    // 清除过期记录
    const validRequests = requests.filter(time => now - time < windowMs)

    if (validRequests.length >= limit) {
      this.requests.set(key, validRequests)
      return true
    }

    validRequests.push(now)
    this.requests.set(key, validRequests)

    // 定期清理所有过期 key（每5分钟），防止内存泄漏
    if (now - this.lastCleanup > 5 * 60 * 1000) {
      for (const [k, timestamps] of this.requests) {
        const filtered = timestamps.filter(time => now - time < windowMs)
        if (filtered.length === 0) {
          this.requests.delete(k)
        } else {
          this.requests.set(k, filtered)
        }
      }
      this.lastCleanup = now
    }

    return false
  }

  /**
   * 重置某个 key 的限流计数（如登录成功后清除）
   */
  reset(key: string): void {
    this.requests.delete(key)
  }
}
