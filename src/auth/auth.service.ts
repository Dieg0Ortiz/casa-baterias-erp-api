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

    const perfil = await this.cargarPerfil(
      token,
      userId,
      data.user.email ?? email,
    );

    return {
      access_token: token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      perfil,
    };
  }

  /**
   * Renueva la sesión a partir del refresh token. El access token de Supabase
   * dura una hora: sin esto, el cliente queda inservible hasta volver a
   * iniciar sesión.
   */
  async refresh(refreshToken: string): Promise<LoginResult> {
    const { data, error } = await this.supabase
      .getAnonClient()
      .auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException(
        'Sesión expirada. Inicia sesión de nuevo.',
      );
    }

    const token = data.session.access_token;
    const perfil = await this.cargarPerfil(
      token,
      data.user.id,
      data.user.email ?? '',
    );

    return {
      access_token: token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      perfil,
    };
  }

  /**
   * Comprueba correo y clave de un administrador sin tocar la sesión
   * del usuario que está en caja.
   */
  verificarAdministrador(
    email: string,
    password: string,
  ): Promise<PerfilUsuario> {
    return this.conAdministrador(email, password, (perfil) =>
      Promise.resolve(perfil),
    );
  }

  /**
   * Ejecuta `accion` con la sesión del administrador que escribió su clave
   * en la caja: dentro de ella, `SupabaseService.getClient()` consulta como
   * ese administrador, de modo que las funciones de la base (que validan el
   * rol con auth.uid()) también comprueban la autorización.
   *
   * Al terminar cierra solo esa sesión (scope local). Con el cierre global de
   * antes, cada autorización desconectaba al administrador del panel y de
   * cualquier otro dispositivo.
   */
  async conAdministrador<T>(
    email: string,
    password: string,
    accion: (administrador: PerfilUsuario) => Promise<T>,
  ): Promise<T> {
    const cliente = this.supabase.clienteAnonNuevo();
    const { data, error } = await cliente.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException(
        'Correo o contraseña de autorización incorrectos',
      );
    }
    const token = data.session.access_token;
    const userId = data.user.id;
    const correo = data.user.email ?? email;
    try {
      const perfil = await this.cargarPerfil(token, userId, correo);
      if (perfil.rol !== 'administrador') {
        throw new UnauthorizedException(
          'Solo un administrador puede autorizar esta operación',
        );
      }
      return await runWithContext({ token, userId, email: correo }, () =>
        accion(perfil),
      );
    } finally {
      await cliente.auth.signOut({ scope: 'local' });
    }
  }

  private cargarPerfil(
    token: string,
    userId: string,
    email: string,
  ): Promise<PerfilUsuario> {
    return runWithContext({ token, userId, email }, async () => {
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
      } as PerfilUsuario;
    });
  }
}
