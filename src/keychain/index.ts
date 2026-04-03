import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

const execFileAsync = promisify(execFile);

const SERVICE_PREFIX = "aac";

function serviceName(key: string): string {
  return `${SERVICE_PREFIX}-${key}`;
}

export async function getCredential(
  key: string,
  account: string
): Promise<string | null> {
  if (platform() === "darwin") {
    return getMacOS(serviceName(key), account);
  }
  if (platform() === "linux") {
    return getLinux(serviceName(key), account);
  }
  throw new Error(`Keychain not supported on ${platform()}`);
}

export async function setCredential(
  key: string,
  account: string,
  password: string
): Promise<void> {
  if (platform() === "darwin") {
    return setMacOS(serviceName(key), account, password);
  }
  if (platform() === "linux") {
    return setLinux(serviceName(key), account, password);
  }
  throw new Error(`Keychain not supported on ${platform()}`);
}

export async function deleteCredential(
  key: string,
  account: string
): Promise<void> {
  if (platform() === "darwin") {
    return deleteMacOS(serviceName(key), account);
  }
  if (platform() === "linux") {
    return deleteLinux(serviceName(key), account);
  }
  throw new Error(`Keychain not supported on ${platform()}`);
}

// --- macOS Keychain ---

async function getMacOS(
  service: string,
  account: string
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-a",
      account,
      "-s",
      service,
      "-w",
    ]);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function setMacOS(
  service: string,
  account: string,
  password: string
): Promise<void> {
  // Delete existing entry first (add-generic-password fails if it exists)
  await deleteMacOS(service, account).catch(() => {});
  await execFileAsync("security", [
    "add-generic-password",
    "-a",
    account,
    "-s",
    service,
    "-w",
    password,
  ]);
}

async function deleteMacOS(service: string, account: string): Promise<void> {
  await execFileAsync("security", [
    "delete-generic-password",
    "-a",
    account,
    "-s",
    service,
  ]);
}

// --- Linux secret-tool ---

async function getLinux(
  service: string,
  account: string
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("secret-tool", [
      "lookup",
      "service",
      service,
      "account",
      account,
    ]);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function setLinux(
  service: string,
  account: string,
  password: string
): Promise<void> {
  const child = execFileAsync("secret-tool", [
    "store",
    "--label",
    `${service} (${account})`,
    "service",
    service,
    "account",
    account,
  ]);
  child.child.stdin?.write(password);
  child.child.stdin?.end();
  await child;
}

async function deleteLinux(service: string, account: string): Promise<void> {
  await execFileAsync("secret-tool", [
    "clear",
    "service",
    service,
    "account",
    account,
  ]);
}
