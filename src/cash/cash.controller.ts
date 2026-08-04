import { Controller, Get } from '@nestjs/common';

@Controller('cash')
export class CashController {
  @Get()
  estado() {
    return { modulo: 'cash', estado: 'por-implementar' };
  }
}
