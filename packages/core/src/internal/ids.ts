import { randomUUID } from 'node:crypto';

/** Convert a human label into a stable slug used as a default id. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'node';
}

/** Generate a stable, unique id for a single flow execution. */
export function generateRunId(): string {
  return `run_${randomUUID()}`;
}

/**
 * Deterministic, non-cryptographic 32-bit FNV-1a hash rendered as hex.
 * Sufficient to detect flow-structure changes across deploys.
 */
export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
