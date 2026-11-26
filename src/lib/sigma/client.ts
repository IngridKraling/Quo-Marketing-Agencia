import "server-only";

/**
 * Cliente de la API Sigma v10.
 * URL: https://<host>/<idCliente>/api/v10/<EndPoint>, auth con header X-Auth-Token.
 * Reintenta 429 (X-Retry-After-ms) y 503 (Retry-After). Los 4xx/422 no se reintentan:
 * reintentar sin cambios da el mismo resultado.
 */

export class SigmaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Header X-Sigma-Error-Kind: business | data | server */
    readonly kind: string | null,
    readonly body: string,
  ) {
    super(message);
    this.name = "SigmaError";
  }
}

type SigmaConfig = { baseUrl: string; token: string };

export function sigmaConfig(): SigmaConfig {
  const host = process.env.SIGMA_HOST ?? "sigma.sig2k.com";
  const idCliente = process.env.SIGMA_ID_CLIENTE;
  const token = process.env.SIGMA_TOKEN;
  if (!idCliente || !token) throw new Error("Faltan SIGMA_ID_CLIENTE o SIGMA_TOKEN");
  return { baseUrl: `https://${host}/${idCliente}/api/v10`, token };
}

const MAX_INTENTOS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function esperaReintento(res: Response, intento: number): number {
  const ms = Number(res.headers.get("X-Retry-After-ms"));
  if (ms > 0) return ms;
  const s = Number(res.headers.get("Retry-After"));
  if (s > 0) return s * 1000;
  return 500 * 2 ** intento;
}

/** Extrae el mensaje de error de los distintos formatos de Sigma. */
function mensajeDe(body: string): string {
  try {
    const j = JSON.parse(body);
    return j.responseText ?? j.message ?? body;
  } catch {
    return body;
  }
}

export async function sigmaRequest<T>(
  endpoint: string,
  init: { method?: "GET" | "POST"; query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
  config: SigmaConfig = sigmaConfig(),
): Promise<T> {
  const url = new URL(`${config.baseUrl}/${endpoint}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  for (let intento = 0; ; intento++) {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "X-Auth-Token": config.token,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });

    if ((res.status === 429 || res.status === 503) && intento < MAX_INTENTOS - 1) {
      await sleep(esperaReintento(res, intento));
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      throw new SigmaError(
        `Sigma ${endpoint} ${res.status}: ${mensajeDe(text)}`,
        res.status,
        res.headers.get("X-Sigma-Error-Kind"),
        text,
      );
    }
    return (text ? JSON.parse(text) : null) as T;
  }
}

/** Recorre todas las páginas de un Export* paginable. */
export async function sigmaExportAll<T>(
  endpoint: string,
  query: Record<string, string | number | boolean | undefined> = {},
  pagesize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const rows = await sigmaRequest<T[]>(endpoint, { query: { ...query, page, pagesize } });
    out.push(...(rows ?? []));
    if (!rows || rows.length < pagesize) return out;
  }
}
