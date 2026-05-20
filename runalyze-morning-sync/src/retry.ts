export type RetryOptions = {
  attempts?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleep?: (delayMs: number) => Promise<void>;
};

const transientCodes = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET"
]);

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const backoffMultiplier = Math.max(1, options.backoffMultiplier ?? 2);
  const sleep = options.sleep ?? wait;
  const shouldRetry = options.shouldRetry ?? isTransientNetworkError;
  let delayMs = Math.max(0, options.initialDelayMs ?? 1_000);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      options.onRetry?.(error, attempt, delayMs);
      if (delayMs > 0) await sleep(delayMs);
      delayMs = Math.round(delayMs * backoffMultiplier);
    }
  }

  throw new Error("Retry loop ended unexpectedly.");
}

export function isTransientNetworkError(error: unknown): boolean {
  const status = statusField(error);
  if (status !== undefined && (status === 429 || status >= 500)) return true;

  const messages = errorMessages(error).join(" ");
  if (/\bfetch failed\b/i.test(messages)) return true;
  if (/\bnetwork\b/i.test(messages)) return true;
  if (/\btimeout\b|\btimed out\b/i.test(messages)) return true;
  if (/\bHTTP (429|5\d\d)\b/i.test(messages)) return true;

  return errorCodes(error).some((code) => transientCodes.has(code));
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function statusField(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const status = (value as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function errorMessages(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const error = value as { message?: unknown; cause?: unknown };
  const messages = typeof error.message === "string" ? [error.message] : [];
  return messages.concat(errorMessages(error.cause));
}

function errorCodes(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const error = value as { code?: unknown; cause?: unknown };
  const codes = typeof error.code === "string" ? [error.code] : [];
  return codes.concat(errorCodes(error.cause));
}
