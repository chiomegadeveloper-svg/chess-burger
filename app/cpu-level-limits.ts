export type CpuLevelLimit = { level: number; wins: number; locked_until: string | null };
export type CpuLevelStatus = { enabled: boolean; levels: CpuLevelLimit[] };

export const CPU_COOLDOWN_HOURS = [216, 192, 168, 144, 120, 96, 72, 48, 24, 12] as const;

export function effectiveCpuLimit(limit: CpuLevelLimit | undefined, now: number) {
  const until = limit?.locked_until ? Date.parse(limit.locked_until) : 0;
  const locked = until > now;
  return { wins: limit?.locked_until && !locked ? 0 : (limit?.wins ?? 0), locked, until };
}

export function cpuCooldownLabel(level: number) {
  const hours = CPU_COOLDOWN_HOURS[level - 1] ?? 0;
  return hours === 12 ? '12h cooldown' : `${hours / 24}d cooldown`;
}

export function remainingCpuCooldown(until: number, now: number) {
  const minutes = Math.max(0, Math.ceil((until - now) / 60_000));
  if (!minutes) return 'Ready';
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60);
  if (days) return `${days}d ${hours}h left`;
  if (hours) return `${hours}h ${minutes % 60}m left`;
  return `${minutes}m left`;
}
