import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CatalogService } from './catalog.service';
import {
  ActualizarMarcaDto,
  ActualizarPrecioDto,
  ActualizarProductoDto,
  CrearMarcaDto,
  CrearProductoDto,
} from './catalog.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ------------------------------------------------------------------
  // Sucursales
  // ------------------------------------------------------------------

  @Get('sucursales')
  listarSucursales() {
    return this.catalogService.listarSucursales();
  }

  @Get('marcas')
  listarMarcas() {
    return this.catalogService.listarMarcas();
  }

  @Post('marcas')
  @Roles('administrador')
  crearMarca(@Body() dto: CrearMarcaDto) {
    return this.catalogService.crearMarca(dto);
  }

  @Patch('marcas/:id')
  @Roles('administrador')
  actualizarMarca(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarMarcaDto,
  ) {
    return this.catalogService.actualizarMarca(id, dto);
  }

  @Delete('marcas/:id')
  @Roles('administrador')
  eliminarMarca(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.eliminarMarca(id);
  }

  // ------------------------------------------------------------------
  // Productos
  // ------------------------------------------------------------------

  @Get('productos')
  listarProductos() {
    return this.catalogService.listarProductos();
  }

  @Post('productos')
  crearProducto(@Body() dto: CrearProductoDto) {
    return this.catalogService.crearProducto(dto);
  }

  @Patch('productos/:id')
  @Roles('administrador')
  actualizarProducto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarProductoDto,
  ) {
    return this.catalogService.actualizarProducto(id, dto);
  }

  @Patch('productos/:id/precio')
  @Roles('administrador')
  actualizarPrecio(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarPrecioDto,
  ) {
    return this.catalogService.actualizarPrecio(
      id,
      dto.precio,
      dto.precio_2,
      dto.precio_3,
    );
  }

  @Post('productos/:id/baja')
  @Roles('administrador')
  darDeBaja(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.darDeBaja(id);
  }
}
