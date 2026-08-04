import { Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  listar(
    @Query('sucursal_id', new ParseUUIDPipe({ optional: true }))
    sucursalId?: string,
  ) {
    return this.inventoryService.listarInventario(sucursalId);
  }
}
