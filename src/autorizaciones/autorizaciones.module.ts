import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { AutorizacionesController } from './autorizaciones.controller';
import { AutorizacionesService } from './autorizaciones.service';

@Module({
  imports: [SalesModule],
  controllers: [AutorizacionesController],
  providers: [AutorizacionesService],
})
export class AutorizacionesModule {}
