export const jwtConstants = {
  secret: process.env.JWT_SECRET || 'hr-onboarding-jwt-secret-key-2024',
  expiresIn: '24h',
} as const
