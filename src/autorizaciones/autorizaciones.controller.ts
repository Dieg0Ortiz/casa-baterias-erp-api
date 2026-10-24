import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../common/guards/jwt-auth.guard';
import {
  ConsultaAutorizacionesDto,
  ResolverAutorizacionDto,
  SolicitarAutorizacionDto,
} from './autorizaciones.dto';
import { AutorizacionesService } from './autorizaciones.service';

// Autorización a distancia (migración 040): la caja pide, el
// administrador aprueba o rechaza desde el panel.
@Controller('autorizaciones')
export class AutorizacionesController {
  constructor(private readonly autorizaciones: AutorizacionesService) {}

  @Post()
  solicitar(@Body() dto: SolicitarAutorizacionDto) {
    return this.autorizaciones.solicitar(dto);
  }

  @Get()
  listar(
    @CurrentUser() user: UsuarioAutenticado,
    @Query() dto: ConsultaAutorizacionesDto,
  ) {
    return this.autorizaciones.listar(user.perfil, dto);
  }

  // Cuántas esperan respuesta: el aviso del menú del panel.
  @Roles('administrador')
  @Get('pendientes')
  pendientes() {
    return this.autorizaciones.pendientes();
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.autorizaciones.detalle(id);
  }

  @Roles('administrador')
  @Post(':id/aprobar')
  aprobar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolverAutorizacionDto,
  ) {
    return this.autorizaciones.resolver(id, true, dto.nota);
  }

  @Roles('administrador')
  @Post(':id/rechazar')
  rechazar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolverAutorizacionDto,
  ) {
    return this.autorizaciones.resolver(id, false, dto.nota);
  }

  // La caja ya no la necesita.
  @Post(':id/retirar')
  retirar(@Param('id', ParseUUIDPipe) id: string) {
    return this.autorizaciones.retirar(id);
  }

  // La caja imprimió la reimpresión aprobada.
  @Post(':id/impresa')
  impresa(@Param('id', ParseUUIDPipe) id: string) {
    return this.autorizaciones.marcarImpresa(id);
  }
}
