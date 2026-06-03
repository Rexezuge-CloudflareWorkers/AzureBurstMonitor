#!/usr/bin/env tsx

import { execFileSync } from 'child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { applyEdits, modify, parse } from 'jsonc-parser';

const CONFIG_PATH = join(process.cwd(), 'wrangler.jsonc');
const TEMPLATE_PATH = join(process.cwd(), 'apps/api/wrangler.template.jsonc');
const DEFAULT_HEX_ID = '00000000000000000000000000000000';
const DEFAULT_SECRET_STORE_NAME = 'default';

interface WranglerConfig {
  secrets_store_secrets?: Array<{
    binding?: string;
    store_id?: string;
    secret_name?: string;
  }>;
}

interface SecretStore {
  name: string;
  id: string;
}

function runWrangler(args: string[]): string {
  try {
    return execFileSync('pnpm', ['exec', 'wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error: unknown) {
    const maybeProcessError = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    const stdout = maybeProcessError.stdout ? maybeProcessError.stdout.toString() : '';
    const stderr = maybeProcessError.stderr ? maybeProcessError.stderr.toString() : '';
    throw new Error(`Command failed: pnpm exec wrangler ${args.join(' ')}\n${stdout}${stderr || maybeProcessError.message || ''}`);
  }
}

function readConfig(): { content: string; config: WranglerConfig } {
  const content = readFileSync(CONFIG_PATH, 'utf8');
  return { content, config: parse(content) as WranglerConfig };
}

function writeConfigValue(content: string, path: Array<string | number>, value: string): string {
  const edits = modify(content, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } });
  return applyEdits(content, edits);
}

function prepareConfigFile(): void {
  const dumpedConfig = process.env.WRANGLER_JSONC;
  if (dumpedConfig?.trim()) {
    writeFileSync(CONFIG_PATH, dumpedConfig.endsWith('\n') ? dumpedConfig : `${dumpedConfig}\n`);
    console.log('Wrote wrangler.jsonc from WRANGLER_JSONC repository variable.');
    return;
  }

  copyFileSync(TEMPLATE_PATH, CONFIG_PATH);
  console.log('WRANGLER_JSONC is empty; copied apps/api/wrangler.template.jsonc to wrangler.jsonc.');
}

function parseSecretStoresTable(output: string): SecretStore[] {
  const stores: SecretStore[] = [];
  for (const line of output.split('\n')) {
    if (!line.includes('│')) continue;
    const cells = line
      .split('│')
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cells.length < 2 || cells[0] === 'Name' || cells[0].includes('─')) continue;
    const [name, id] = cells;
    if (/^[a-f0-9]{32}$/i.test(id)) stores.push({ name, id });
  }
  return stores;
}

function listSecretStores(): SecretStore[] {
  const output = runWrangler(['secrets-store', 'store', 'list', '--remote']);
  try {
    const parsed = JSON.parse(output) as unknown;
    if (Array.isArray(parsed)) return parsed as SecretStore[];
  } catch {
    return parseSecretStoresTable(output);
  }
  return parseSecretStoresTable(output);
}

function ensureSecretStore(): string {
  let stores = listSecretStores();
  if (stores.length > 0) {
    const store = stores.find((candidate) => candidate.name === DEFAULT_SECRET_STORE_NAME) ?? stores[0];
    return store.id;
  }

  console.log(`Creating Secrets Store: ${DEFAULT_SECRET_STORE_NAME}`);
  const output = runWrangler(['secrets-store', 'store', 'create', DEFAULT_SECRET_STORE_NAME, '--remote']);
  const createdStoreId = output.match(/ID:\s*([a-f0-9]{32})/i)?.[1];
  if (createdStoreId) return createdStoreId;

  stores = listSecretStores();
  const store = stores.find((candidate) => candidate.name === DEFAULT_SECRET_STORE_NAME) ?? stores[0];
  if (!store?.id) throw new Error(`Unable to discover Secrets Store ID for ${DEFAULT_SECRET_STORE_NAME}.`);
  return store.id;
}

function provisionWranglerResources(): void {
  let { content, config } = readConfig();

  const secretStoreIndexes = (config.secrets_store_secrets ?? [])
    .map((secret, index) => ({ secret, index }))
    .filter(({ secret }) => secret.store_id === DEFAULT_HEX_ID);

  if (secretStoreIndexes.length > 0) {
    const storeId = ensureSecretStore();
    console.log(`Using Secrets Store: ${storeId}`);
    for (const { index } of secretStoreIndexes) {
      content = writeConfigValue(content, ['secrets_store_secrets', index, 'store_id'], storeId);
    }
  }

  writeFileSync(CONFIG_PATH, content.endsWith('\n') ? content : `${content}\n`);
}

prepareConfigFile();
provisionWranglerResources();
console.log('Wrangler configuration is ready.');
