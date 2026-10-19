type JsonBodyRequest = {
  json(): Promise<unknown>;
};

export async function readJsonBody(request: JsonBodyRequest, fallback: unknown = null) {
  try {
    return await request.json();
  } catch {
    return fallback;
  }
}
