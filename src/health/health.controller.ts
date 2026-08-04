import { Controller, Get } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  @Public()
  async check() {
    const supabaseConfigurado = this.supabase.isConfigured();

    let database: 'conectada' | 'sin-configurar' = 'sin-configurar';
    if (supabaseConfigurado) {
      const { error } = await this.supabase
        .getAnonClient()
        .from('_health')
        .select('*')
        .limit(1);
      database = error ? 'sin-configurar' : 'conectada';
    }

    return {
      status: 'ok',
      servicio: 'erp-baterias-api',
      database,
    };
  }
}
