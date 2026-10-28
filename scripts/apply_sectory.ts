import { prisma } from '../src/lib/prisma';
import fs from 'fs';
import path from 'path';

function normalize(s: string) {
  if (!s) return '';
  let t = s.trim().replace(/\s+/g, ' ');
  // remove common prefixes/suffixes like أ. / م. / د. and punctuation
  t = t.replace(/^[\.\-_\s\u0600-\u06FF]*/, '');
  t = t.replace(/[.,;:]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t.toLowerCase();
}

function digits(v: any) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/,/g,'').trim();
  if (s === '') return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(path.resolve('sectory_parsed.json'),'utf8'));
  const rows = raw.slice(2).filter(r => Array.isArray(r));
  // skip totals
  const entries = rows.filter(r => {
    const name = String(r[0]||'').trim();
    if (!name) return false;
    if (name === 'الاجمالي') return false;
    if (name.toLowerCase() === 'mj') return false;
    return true;
  });

  const customers = await prisma.customer.findMany({ select: { id:true, name:true, remainingDebt:true, totalDebt:true, lastPaymentDate:true } });
  const map = new Map();
  for (const c of customers) {
    map.set(normalize(c.name), c);
    // also try without some prefixes
    map.set(c.name.trim().toLowerCase(), c);
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate()-1);
  yesterday.setHours(12,0,0,0);

  const toCreateDebt = [];
  const toPay = [];
  const toOnlyDebt = [];

  for (const e of entries) {
    const name = String(e[0]).trim();
    const debt = digits(e[1]);
    const lastPay = digits(e[2]);
    const key = normalize(name);
    const c = map.get(key) || map.get(name.toLowerCase());
    if (!c) {
      console.log('NOT_FOUND:', name, {debt, lastPay});
      continue;
    }
    if (lastPay > 0) {
      toPay.push({c, name, debt, lastPay});
    } else if (debt > 0) {
      toOnlyDebt.push({c, name, debt, lastPay});
    }
  }

  console.log('found_pay:', toPay.length, 'found_debt_only:', toOnlyDebt.length);
  // apply: if paying -> record payment at yesterday (amount = lastPay) and also ensure debt reflects; 
  // per request: if they paid, say last payment was yesterday. Also add debt if specified? "لو الشيت ده العملاء موجودين حتضيف بس مديونات عليهم ولو دافعين دفعه حتقول انى ديه اخر دفعه بتاريخ امس"
  // "مدفعوش حاجه خلاص يبقى لسه حيدفعوا" -> no payments, just debt remains
  for (const p of toPay) {
    // record payment
    await prisma.customerPayment.create({
      data: {
        customerId: p.c.id,
        amount: p.lastPay,
        paymentDate: yesterday,
        notes: 'دفعة من ملف عملاء القطاعي',
      }
    });
    // update customer: reduce remainingDebt by payment? API does it, but doing directly: remainingDebt decreases by amount (can go negative -> credit)
    await prisma.customer.update({
      where: { id: p.c.id },
      data: {
        remainingDebt: p.c.remainingDebt - p.lastPay,
        lastPaymentDate: yesterday,
      }
    });
    console.log('PAYED:', p.name, p.lastPay);
  }
  for (const d of toOnlyDebt) {
    // add debt only
    await prisma.customer.update({
      where: { id: d.c.id },
      data: {
        remainingDebt: d.c.remainingDebt + d.debt,
      }
    });
    console.log('DEBT_ONLY:', d.name, d.debt);
  }
}

main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.\());
