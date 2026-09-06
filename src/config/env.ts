import { validateEnv, type Env } from './validation';

let validatedEnv: Env | null = null;

export function getEnv(): Env {
  if (!validatedEnv) {
    validatedEnv = validateEnv(process.env);
  }
  return validatedEnv;
}

export type { Env };
