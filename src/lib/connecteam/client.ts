import "server-only";
import { z } from "zod";

/**
 * Cliente de Connecteam para traer horas fichadas (Time Clock → time activities).
 * Auth: header X-API-KEY. Base: https://api.connecteam.com (Australia: api-au).
 *
 * ⚠️ Las rutas y formas de respuesta están tomadas de la API Reference pública y no se
 * pudieron verificar contra una cuenta real todavía. Los esquemas son permisivos
 * (Connecteam agrega campos sin aviso) y el mapeo está aislado acá para ajustarlo fácil.
 */

const BASE = process.env.CONNECTEAM_BASE_URL ?? "https://api.connecteam.com";

async function ctGet(path: string, query: Record<string, string | number> = {}): Promise<unknown> {
  const key = process.env.CONNECTEAM_API_KEY;
  if (!key) throw new Error("Falta CONNECTEAM_API_KEY");
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));

  for (let intento = 0; ; intento++) {
    const res = await fetch(url, { headers: { "X-API-KEY": key, Accept: "application/json" }, cache: "no-store" });
    if (res.status === 429 && intento < 3) {
      const s = Number(res.headers.get("Retry-After")) || 2 ** intento;
      await new Promise((r) => setTimeout(r, s * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Connecteam ${path} ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

const timeClocksSchema = z.object({
  data: z.object({ timeClocks: z.array(z.looseObject({ id: z.coerce.number(), name: z.string().optional() })) }),
});

const shiftSchema = z.looseObject({
  id: z.coerce.string(),
  start: z.looseObject({ timestamp: z.number() }),
  end: z.looseObject({ timestamp: z.number() }).nullish(),
  jobId: z.coerce.string().nullish(),
});

const activitiesSchema = z.object({
  data: z.object({
    timeActivitiesByUsers: z.array(z.looseObject({ userId: z.coerce.number(), shifts: z.array(shiftSchema).default([]) })),
  }),
});

export type TurnoConnecteam = {
  activityId: string;
  userId: number;
  jobId: string | null;
  inicio: Date;
  fin: Date | null;
  horas: number;
};

export async function listarTimeClocks() {
  return timeClocksSchema.parse(await ctGet("/time-clock/v1/time-clocks")).data.timeClocks;
}

/** Turnos de un time clock entre dos fechas (yyyy-mm-dd, inclusive). */
export async function listarTurnos(timeClockId: number, desde: string, hasta: string): Promise<TurnoConnecteam[]> {
  const raw = await ctGet(`/time-clock/v1/time-clocks/${timeClockId}/time-activities`, {
    startDate: desde,
    endDate: hasta,
  });
  const { timeActivitiesByUsers } = activitiesSchema.parse(raw).data;
  return timeActivitiesByUsers.flatMap((u) =>
    u.shifts.map((s) => {
      const inicio = new Date(s.start.timestamp * 1000);
      const fin = s.end ? new Date(s.end.timestamp * 1000) : null;
      return {
        activityId: s.id,
        userId: u.userId,
        jobId: s.jobId ?? null,
        inicio,
        fin,
        horas: fin ? Math.round(((fin.getTime() - inicio.getTime()) / 36e5) * 100) / 100 : 0,
      };
    }),
  );
}
