import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CreditosController } from './creditos.controller';
import { CreditosService } from './creditos.service';

@Module({
  imports: [SupabaseModule],
  controllers: [CreditosController],
  providers: [CreditosService],
  exports: [CreditosService],
})
export class CreditosModule {}
