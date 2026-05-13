// JWT 配置
// 密钥必须通过环境变量 JWT_SECRET 设置，fallback 仅用于本地开发
// 生产环境必须设置 JWT_SECRET，否则启动时警告
const fallbackSecret = 'hr-onboarding-dev-only-secret-DO-NOT-USE-IN-PROD'
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('⚠️ 生产环境必须设置 JWT_SECRET 环境变量！当前使用不安全的默认密钥')
}

export const jwtConstants = {
  secret: process.env.JWT_SECRET || fallbackSecret,
  expiresIn: '2h',
}
