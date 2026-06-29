export interface StatValidationParams {
  fixtureId: number | string;
  seq: number | string;
  statKey: string;
  statKey2?: string;
}

export interface StatValidationBundle {
  [key: string]: unknown;
}

export async function fetchStatValidation(
  params: StatValidationParams,
): Promise<StatValidationBundle> {
  const qs = new URLSearchParams({
    fixtureId: String(params.fixtureId),
    seq: String(params.seq),
    statKey: params.statKey,
    ...(params.statKey2 ? { statKey2: params.statKey2 } : {}),
  });

  const res = await fetch(`/api/txline/stat-validation?${qs}`, {
    credentials: 'include',
  });

  if (!res.ok) throw new Error(`stat-validation failed: ${res.status}`);
  return res.json() as Promise<StatValidationBundle>;
}
