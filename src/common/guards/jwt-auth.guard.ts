import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { runWithContext } from '../context/request.context';
import { SupabaseService } from '../../supabase/supabase.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface PerfilUsuario {
  id: string;
  rol: 'trabajador' | 'administrador';
  sucursal_id: string | null;
  nombre_completo: string;
  activo: boolean;
  sucursal_nombre?: string | null;
}

export interface UsuarioAutenticado {
  userId: string;
  email: string;
  perfil: PerfilUsuario;
}

declare module 'express' {
  interface Request {
    user?: UsuarioAutenticado;
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    this.jwks = supabaseUrl
      ? createRemoteJWKSet(
          new URL(
            `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`,
          ),
        )
      : null;
  }

  private readonly jwks: JWTVerifyGetKey | null;

  /**
   * Verifica el JWT del usuario. Los access tokens reales de Supabase
   * (auth.signInWithPassword) son ES256 y se validan contra el JWKS del
   * proyecto. Se mantiene el secreto simétrico como fallback para tokens
   * HS256 (por ejemplo la anon key).
   */
  private async verifyToken(
    token: string,
  ): Promise<{ sub: string; email?: string }> {
    if (this.jwks) {
      try {
        const supabaseUrl = this.config
          .get<string>('SUPABASE_URL')!
          .replace(/\/$/, '');
        const { payload } = await jwtVerify(token, this.jwks, {
          algorithms: ['ES256'],
          issuer: `${supabaseUrl}/auth/v1`,
          audience: 'authenticated',
        });
        return {
          sub: payload.sub as string,
          email: (payload.email as string | undefined) ?? '',
        };
      } catch {
        // el token no es ES256; se intenta con el secreto simétrico abajo
      }
    }
    const legacy = await this.jwtService.verifyAsync<{
      sub: string;
      email?: string;
    }>(token, {
      secret: this.config.get<string>('SUPABASE_JWT_SECRET'),
    });
    return { sub: legacy.sub, email: legacy.email ?? '' };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token no proporcionado');
    }

    let payload: { sub: string; email?: string };
    try {
      payload = await this.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const userId = payload.sub;
    const email = payload.email ?? '';

    const perfil = await runWithContext({ token, userId, email }, async () => {
      const { data, error } = await this.supabase
        .getClient()
        .from('usuarios')
        .select('id, rol, sucursal_id, nombre_completo, activo, sucursales(nombre)')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        throw new UnauthorizedException(
          'No se pudo verificar el perfil del usuario',
        );
      }
      if (!data) return null;
      const sucursalObj = data.sucursales as { nombre: string } | null;
      const { sucursales: _ignorar, ...resto } = data;
      return {
        ...resto,
        sucursal_nombre: sucursalObj?.nombre ?? null,
      };
    });

    if (!perfil || !perfil.activo) {
      throw new UnauthorizedException('Usuario no activo o sin perfil');
    }

    request.user = { userId, email, perfil };
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
