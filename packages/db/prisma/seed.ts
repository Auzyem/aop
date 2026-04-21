/**
 * AOP Database Seed
 *
 * Creates the minimum set of reference data needed to start the platform:
 *   - 1 SUPER_ADMIN user
 *   - 1 Agent (gold buying/export partner)
 *   - 1 Refinery (LBMA-accredited)
 *   - 3 LME price records (AM fix, PM fix, spot)
 *
 * Run via:  pnpm --filter @aop/db db:seed
 *       or: pnpm --filter @aop/db exec prisma db seed
 */

import { PrismaClient, KycStatus, LmePriceType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding database...');

  // ---------------------------------------------------------------------------
  // Agent
  // ---------------------------------------------------------------------------
  const agent = await prisma.agent.upsert({
    where: { licenceNo: 'AGA-KE-2026-001' },
    update: {},
    create: {
      companyName: 'Savanna Gold Exports Ltd',
      countryCode: 'KE',
      contactName: 'James Mwangi',
      licenceNo: 'AGA-KE-2026-001',
      kycStatus: KycStatus.APPROVED,
      bankName: 'Equity Bank Kenya',
      bankAccount: '0123456789',
      performanceScore: 87.5,
      isActive: true,
    },
  });
  console.log(`✅  Agent: ${agent.companyName} (${agent.id})`);

  // ---------------------------------------------------------------------------
  // Admin user  —  password: Admin1234!
  // ---------------------------------------------------------------------------
  const passwordHash = await bcrypt.hash('Admin1234!', 12);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@aop.local' },
    update: {},
    create: {
      email: 'admin@aop.local',
      passwordHash,
      role: 'SUPER_ADMIN',
      countryCode: 'KE',
      isActive: true,
    },
  });
  console.log(`✅  Admin user: ${adminUser.email} (${adminUser.id})`);

  // ---------------------------------------------------------------------------
  // Compliance officer user  —  password: Comply1234!
  // ---------------------------------------------------------------------------
  const complianceHash = await bcrypt.hash('Comply1234!', 12);

  const complianceUser = await prisma.user.upsert({
    where: { email: 'compliance@aop.local' },
    update: {},
    create: {
      email: 'compliance@aop.local',
      passwordHash: complianceHash,
      role: 'COMPLIANCE_OFFICER',
      countryCode: 'KE',
      isActive: true,
    },
  });
  console.log(`✅  Compliance user: ${complianceUser.email} (${complianceUser.id})`);

  // ---------------------------------------------------------------------------
  // admin2@aop.local  —  password: Claude4321#
  // ---------------------------------------------------------------------------
  const admin2Hash = await bcrypt.hash('Claude4321#', 12);

  const admin2User = await prisma.user.upsert({
    where: { email: 'admin2@aop.local' },
    update: {},
    create: {
      email: 'admin2@aop.local',
      passwordHash: admin2Hash,
      role: 'SUPER_ADMIN',
      countryCode: 'KE',
      isActive: true,
    },
  });
  console.log(`✅  Admin2 user: ${admin2User.email} (${admin2User.id})`);

  // ---------------------------------------------------------------------------
  // comp@aop.local  —  password: Claudecoply4321#
  // ---------------------------------------------------------------------------
  const compHash = await bcrypt.hash('Claudecoply4321#', 12);

  const compUser = await prisma.user.upsert({
    where: { email: 'comp@aop.local' },
    update: {},
    create: {
      email: 'comp@aop.local',
      passwordHash: compHash,
      role: 'COMPLIANCE_OFFICER',
      countryCode: 'KE',
      isActive: true,
    },
  });
  console.log(`✅  Comp user: ${compUser.email} (${compUser.id})`);

  // ---------------------------------------------------------------------------
  // Refinery
  // ---------------------------------------------------------------------------
  const refinery = await prisma.refinery.upsert({
    where: { id: 'refinery-rand-1' },
    update: {},
    create: {
      id: 'refinery-rand-1',
      name: 'Rand Refinery (Pty) Ltd',
      countryCode: 'ZA',
      lbmaAccredited: true,
      contactEmail: 'trade@randrefinery.co.za',
      // 0.30% refining charge
      refiningChargePercent: 0.003,
      // USD 15.00 assay fee per lot
      assayFeeUsd: 15.0,
    },
  });
  console.log(`✅  Refinery: ${refinery.name} (${refinery.id})`);

  // ---------------------------------------------------------------------------
  // LME Price Records  (three records for 2026-03-21)
  // ---------------------------------------------------------------------------
  const priceDate = new Date('2026-03-21');

  const amFix = await prisma.lmePriceRecord.upsert({
    where: {
      recordedAt_priceType: {
        recordedAt: new Date('2026-03-21T10:30:00Z'),
        priceType: LmePriceType.AM_FIX,
      },
    },
    update: {},
    create: {
      priceUsdPerTroyOz: 3152.45,
      priceType: LmePriceType.AM_FIX,
      source: 'LBMA',
      recordedAt: new Date('2026-03-21T10:30:00Z'),
    },
  });

  const pmFix = await prisma.lmePriceRecord.upsert({
    where: {
      recordedAt_priceType: {
        recordedAt: new Date('2026-03-21T15:00:00Z'),
        priceType: LmePriceType.PM_FIX,
      },
    },
    update: {},
    create: {
      priceUsdPerTroyOz: 3158.8,
      priceType: LmePriceType.PM_FIX,
      source: 'LBMA',
      recordedAt: new Date('2026-03-21T15:00:00Z'),
    },
  });

  const spot = await prisma.lmePriceRecord.upsert({
    where: {
      recordedAt_priceType: {
        recordedAt: new Date('2026-03-21T12:00:00Z'),
        priceType: LmePriceType.SPOT,
      },
    },
    update: {},
    create: {
      priceUsdPerTroyOz: 3155.1,
      priceType: LmePriceType.SPOT,
      source: 'Kitco',
      recordedAt: new Date('2026-03-21T12:00:00Z'),
    },
  });

  console.log(
    `✅  LME prices: AM $${amFix.priceUsdPerTroyOz} | Spot $${spot.priceUsdPerTroyOz} | PM $${pmFix.priceUsdPerTroyOz}`,
  );

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const counts = await Promise.all([
    prisma.user.count(),
    prisma.agent.count(),
    prisma.refinery.count(),
    prisma.lmePriceRecord.count(),
  ]);

  console.log('\n📊  Database summary:');
  console.log(`   Users:             ${counts[0]}`);
  console.log(`   Agents:            ${counts[1]}`);
  console.log(`   Refineries:        ${counts[2]}`);
  console.log(`   LME price records: ${counts[3]}`);
  console.log('\n✨  Seed complete.\n');

  // Suppress unused-variable warning; priceDate used for readability above
  void priceDate;
}

main()
  .catch((err) => {
    console.error('❌  Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
