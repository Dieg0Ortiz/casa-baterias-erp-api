import { Module } from '@nestjs/common';
import { CascosBodegaController, CascosController } from './cascos.controller';
import { CascosService } from './cascos.service';

@Module({
  controllers: [CascosBodegaController, CascosController],
  providers: [CascosService],
  exports: [CascosService],
})
export class CascosModule {}
