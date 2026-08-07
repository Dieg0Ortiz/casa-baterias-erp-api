import {
  Body,
  Controller,
  Get,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { InventoryService } from './inventory.service';
import {
  ReabastecerInventarioDto,
  TransferirInventarioDto,
} from './transferencia.dto';

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

  @Post('transferencias')
  @Roles('administrador')
  transferir(@Body() dto: TransferirInventarioDto) {
    return this.inventoryService.transferir(dto);
  }

  @Get('transferencias')
  @Roles('administrador')
  listarTransferencias() {
    return this.inventoryService.listarTransferencias();
  }

  @Post('reabastecer')
  @Roles('administrador')
  reabastecer(@Body() dto: ReabastecerInventarioDto) {
    return this.inventoryService.reabastecer(dto);
  }
}
