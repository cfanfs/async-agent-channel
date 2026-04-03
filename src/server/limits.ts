export function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
