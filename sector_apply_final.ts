import { prisma } from './src/lib/prisma';
import fs from 'fs';
import path from 'path';

const raw = JSON.parse(fs.readFileSync(path.resolve('sectory_parsed.json'), 'utf8'));
const rows = raw.slice(2).filter((r: any) => Array.isArray(r)).filter((r: any) => {
  const n = String(r[0] || '').trim();
  if (!n || n === 'الاجمالي') return false;
  if (n.toLowerCase() === 'mj') return false;
  return true;
});

function norm(s: any) {
  let t = String(s || '').trim().replace(/\s+/g, ' ');
  t = t.replace(/[.,;:\/\\-_\(\)\[\]]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim().toLowerCase();
  return t;
}

function dig(v: any) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/,/g, '').trim();
  if (s === '') return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

async function main() {
  const customers = await prisma.customer.findMany({ select: { id: true, name: true, remainingDebt: true } });
  const map = new Map<string, any>();
  for (const c of customers) {
    map.set(norm(c.name), c);
    map.set(c.name.trim().toLowerCase(), c);
  }
  const yesterday = new Date(Date.now() - 86400000);
  yesterday.setHours(12, 0, 0, 0);
  let paid = 0, debtOnly = 0, nf = 0;
  for (const e of rows) {
    const name = String(e[0]).trim();
    const debt = dig(e[1]);
    const lastPay = dig(e[2]);
    let c = map.get(norm(name));
    if (!c) c = map.get(name.toLowerCase());
    if (!c) { console.log('NF', name); nf++; continue; }
    if (lastPay > 0) {
      await prisma.customerPayment.create({ data: { customerId: c.id, amount: lastPay, paymentDate: yesterday, notes: 'دفعة من ملف عملاء القطاعي' } });
      await prisma.customer.update({ where: { id: c.id }, data: { remainingDebt: c.remainingDebt - lastPay, lastPaymentDate: yesterday } });
      console.log('P', name, lastPay); paid++;
    } else if (debt > 0) {
      await prisma.customer.update({ where: { id: c.id }, data: { remainingDebt: c.remainingDebt + debt } });
      console.log('D', name, debt); debtOnly++;
    }
  }
  console.log('RES', { paid, debtOnly, nf });
  await prisma.\();
}

main().catch(async (e) => {
  console.error(e);
  try { await prisma.\(); } catch {}
  process.exit(1);
});
