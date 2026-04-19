export type ApiHeaders = Record<string, string>;

export const getUserId = (): string => "dev-user";

export const getSpaceId = (): string => localStorage.getItem("ddup.spaceId") || "";

export const buildHeaders = (extra?: ApiHeaders): ApiHeaders => {
  const headers: ApiHeaders = { "X-User-Id": getUserId() };
  const spaceId = getSpaceId();
  if (spaceId) headers["X-Space-Id"] = spaceId;
  return { ...headers, ...(extra || {}) };
};

export async function apiGet<T>(url: string): Promise<T> {
  const resp = await fetch(url, { headers: buildHeaders() });
  if (!resp.ok) throw new Error(`GET ${url} failed: ${resp.status}`);
  return (await resp.json()) as T;
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error(`POST ${url} failed: ${resp.status}`);
  return (await resp.json()) as T;
}

