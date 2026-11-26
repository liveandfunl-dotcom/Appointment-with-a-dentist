import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RateLimiter } from './rate-limiter';
import { SessionGuard } from './session.guard';

/** Сессии, magic link, вход по паролю, rate limit и глобальный guard ролей. */
@Module({
  controllers: [AuthController],
  providers: [AuthService, RateLimiter, { provide: APP_GUARD, useClass: SessionGuard }],
  exports: [AuthService],
})
export class AuthModule {}
