import { Controller, Get } from '@nestjs/common';

@Controller('admin')
export class AdminController {
  @Get()
  estado() {
    return { modulo: 'admin', estado: 'por-implementar' };
  }
}
