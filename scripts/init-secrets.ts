#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'jsonc-parser';

interface WranglerConfig {
  secrets_store_secrets?: Array<{
    binding: string;
    store_id: string;
    secret_name: string;
  }>;
}

const SECRET_NAME_TO_ENV_VAR: Record<string, string> = {
  'azure-burst-monitor-tenant-id': 'AZURE_TENANT_ID',
  'azure-burst-monitor-client-id': 'AZURE_CLIENT_ID',
  'azure-burst-monitor-client-secret': 'AZURE_CLIENT_SECRET',
  'azure-burst-monitor-subscription-id': 'AZURE_SUBSCRIPTION_ID',
};

function exec(command: string): string {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' });
  } catch (error: unknown) {
    if (error instanceof Error) throw new Error(`Command failed: ${command}\n${error.message}`);
    throw new Error(`Command failed: ${command}\nUnknown error.`);
  }
}

function parseWranglerConfig(): WranglerConfig {
  const configPath = join(process.cwd(), 'wrangler.jsonc');
  const content = readFileSync(configPath, 'utf8');
  return parse(content);
}

function checkSecret(storeId: string, secretName: string): boolean {
  try {
    const output = exec(`pnpm exec wrangler secrets-store secret list ${storeId} --remote`);
    return output.includes(secretName);
  } catch {
    return false;
  }
}

function createSecret(storeId: string, secretName: string, secretValue: string): void {
  exec(`echo "${secretValue}" | pnpm exec wrangler secrets-store secret create ${storeId} --name ${secretName} --scopes workers --remote`);
}

function main() {
  console.log('Initializing Cloudflare secrets...');
  const config = parseWranglerConfig();
  for (const secret of config.secrets_store_secrets ?? []) {
    if (!checkSecret(secret.store_id, secret.secret_name)) {
      const envVar = SECRET_NAME_TO_ENV_VAR[secret.secret_name];
      if (!envVar) throw new Error(`Unknown secret: ${secret.secret_name}`);
      const secretValue = process.env[envVar];
      if (!secretValue) throw new Error(`Missing required environment variable: ${envVar} (for secret: ${secret.secret_name})`);
      createSecret(secret.store_id, secret.secret_name, secretValue);
      console.log(`Created secret: ${secret.secret_name}`);
    } else {
      console.log(`Secret ${secret.secret_name} already exists`);
    }
  }
  console.log('Secret initialization complete');
}

main();
