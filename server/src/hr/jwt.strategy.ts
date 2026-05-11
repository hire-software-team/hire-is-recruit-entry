import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { jwtConstants } from './hr-auth.constants'

export interface JwtPayload {
  sub: number
  username: string
  role: string
  hrContacts: string[]
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    })
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.username) {
      throw new UnauthorizedException('无效的Token')
    }
    return {
      userId: payload.sub,
      adminId: payload.sub,
      username: payload.username,
      role: payload.role || 'level1',
      hrContacts: payload.hrContacts || [],
    }
  }
}
