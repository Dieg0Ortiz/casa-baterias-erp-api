# API — NestJS

Servicio central del ERP. Un servicio, módulos por dominio. La seguridad se
aplica en dos capas:

1. **Guards de NestJS** (`JwtAuthGuard` + `RolesGuard`) validan el token y el
   rol del usuario en cada endpoint.
2. **RLS en Supabase**: el API reenvía el JWT del usuario en cada consulta,
   de modo que las políticas de fila de la base también se aplican. Nunca se
   usa `service_role` para operaciones de negocio.

## Requisitos

- Node 24+
- Proyecto Supabase con las migraciones de `../backend` aplicadas

## Arranque local

```bash
npm install
cp .env.example .env   # llenar URL, anon key y JWT secret de Supabase
npm run start:dev
```

Servidor en `http://localhost:3000`. Rutas bajo `/api/v1`.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | Anon key pública |
| `SUPABASE_JWT_SECRET` | Secreto JWT de Supabase (Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo para crear usuarios (admin API). No exponer. |
| `CORS_ORIGINS` | Orígenes permitidos separados por coma |

## Seguridad aplicada

- `helmet` (cabeceras HTTP seguras)
- Rate limiting global (100 req/min por IP)
- `ValidationPipe` con `whitelist` (descarta campos no declarados)
- Tokens verificados con el secreto JWT de Supabase
- Consultas a Supabase siempre como el usuario autenticado (RLS vigente)
- `es_administrador()` / `sucursal_actual()` como helpers de autorización
  del lado de la base

## Módulos

- `auth` — login contra Supabase Auth, perfil del usuario
- `catalog` — marcas y productos (Fase 3)
- `inventory` — inventario y transferencias (Fases 4-5)
- `sales` — ventas y cancelación (Fase 6)
- `cash` — cortes de caja (Fase 7)
- `admin` — dashboard consolidado (Fase 8)

## Pruebas

```bash
npm run test        # unitarias
npm run test:e2e    # e2e (requiere .env con credenciales reales)
```
