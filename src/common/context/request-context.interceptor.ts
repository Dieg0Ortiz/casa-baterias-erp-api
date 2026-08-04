import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { defer, Observable } from 'rxjs';
import { runWithContext } from './request.context';

/**
 * Establece el contexto ALS de la petición (token del usuario) para que
 * SupabaseService.getClient() inyecte el JWT del usuario en Supabase y RLS
 * aplique en las consultas de negocio. Corre después de JwtAuthGuard (que
 * puebla request.user). `defer` garantiza que el manejador se ejecute
 * dentro del contexto AsyncLocalStorage.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    const token = this.extractToken(request);

    if (!token || !user?.userId) {
      return next.handle();
    }

    return defer(() =>
      runWithContext({ token, userId: user.userId, email: user.email }, () =>
        next.handle(),
      ),
    );
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
