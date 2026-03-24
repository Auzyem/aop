import { prisma, Prisma } from '@aop/db';

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  SLA_TARGETS_DAYS: { '1': 3, '2': 5, '3': 2, '4': 5, '5': 7, '6': 3, '7': 2 },
  PRICE_ALERT_THRESHOLD_PCT: 2,
  FINANCE_APPROVAL_THRESHOLD_USD: 10000,
  CEO_APPROVAL_THRESHOLD_USD: 50000,
  MIN_TRANSACTION_KG: 0.5,
  REPORT_RECIPIENTS: { TAR: [], OECD: [] },
  COMPANY_DEFAULT_FEE_PCT: 5,
};

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const dbSettings = await prisma.systemSettings.findMany();

  // Start with defaults, then override with DB values
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const setting of dbSettings) {
    result[setting.key] = setting.value;
  }

  return result;
}

export async function getSetting(key: string): Promise<unknown> {
  const dbSetting = await prisma.systemSettings.findUnique({ where: { key } });
  if (dbSetting) return dbSetting.value;
  return DEFAULT_SETTINGS[key] ?? null;
}

export async function updateSetting(key: string, value: unknown, actorId: string) {
  return prisma.systemSettings.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, updatedBy: actorId },
    update: { value: value as Prisma.InputJsonValue, updatedBy: actorId },
  });
}
