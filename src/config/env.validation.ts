import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString, validateSync } from 'class-validator';

class EnvVariables {
  @IsString()
  NODE_ENV: string;

  @IsString()
  PORT: string;

  @IsString()
  SUPABASE_URL: string;

  @IsString()
  SUPABASE_ANON_KEY: string;

  @IsString()
  SUPABASE_JWT_SECRET: string;

  @IsOptional()
  @IsString()
  SUPABASE_SERVICE_ROLE_KEY: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Variables de entorno inválidas: ${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('; ')}`,
    );
  }

  return validated;
}
