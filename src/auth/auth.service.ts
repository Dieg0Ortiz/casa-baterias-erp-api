import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { runWithContext } from '../common/context/request.context';
import type { PerfilUsuario } from '../common/guards/jwt-auth.guard';

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  expires_at: number | undefined;
  perfil: PerfilUsuario;
}

@Injectable()
export class AuthService {
  constructor(private readonly supabase: SupabaseService) {}

  async login(email: string, password: string): Promise<LoginResult> {
    if (!this.supabase.isConfigured()) {
      throw new BadRequestException(
        'Supabase no está configurado. Revisa las variables de entorno.',
      );
    }

    const { data, error } = await this.supabase
      .getAnonClient()
      .auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const token = data.session.access_token;
    const userId = data.user.id;

    const perfil = await runWithContext(
      { token, userId, email: data.user.email ?? email },
      async () => {
        const { data: perfilData, error: perfilError } = await this.supabase
          .getClient()
          .from('usuarios')
          .select('id, rol, sucursal_id, nombre_completo, activo, sucursales(nombre)')
          .eq('id', userId)
          .maybeSingle();

        if (perfilError || !perfilData || !perfilData.activo) {
          throw new UnauthorizedException(
            'Usuario sin perfil asignado o desactivado. Contacta al administrador.',
          );
        }

        // Aplanar el JOIN: extraer nombre de la sucursal al nivel raíz.
        const sucursalesRelacion = perfilData.sucursales as unknown as
          | { nombre: string }
          | { nombre: string }[]
          | null;
        const sucursalObj = Array.isArray(sucursalesRelacion)
          ? sucursalesRelacion[0]
          : sucursalesRelacion;
        const { sucursales: _ignorar, ...resto } = perfilData;
        return {
          ...resto,
          sucursal_nombre: sucursalObj?.nombre ?? null,
        };
      },
    );

    return {
      access_token: token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      perfil,
    };
  }
}
