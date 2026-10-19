export function requestSignal(timeoutMs: number, signal?: AbortSignal) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Request timeout must be a positive integer.");
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}
