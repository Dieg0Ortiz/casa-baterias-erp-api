import { Controller, Get } from '@nestjs/common';

@Controller('sales')
export class SalesController {
  @Get()
  estado() {
    return { modulo: 'sales', estado: 'por-implementar' };
  }
}
