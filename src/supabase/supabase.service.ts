import { Injectable, OnModuleInit, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getRequestContext } from '../common/context/request.context';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly url: string;
  private readonly anonKey: string;
  private readonly serviceRoleKey: string | undefined;

  private anonClient: SupabaseClient<any, any, any, any, any>;
  private serviceClient: SupabaseClient<any, any, any, any, any> | undefined;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.get<string>('SUPABASE_URL')!;
    this.anonKey = this.config.get<string>('SUPABASE_ANON_KEY')!;
    this.serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
  }

  onModuleInit() {
    this.anonClient = createClient(this.url, this.anonKey);
    if (this.serviceRoleKey) {
      this.serviceClient = createClient(this.url, this.serviceRoleKey);
    }
  }

  isConfigured(): boolean {
    return (
      !this.url.startsWith('https://TU-PROYECTO.supabase.co') &&
      !this.anonKey.startsWith('tu-anon-key')
    );
  }

  /**
   * Cliente autenticado como el usuario actual de la petición.
   * Supabase aplica Row Level Security con el token del usuario.
   * Es el cliente por defecto para consultas de negocio.
   */
  getClient(): SupabaseClient<any, any, any, any, any> {
    const ctx = getRequestContext();
    if (!ctx?.token) {
      throw new ForbiddenException('No hay sesión de usuario activa');
    }
    return createClient(this.url, this.anonKey, {
      global: { headers: { Authorization: `Bearer ${ctx.token}` } },
    });
  }

  /**
   * Cliente con la llave anon (sin sesión de usuario).
   * Solo para operaciones públicas que no requieren identidad.
   */
  getAnonClient(): SupabaseClient<any, any, any, any, any> {
    return this.anonClient;
  }

  /** Cliente nuevo, sin sesión guardada. Sirve para comprobar una clave
   *  sin reemplazar la sesión del cajero que está usando el API. */
  clienteAnonNuevo(): SupabaseClient<any, any, any, any, any> {
    return createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /**
   * Cliente con service role (salta RLS). SOLO para operaciones
   * internas de servidor (ej. creación de usuarios en auth.admin).
   * Nunca exponer esta llave al cliente.
   */
  getServiceClient(): SupabaseClient<any, any, any, any, any> {
    if (!this.serviceClient) {
      throw new ForbiddenException(
        'Service role key no configurada en el servidor',
      );
    }
    return this.serviceClient;
  }
}
