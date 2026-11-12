// Vault values for the functions, read through wallet_vault_get (service_role, an allow-list of four names:
// wallet_sync_secret, wallet_apple_key, wallet_apple_key_next, wallet_apple_cert) and written through wallet_vault_put
// (the Apple key and certificate only). Values stay in this worker's memory for a few minutes and are never logged,
// returned or printed (plan 4.6).
import { rpc } from "./db.ts";

const cache = new Map<string, { value: string | null; at: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function vaultGet(name: string, fresh = false): Promise<string | null> {
  const hit = cache.get(name);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await rpc<string | null>("wallet_vault_get", { p_name: name });
  cache.set(name, { value: value ?? null, at: Date.now() });
  return value ?? null;
}

export async function vaultPut(name: string, value: string): Promise<void> {
  await rpc<boolean>("wallet_vault_put", { p_name: name, p_value: value });
  cache.set(name, { value, at: Date.now() });
}

export function vaultForget(): void {
  cache.clear();
}
