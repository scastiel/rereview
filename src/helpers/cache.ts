export type CacheResult<T> = { date: string; result: T };

export const decorateFunctionWithCache = <P extends unknown[], R>(
  fn: (...params: P) => Promise<R>,
  keyForParams: (...params: P) => Deno.KvKey | Promise<Deno.KvKey>,
  cacheDuration = 1000 * 20,
): ((...params: P) => Promise<R>) => {
  return async (...params: P) => {
    const kv = await Deno.openKv();
    const key = await keyForParams(...params);

    const cachedResult = await kv.get<CacheResult<R>>(key);
    if (cachedResult.value) {
      const date = new Date(cachedResult.value.date);
      const age = Date.now() - date.valueOf();
      if (age < cacheDuration) {
        return cachedResult.value.result;
      }
    }

    const result = await fn(...params);
    await kv.set(key, { date: new Date().toISOString(), result });
    return result;
  };
};

export const hash = async (message: string) => {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
};
