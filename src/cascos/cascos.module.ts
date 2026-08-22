import { Module } from '@nestjs/common';
import { CascosController } from './cascos.controller';
import { CascosService } from './cascos.service';

@Module({
  controllers: [CascosController],
  providers: [CascosService],
  exports: [CascosService],
})
export class CascosModule {}
