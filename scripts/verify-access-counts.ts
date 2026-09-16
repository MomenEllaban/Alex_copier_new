import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const [cCust, cMach, cTest, cCont, cLink, cStl, cNotif, cUser, cEng, cHist] = await Promise.all([
    prisma.customer.count({ where: { id: { startsWith: 'accc-' } } }),
    prisma.machine.count({ where: { id: { startsWith: 'accm-' } } }),
    prisma.copierTest.count({ where: { OR: [{ id: { startsWith: 'acct-' } }, { id: { startsWith: 'accp-' } }] } }),
    prisma.contract.count({ where: { contractNumber: { startsWith: 'ACC-' } } }),
    prisma.contractMachine.count({ where: { contractId: { startsWith: 'acc-ACC-' } } }),
    prisma.settlement.count({ where: { settlementNumber: { startsWith: 'ACC-STL-' } } }),
    prisma.notification.count({ where: { metadata: { path: ['seed'], equals: 'access' } } }),
    prisma.user.count({ where: { email: { startsWith: 'eng-' } } }),
    prisma.engineer.count({ where: { id: { startsWith: 'eng-acc-' } } }),
    prisma.machineOwnerHistory.count({ where: { notes: 'ترحيل تاريخي من الأكسس' } }),
  ]);
  console.log(JSON.stringify({ customers: cCust, machines: cMach, tests: cTest, contracts: cCont, links: cLink, settlements: cStl, notifications: cNotif, engUsers: cUser, engineers: cEng, history: cHist }));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
