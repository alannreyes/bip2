import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';

// Entities
import { ApiKey } from './entities/api-key.entity';

// Services
import { ApiKeyService } from './services/api-key.service';

// Guards
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { GlobalAuthGuard } from './guards/global-auth.guard';

// Controllers
import { ApiKeysController } from './controllers/api-keys.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'bip2-default-secret-change-in-production',
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') || '7d') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ApiKeysController],
  providers: [
    ApiKeyService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    GlobalAuthGuard,
    // Guard global - se activa según AUTH_ENABLED y AUTH_MODE
    {
      provide: APP_GUARD,
      useClass: GlobalAuthGuard,
    },
  ],
  exports: [JwtModule, PassportModule, JwtAuthGuard, RolesGuard, GlobalAuthGuard, ApiKeyService],
})
export class AuthModule {}
