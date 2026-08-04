import { Controller, Get } from '@nestjs/common';

@Controller('inventory')
export class InventoryController {
  @Get()
  estado() {
    return { modulo: 'inventory', estado: 'por-implementar' };
  }
}
