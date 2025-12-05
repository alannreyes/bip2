import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorador para marcar endpoints como públicos (sin autenticación)
 * Usar en controllers o métodos: @Public()
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
