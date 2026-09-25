import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { assertDestructiveSeedAllowed } from './destructive-guard';

// Refuses to run against production before a single connection is opened.
const guardWarning = assertDestructiveSeedAllowed();
if (guardWarning) console.warn(guardWarning);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting seed...');

  // Clean existing data
  console.log('Cleaning existing data...');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "JournalEntryItem" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "JournalEntry" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Account" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "EngineerSalary" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Warranty" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Expense" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExpenseCategory" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "SalesCategory" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ApprovalLog" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Settlement" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Visit" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProblemDetail" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ServiceRequest" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ContractMachine" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Contract" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Installment" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "SalesOrderItem" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "SalesOrder" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "InterCompanyInvoice" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "PurchaseInvoice" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "PurchaseOrderItem" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "PurchaseOrder" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "SparePartCustody" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "StockMovement" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "WarehouseInventory" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Warehouse" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "SparePartCompatibility" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "MeterReading" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "MachineOwnerHistory" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ScrapOrder" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Machine" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Product" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "InvestorDistribution" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "InvestorDistributionCycle" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Investor" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "EngineerSkill" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "EngineerArea" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Engineer" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Supplier" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "CustomerLedger" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "CustomerLocation" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Customer" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Session" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Company" CASCADE');
  console.log('Cleaned.');

  // COMPANIES
  console.log('Creating companies...');

  const company1 = await prisma.company.create({
    data: {
      id: 'company1',
      name: 'شركة جملة آلات',
      nameAr: 'شركة جملة آلات',
      taxNumber: '123-456-789',
      tradeRegister: 'TR-001',
      address: 'شارع فريد ندا - وسط البلد - الإسكندرية',
      phone: '033-456-7890',
      email: 'info@jumla-ahlat.com',
    },
  });

  const company2 = await prisma.company.create({
    data: {
      id: 'company2',
      name: 'شركة جملة قطع غيار',
      nameAr: 'شركة جملة قطع غيار',
      taxNumber: '987-654-321',
      tradeRegister: 'TR-002',
      address: 'شارع الجيش - سيدي جابر - الإسكندرية',
      phone: '033-789-0123',
      email: 'info@jumla-parts.com',
    },
  });

  const company3 = await prisma.company.create({
    data: {
      id: 'company3',
      name: 'شركة القطاعي',
      nameAr: 'شركة القطاعي',
      taxNumber: '456-789-123',
      tradeRegister: 'TR-003',
      address: 'شارع الكورنيش - محطة الرمل - الإسكندرية',
      phone: '033-012-3456',
      email: 'info@sectory.com',
    },
  });

  // -------------------------------------------
  // EXPENSE & SALES CATEGORIES
  // -------------------------------------------
  console.log('📂 Creating expense & sales categories...');

  const expenseCategoryData = [
    { id: 'expcat-1', name: 'إيجار', companyId: company1.id },
    { id: 'expcat-2', name: 'كهرباء ومياه', companyId: company1.id },
    { id: 'expcat-3', name: 'رواتب', companyId: company1.id },
    { id: 'expcat-4', name: 'نقل وشحن', companyId: company1.id },
    { id: 'expcat-5', name: 'صيانة', companyId: company1.id },
    { id: 'expcat-6', name: 'مشتريات مكتبية', companyId: company1.id },
    { id: 'expcat-7', name: 'دعاية وإعلان', companyId: company1.id },
    { id: 'expcat-8', name: 'إيجار', companyId: company2.id },
    { id: 'expcat-9', name: 'كهرباء ومياه', companyId: company2.id },
    { id: 'expcat-10', name: 'رواتب', companyId: company2.id },
    { id: 'expcat-11', name: 'نقل وشحن', companyId: company2.id },
    { id: 'expcat-12', name: 'إيجار', companyId: company3.id },
    { id: 'expcat-13', name: 'كهرباء ومياه', companyId: company3.id },
    { id: 'expcat-14', name: 'مشتريات مكتبية', companyId: company3.id },
  ];

  for (const c of expenseCategoryData) {
    await prisma.expenseCategory.create({ data: c });
  }

  const salesCategoryData = [
    { id: 'salcat-1', name: 'آلات جديدة', companyId: company1.id },
    { id: 'salcat-2', name: 'آلات مستعملة', companyId: company1.id },
    { id: 'salcat-3', name: 'قطع غيار', companyId: company1.id },
    { id: 'salcat-4', name: 'مستهلكات', companyId: company1.id },
    { id: 'salcat-5', name: 'عقود صيانة', companyId: company1.id },
    { id: 'salcat-6', name: 'قطع غيار', companyId: company2.id },
    { id: 'salcat-7', name: 'مستهلكات', companyId: company2.id },
    { id: 'salcat-8', name: 'آلات جديدة', companyId: company3.id },
    { id: 'salcat-9', name: 'آلات مستعملة', companyId: company3.id },
  ];

  for (const c of salesCategoryData) {
    await prisma.salesCategory.create({ data: c });
  }

  // -------------------------------------------
  // USERS
  // -------------------------------------------
  console.log('📋 Creating users...');

  const passwordHash = await bcrypt.hash('password123', 10);

  const users = [
    { id: 'user-reza', name: 'رضا', email: 'reza@alex-copier.com', role: 'GENERAL_MANAGER' as const, companyId: company1.id },
    { id: 'user-sara', name: 'سارة محمد', email: 'sarah@jmal-ahlat.com', role: 'COMPANY_MANAGER' as const, companyId: company1.id },
    { id: 'user-amr-accountant', name: 'عمرو', email: 'amr.accountant@alex-copier.com', role: 'ACCOUNTANT' as const, companyId: company1.id },
    { id: 'user-amr-maintenance', name: 'عمرو', email: 'amr.maintenance@alex-copier.com', role: 'MAINTENANCE_MANAGER' as const, companyId: company1.id },
    { id: 'user-ali', name: 'علي خالد', email: 'ali@alex-copier.com', role: 'WORKSHOP_MANAGER' as const, companyId: company1.id },
    { id: 'user-fatma', name: 'فاطمة عبدالله', email: 'fatma@alex-copier.com', role: 'SALES_EMPLOYEE' as const, companyId: company1.id },
    // محاسب خاص بشركة جملة قطع غيار (company2)
    { id: 'user-parts-accountant', name: 'كريم', email: 'parts.accountant@alex-copier.com', role: 'ACCOUNTANT' as const, companyId: company2.id },
    // محاسب خاص بشركة القطاعي (company3)
    { id: 'user-sectory-accountant', name: 'مروة', email: 'sectory.accountant@alex-copier.com', role: 'ACCOUNTANT' as const, companyId: company3.id },
  ];

  for (const u of users) {
    await prisma.user.create({ data: { ...u, passwordHash } });
  }

  const user1 = await prisma.user.findUnique({ where: { id: 'user-reza' } });
  const user2 = await prisma.user.findUnique({ where: { id: 'user-sara' } });
  const user3 = await prisma.user.findUnique({ where: { id: 'user-amr-accountant' } });
  const user4 = await prisma.user.findUnique({ where: { id: 'user-amr-maintenance' } });
  const user5 = await prisma.user.findUnique({ where: { id: 'user-ali' } });
  const user7 = await prisma.user.findUnique({ where: { id: 'user-fatma' } });
  if (!user1 || !user2 || !user3 || !user4 || !user5 || !user7) throw new Error('Users not found');

  // -------------------------------------------
  // CUSTOMERS
  // -------------------------------------------
  console.log('?? Creating customers...');

  const customersData = [
    { id: 'cust-1', name: 'مكتب النور', companyName: 'مكتب النور', contactPerson: 'أحمد النور', phone: '010-1234-5678', whatsapp: '010-1234-5678', city: 'الإسكندرية', governorate: 'الإسكندرية', creditLimit: 50000, customerType: 'COMPANY' as const },
    { id: 'cust-2', name: 'شركة الشروق', companyName: 'الشروق', contactPerson: 'محمد الشروق', phone: '011-2345-6789', city: 'الإسكندرية', governorate: 'الإسكندرية', creditLimit: 30000, customerType: 'COMPANY' as const },
    { id: 'cust-3', name: 'مكتب السلام', companyName: null, contactPerson: 'حسن علي', phone: '012-3456-7890', city: 'القاهرة', governorate: 'القاهرة', creditLimit: 20000, customerType: 'INDIVIDUAL' as const },
    { id: 'cust-4', name: 'شركة الفجر', companyName: 'الفجر', contactPerson: 'خالد الفجر', phone: '015-4567-8901', city: 'الإسكندرية', governorate: 'الإسكندرية', creditLimit: 45000, customerType: 'COMPANY' as const },
    { id: 'cust-5', name: 'مكتب العدل', companyName: null, contactPerson: 'عادل محمود', phone: '010-5678-9012', city: 'الإسكندرية', governorate: 'الإسكندرية', creditLimit: 15000, customerType: 'INDIVIDUAL' as const },
    { id: 'cust-6', name: 'شركة الأمان', companyName: 'الأمان', contactPerson: 'ياسر الأمان', phone: '011-6789-0123', city: 'القاهرة', governorate: 'القاهرة', creditLimit: 60000, customerType: 'COMPANY' as const },
    { id: 'cust-7', name: 'مكتب النجاح', companyName: null, contactPerson: 'كريم النجاح', phone: '012-7890-1234', city: 'الإسكندرية', governorate: 'الإسكندرية', creditLimit: 10000, customerType: 'INDIVIDUAL' as const },
    { id: 'cust-8', name: 'شركة الأعمال', companyName: 'الأعمال', contactPerson: 'وليد الأعمال', phone: '015-8901-2345', city: 'الإسكندرية', governorate: 'الإسكندرية', creditLimit: 40000, customerType: 'COMPANY' as const },
    { id: 'cust-9', name: 'مكتب التواضع', companyName: null, contactPerson: 'سمير التواضع', phone: '010-9012-3456', city: 'القاهرة', governorate: 'القاهرة', creditLimit: 25000, customerType: 'INDIVIDUAL' as const },
    { id: 'cust-10', name: 'شركة الإبداع', companyName: 'الإبداع', contactPerson: 'طارق الإبداع', phone: '011-0123-4567', city: 'الإسكندرية', governorate: 'الإسكندرية', creditLimit: 35000, customerType: 'COMPANY' as const },
    { id: 'cust-11', name: 'مكتب الرائد', companyName: null, contactPerson: 'منى الرائد', phone: '012-1234-5678', city: 'الإسكندرية', governorate: 'الإسكندرية', creditLimit: 12000, customerType: 'INDIVIDUAL' as const },
    { id: 'cust-12', name: 'شركة المستقبل', companyName: 'المستقبل', contactPerson: 'حاتم المستقبل', phone: '015-2345-6789', city: 'القاهرة', governorate: 'القاهرة', creditLimit: 55000, customerType: 'COMPANY' as const },
    { id: 'cust-13', name: 'مكتب الأمل', companyName: null, contactPerson: 'ياسمين الأمل', phone: '010-3456-7890', city: 'الإسكندرية', governorate: 'الإسكندرية', creditLimit: 18000, customerType: 'INDIVIDUAL' as const },
    { id: 'cust-14', name: 'شركة السمو', companyName: 'السمو', contactPerson: 'هدى السمو', phone: '011-4567-8901', city: 'الإسكندرية', governorate: 'الإسكندرية', creditLimit: 42000, customerType: 'COMPANY' as const },
    { id: 'cust-15', name: 'مكتب النخبة', companyName: null, contactPerson: 'أحمد النخبة', phone: '012-5678-9012', city: 'الإسكندرية', governorate: 'الإسكندرية', creditLimit: 22000, customerType: 'INDIVIDUAL' as const },
  ];

  for (const c of customersData) {
    await prisma.customer.create({ data: c });
  }

  // -------------------------------------------
  // CUSTOMER LOCATIONS (25)
  // -------------------------------------------
  console.log('?? Creating customer locations...');

  const locationsData = [
    { customerId: 'cust-1', name: 'فرع الإسكندرية', address: 'شارع فريد ندا - وسط البلد', city: 'الإسكندرية', phone: '033-111-2222' },
    { customerId: 'cust-1', name: 'فرع سيدي جابر', address: 'شارع الجيش - سيدي جابر', city: 'الإسكندرية', phone: '033-111-3333' },
    { customerId: 'cust-2', name: 'مكتب رأس التين', address: 'شارع الكورنيش - رأس التين', city: 'الإسكندرية', phone: '033-222-4444' },
    { customerId: 'cust-2', name: 'فرع المنشية', address: 'شارع 9 أبريل - المنشية', city: 'الإسكندرية', phone: '033-222-5555' },
    { customerId: 'cust-3', name: 'القاهرة', address: 'شارع التحرير - وسط البلد', city: 'القاهرة', phone: '02-333-6666' },
    { customerId: 'cust-3', name: 'فرع المعادي', address: 'شارع 9 - المعادي', city: 'القاهرة', phone: '02-333-7777' },
    { customerId: 'cust-4', name: 'فرع الإسماعيلية', address: 'شارع الجيش - سموحه', city: 'الإسكندرية', phone: '033-444-8888' },
    { customerId: 'cust-4', name: 'فرع الهرم', address: 'شارع الإسكندرية - الهرم', city: 'الإسكندرية', phone: '033-444-9999' },
    { customerId: 'cust-5', name: 'المعادي', address: 'شارع 9 أبريل - المعادي', city: 'الإسكندرية', phone: '033-555-0000' },
    { customerId: 'cust-5', name: 'فرع وسط البلد', address: 'شارع فريد ندا - وسط البلد', city: 'الإسكندرية', phone: '033-555-1111' },
    { customerId: 'cust-6', name: 'فرع التحرير', address: 'شارع التحرير - وسط البلد', city: 'القاهرة', phone: '02-666-2222' },
    { customerId: 'cust-6', name: 'فرع الدقي', address: 'شارع التحرير - الدقي', city: 'القاهرة', phone: '02-666-3333' },
    { customerId: 'cust-6', name: 'فرع المعادي', address: 'شارع 9 - المعادي', city: 'القاهرة', phone: '02-666-4444' },
    { customerId: 'cust-7', name: 'الإسكندرية', address: 'شارع فريد ندا - وسط البلد', city: 'الإسكندرية', phone: '033-777-5555' },
    { customerId: 'cust-8', name: 'فرع المنشية', address: 'شارع 9 أبريل - المنشية', city: 'الإسكندرية', phone: '033-888-6666' },
    { customerId: 'cust-8', name: 'فرع سيدي جابر الجديد', address: 'شارع 9 أبريل - سيدي جابر', city: 'الإسكندرية', phone: '033-888-7777' },
    { customerId: 'cust-9', name: 'المعادي', address: 'شارع الجيش - وسط البلد', city: 'القاهرة', phone: '02-999-8888' },
    { customerId: 'cust-10', name: 'فرع الإسكندرية', address: 'شارع الكورنيش - سيدي جابر', city: 'الإسكندرية', phone: '033-000-9999' },
    { customerId: 'cust-10', name: 'فرع رأس التين', address: 'شارع فريد - رأس التين', city: 'الإسكندرية', phone: '033-000-0000' },
    { customerId: 'cust-11', name: 'الإسكندرية', address: 'شارع الجيش - المحطة', city: 'الإسكندرية', phone: '033-111-1111' },
    { customerId: 'cust-12', name: 'فرع التحرير', address: 'شارع الكورنيش - وسط البلد', city: 'القاهرة', phone: '02-222-2222' },
    { customerId: 'cust-12', name: 'فرع الدقي', address: 'شارع الجيش - الدقي', city: 'القاهرة', phone: '02-222-3333' },
    { customerId: 'cust-13', name: 'الإسكندرية', address: 'شارع فريد - الإسكندرية', city: 'الإسكندرية', phone: '033-333-4444' },
    { customerId: 'cust-14', name: 'فرع سيدي جابر', address: 'شارع الكورنيش - رأس التين', city: 'الإسكندرية', phone: '033-444-5555' },
    { customerId: 'cust-15', name: 'الإسكندرية', address: 'شارع فريد - وسط البلد', city: 'الإسكندرية', phone: '033-555-6666' },
  ];

  const createdLocations: Awaited<ReturnType<typeof prisma.customerLocation.create>>[] = [];
  for (const loc of locationsData) {
    const l = await prisma.customerLocation.create({ data: loc });
    createdLocations.push(l);
  }

  // -------------------------------------------
  // CUSTOMER LEDGERS
  // -------------------------------------------
  console.log('?? Creating customer ledgers...');

  for (const c of customersData) {
    await prisma.customerLedger.create({
      data: { customerId: c.id, companyId: company1.id, balance: Math.floor(Math.random() * 20000) },
    });
  }

  // -------------------------------------------
  // SUPPLIERS
  // -------------------------------------------
  console.log('?? Creating suppliers...');

  const suppliersData = [
    { id: 'sup-1', name: 'Ricoh Egypt', contactName: 'Eng. Hesham', phone: '02-2267-8901', email: 'sales@ricoh-egypt.com', address: 'شارع فريد - الإسكندرية', taxNumber: 'SUP-100-001', companyId: company1.id },
    { id: 'sup-2', name: 'Canon Egypt', contactName: 'Mr. Tarek', phone: '02-2345-6789', email: 'info@canon-egypt.com', address: 'شارع التحرير - الإسكندرية', taxNumber: 'SUP-100-002', companyId: company1.id },
    { id: 'sup-3', name: 'Xerox Egypt', contactName: 'Ms. Nadia', phone: '02-2456-7890', email: 'orders@xerox-egypt.com', address: 'محطة الرمل - الإسكندرية', taxNumber: 'SUP-100-003', companyId: company1.id },
    { id: 'sup-4', name: 'Sharp Egypt', contactName: 'Eng. Youssef', phone: '02-2567-8901', email: 'sales@sharp-egypt.com', address: 'شارع الجيش - الإسكندرية', taxNumber: 'SUP-100-004', companyId: company2.id },
    { id: 'sup-5', name: 'Konica Minolta', contactName: 'Mr. Ali', phone: '02-2678-9012', email: 'info@konica-minolta-eg.com', address: 'الإسكندرية', taxNumber: 'SUP-100-005', companyId: company2.id },
  ];

  for (const sup of suppliersData) {
    await prisma.supplier.create({ data: sup });
  }

  // -------------------------------------------
  // ENGINEERS
  // -------------------------------------------
  console.log('?? Creating engineers...');

  const engineersData = [
    { id: 'eng-1', name: 'أحمد علي', phone: '010-1111-2222', email: 'ahmed.ali@alex-copier.com', baseSalary: 8000, transportAllowance: 2000, areas: ['الإسكندرية', 'وسط البلد'], skills: [{ model: 'Ricoh MP C3004', level: 3 }, { model: 'Canon imageRUNNER', level: 2 }] },
    { id: 'eng-2', name: 'محمد حسن', phone: '011-2222-3333', email: 'mohamed.hassan@alex-copier.com', baseSalary: 9000, transportAllowance: 2500, areas: ['الرياض', 'الإسكندرية'], skills: [{ model: 'Xerox VersaLink', level: 3 }, { model: 'Sharp MX', level: 2 }] },
    { id: 'eng-3', name: 'محمود إبراهيم', phone: '012-3333-4444', email: 'mahmoud.ibrahim@alex-copier.com', baseSalary: 8500, transportAllowance: 2200, areas: ['الإسكندرية', 'المعادي'], skills: [{ model: 'Konica Minolta bizhub', level: 3 }] },
    { id: 'eng-4', name: 'حسن خالد', phone: '015-4444-5555', email: 'hassan.khaled@alex-copier.com', baseSalary: 7500, transportAllowance: 1800, areas: ['مكتب العدل', 'الجيش'], skills: [{ model: 'Ricoh MP C4504', level: 3 }] },
    { id: 'eng-5', name: 'عمرو سعيد', phone: '010-5555-6666', email: 'omar.saeed@alex-copier.com', baseSalary: 8000, transportAllowance: 2000, areas: ['القاهرة', 'وسط البلد'], skills: [{ model: 'Canon imageRUNNER ADVANCE', level: 3 }] },
    { id: 'eng-6', name: 'ياسر محمد', phone: '011-6666-7777', email: 'yasser.mohamed@alex-copier.com', baseSalary: 7000, transportAllowance: 1500, areas: ['المعادي', 'شارع الجيش'], skills: [{ model: 'Xerox WorkCentre', level: 2 }] },
  ];

  const createdEngineers: Awaited<ReturnType<typeof prisma.engineer.create>>[] = [];
  for (const engData of engineersData) {
    const engineerUser = await prisma.user.upsert({
      where: { email: engData.email },
      update: { name: engData.name, role: 'ENGINEER', isActive: true },
      create: {
        id: `user-${engData.id}`,
        name: engData.name,
        email: engData.email,
        passwordHash,
        role: 'ENGINEER',
        companyId: null,
      },
    });

    const eng = await prisma.engineer.create({
      data: {
        id: engData.id,
        userId: engineerUser.id,
        name: engData.name,
        phone: engData.phone,
        email: engData.email,
        baseSalary: engData.baseSalary,
        transportAllowance: engData.transportAllowance,
        areas: { create: engData.areas.map((a) => ({ areaName: a })) },
        skills: { create: engData.skills.map((s) => ({ modelType: s.model, skillLevel: s.level })) },
      },
    });
    createdEngineers.push(eng);
  }

  // -------------------------------------------
  // INVESTORS
  // -------------------------------------------
  console.log('?? Creating investors...');

  const investor1 = await prisma.investor.create({
    data: { name: 'مستثمر أول', phone: '010-7777-8888', email: 'ahmed.inv@example.com', ownershipPct: 40 },
  });
  const investor2 = await prisma.investor.create({
    data: { name: 'مستثمر ثاني', phone: '011-8888-9999', email: 'salem.inv@example.com', ownershipPct: 35 },
  });
  const investor3 = await prisma.investor.create({
    data: { name: 'مستثمر ثالث', phone: '012-9999-0000', email: 'khaled.inv@example.com', ownershipPct: 25 },
  });

  // -------------------------------------------
  // PRODUCTS - MACHINES (15)
  // -------------------------------------------
  console.log('??? Creating machine products...');

  const machineProductsData = [
    { id: 'prod-m-01', name: 'Ricoh MP C3004', description: 'Machine Ricoh C3004 Color', productType: 'MACHINE' as const, companyId: company1.id, gs1Code: 'GS1-M-001', purchasePrice: 85000, wholesalePrice: 110000, retailPrice: 130000 },
    { id: 'prod-m-02', name: 'Ricoh MP C4504', description: 'Maicine Ricoh C4504 Color', productType: 'MACHINE' as const, companyId: company1.id, gs1Code: 'GS1-M-002', purchasePrice: 120000, wholesalePrice: 155000, retailPrice: 180000 },
    { id: 'prod-m-03', name: 'Ricoh MP 2554', description: 'Machine Ricoh 2554 Mono', productType: 'MACHINE' as const, companyId: company1.id, gs1Code: 'GS1-M-003', purchasePrice: 45000, wholesalePrice: 60000, retailPrice: 72000 },
    { id: 'prod-m-04', name: 'Canon imageRUNNER C3326i', description: 'Machine Canon C3326i Color', productType: 'MACHINE' as const, companyId: company1.id, gs1Code: 'GS1-M-004', purchasePrice: 75000, wholesalePrice: 98000, retailPrice: 115000 },
    { id: 'prod-m-05', name: 'Canon imageRUNNER ADVANCE 6565i', description: 'Machine Canon ADVANCE 6565i', productType: 'MACHINE' as const, companyId: company1.id, gs1Code: 'GS1-M-005', purchasePrice: 150000, wholesalePrice: 195000, retailPrice: 230000 },
    { id: 'prod-m-06', name: 'Xerox VersaLink C405', description: 'Machine Xerox VersaLink C405', productType: 'MACHINE' as const, companyId: company1.id, egsCode: 'EGS-M-006', purchasePrice: 90000, wholesalePrice: 115000, retailPrice: 140000 },
    { id: 'prod-m-07', name: 'Xerox WorkCentre 6515', description: 'Machine Xerox WorkCentre 6515', productType: 'MACHINE' as const, companyId: company1.id, egsCode: 'EGS-M-007', purchasePrice: 65000, wholesalePrice: 82000, retailPrice: 98000 },
    { id: 'prod-m-08', name: 'Sharp MX-3071', description: 'Machine Sharp MX-3071 Color', productType: 'MACHINE' as const, companyId: company2.id, egsCode: 'EGS-M-008', purchasePrice: 95000, wholesalePrice: 120000, retailPrice: 145000 },
    { id: 'prod-m-09', name: 'Sharp MX-M264N', description: 'Machine Sharp MX-M264N Mono', productType: 'MACHINE' as const, companyId: company2.id, egsCode: 'EGS-M-009', purchasePrice: 35000, wholesalePrice: 48000, retailPrice: 58000 },
    { id: 'prod-m-10', name: 'Konica Minolta bizhub C250i', description: 'Machine Konica C250i Color', productType: 'MACHINE' as const, companyId: company2.id, egsCode: 'EGS-M-010', purchasePrice: 80000, wholesalePrice: 105000, retailPrice: 125000 },
    { id: 'prod-m-11', name: 'Konica Minolta bizhub 458', description: 'Machine Konica 458 Mono', productType: 'MACHINE' as const, companyId: company2.id, egsCode: 'EGS-M-011', purchasePrice: 55000, wholesalePrice: 72000, retailPrice: 88000 },
    { id: 'prod-m-12', name: 'Ricoh MP 3055', description: 'Machine Ricoh 3055 Mono', productType: 'MACHINE' as const, companyId: company1.id, egsCode: 'EGS-M-012', purchasePrice: 52000, wholesalePrice: 68000, retailPrice: 82000 },
    { id: 'prod-m-13', name: 'Canon imageRUNNER 2625', description: 'Machine Canon 2625 Mono', productType: 'MACHINE' as const, companyId: company1.id, egsCode: 'EGS-M-013', purchasePrice: 42000, wholesalePrice: 56000, retailPrice: 68000 },
    { id: 'prod-m-14', name: 'Xerox VersaLink B405', description: 'Machine Xerox B405 Mono', productType: 'MACHINE' as const, companyId: company1.id, egsCode: 'EGS-M-014', purchasePrice: 48000, wholesalePrice: 62000, retailPrice: 75000 },
    { id: 'prod-m-15', name: 'Konica Minolta bizhub C3110', description: 'Machine Konica C3110 Color', productType: 'MACHINE' as const, companyId: company2.id, egsCode: 'EGS-M-015', purchasePrice: 38000, wholesalePrice: 50000, retailPrice: 62000 },
  ];

  const createdMachineProducts: Awaited<ReturnType<typeof prisma.product.create>>[] = [];
  for (const p of machineProductsData) {
    const prod = await prisma.product.create({ data: p });
    createdMachineProducts.push(prod);
  }

  // -------------------------------------------
  // PRODUCTS - SPARE PARTS (15)
  // -------------------------------------------
  console.log('?? Creating spare part products...');

  const sparePartsData = [
    { id: 'prod-sp-01', name: 'Toner Ricoh MP C3004', description: 'Toner Cartridge for Ricoh MP C3004', productType: 'SPARE_PART' as const, companyId: company1.id, egsCode: 'EGS-SP-001', purchasePrice: 1200, wholesalePrice: 1800, retailPrice: 2200 },
    { id: 'prod-sp-02', name: 'Drum Unit Ricoh MP C3004', description: 'Drum Unit for Ricoh MP C3004', productType: 'SPARE_PART' as const, companyId: company1.id, egsCode: 'EGS-SP-002', purchasePrice: 3500, wholesalePrice: 5000, retailPrice: 6000 },
    { id: 'prod-sp-03', name: 'Fuser Unit Ricoh MP C4504', description: 'Fuser Unit for Ricoh MP C4504', productType: 'SPARE_PART' as const, companyId: company1.id, egsCode: 'EGS-SP-003', purchasePrice: 4500, wholesalePrice: 6500, retailPrice: 8000 },
    { id: 'prod-sp-04', name: 'Toner Canon C3326i', description: 'Toner Cartridge for Canon C3326i', productType: 'SPARE_PART' as const, companyId: company1.id, egsCode: 'EGS-SP-004', purchasePrice: 1500, wholesalePrice: 2200, retailPrice: 2800 },
    { id: 'prod-sp-05', name: 'Drum Unit Canon ADVANCE 6565i', description: 'Drum Unit for Canon ADVANCE 6565i', productType: 'SPARE_PART' as const, companyId: company1.id, egsCode: 'EGS-SP-005', purchasePrice: 4000, wholesalePrice: 5800, retailPrice: 7000 },
    { id: 'prod-sp-06', name: 'Toner Xerox VersaLink C405', description: 'Toner Cartridge for Xerox VersaLink C405', productType: 'SPARE_PART' as const, companyId: company1.id, egsCode: 'EGS-SP-006', purchasePrice: 1800, wholesalePrice: 2600, retailPrice: 3200 },
    { id: 'prod-sp-07', name: 'Roller Feed Xerox 6515', description: 'Pickup Roller for Xerox WorkCentre 6515', productType: 'SPARE_PART' as const, companyId: company1.id, egsCode: 'EGS-SP-007', purchasePrice: 800, wholesalePrice: 1200, retailPrice: 1500 },
    { id: 'prod-sp-08', name: 'Toner Sharp MX-3071', description: 'Toner Cartridge for Sharp MX-3071', productType: 'SPARE_PART' as const, companyId: company2.id, egsCode: 'EGS-SP-008', purchasePrice: 1600, wholesalePrice: 2400, retailPrice: 3000 },
    { id: 'prod-sp-09', name: 'Drum Unit Sharp MX-3071', description: 'Drum Unit for Sharp MX-3071', productType: 'SPARE_PART' as const, companyId: company2.id, egsCode: 'EGS-SP-009', purchasePrice: 3800, wholesalePrice: 5500, retailPrice: 6800 },
    { id: 'prod-sp-10', name: 'Fuser Unit Konica C250i', description: 'Fuser Unit for Konica Minolta bizhub C250i', productType: 'SPARE_PART' as const, companyId: company2.id, egsCode: 'EGS-SP-010', purchasePrice: 4200, wholesalePrice: 6000, retailPrice: 7500 },
    { id: 'prod-sp-11', name: 'Toner Konica 458', description: 'Toner Cartridge for Konica Minolta bizhub 458', productType: 'SPARE_PART' as const, companyId: company2.id, egsCode: 'EGS-SP-011', purchasePrice: 1100, wholesalePrice: 1700, retailPrice: 2100 },
    { id: 'prod-sp-12', name: 'Toner Ricoh MP 3055', description: 'Toner Cartridge for Ricoh MP 3055', productType: 'SPARE_PART' as const, companyId: company1.id, egsCode: 'EGS-SP-012', purchasePrice: 950, wholesalePrice: 1500, retailPrice: 1800 },
    { id: 'prod-sp-13', name: 'Roller Feed Canon 2625', description: 'Pickup Roller for Canon imageRUNNER 2625', productType: 'SPARE_PART' as const, companyId: company1.id, egsCode: 'EGS-SP-013', purchasePrice: 700, wholesalePrice: 1100, retailPrice: 1400 },
    { id: 'prod-sp-14', name: 'Toner Xerox B405', description: 'Toner Cartridge for Xerox VersaLink B405', productType: 'SPARE_PART' as const, companyId: company1.id, egsCode: 'EGS-SP-014', purchasePrice: 1300, wholesalePrice: 2000, retailPrice: 2500 },
    { id: 'prod-sp-15', name: 'Fuser Unit Konica C3110', description: 'Fuser Unit for Konica Minolta bizhub C3110', productType: 'SPARE_PART' as const, companyId: company2.id, egsCode: 'EGS-SP-015', purchasePrice: 3200, wholesalePrice: 4800, retailPrice: 6000 },
  ];

  const createdSpareParts: Awaited<ReturnType<typeof prisma.product.create>>[] = [];
  for (const p of sparePartsData) {
    const prod = await prisma.product.create({ data: p });
    createdSpareParts.push(prod);
  }

  // -------------------------------------------
  // SPARE PART COMPATIBILITY
  // -------------------------------------------
  console.log('?? Creating spare part compatibility...');

  const compatData = [
    { sparePartId: 'prod-sp-01', machineModelId: 'prod-m-01' },
    { sparePartId: 'prod-sp-02', machineModelId: 'prod-m-01' },
    { sparePartId: 'prod-sp-03', machineModelId: 'prod-m-02' },
    { sparePartId: 'prod-sp-04', machineModelId: 'prod-m-04' },
    { sparePartId: 'prod-sp-05', machineModelId: 'prod-m-05' },
    { sparePartId: 'prod-sp-06', machineModelId: 'prod-m-06' },
    { sparePartId: 'prod-sp-07', machineModelId: 'prod-m-07' },
    { sparePartId: 'prod-sp-08', machineModelId: 'prod-m-08' },
    { sparePartId: 'prod-sp-09', machineModelId: 'prod-m-08' },
    { sparePartId: 'prod-sp-10', machineModelId: 'prod-m-10' },
    { sparePartId: 'prod-sp-11', machineModelId: 'prod-m-11' },
    { sparePartId: 'prod-sp-12', machineModelId: 'prod-m-12' },
    { sparePartId: 'prod-sp-13', machineModelId: 'prod-m-13' },
    { sparePartId: 'prod-sp-14', machineModelId: 'prod-m-14' },
    { sparePartId: 'prod-sp-15', machineModelId: 'prod-m-15' },
  ];

  for (const c of compatData) {
    await prisma.sparePartCompatibility.create({ data: c });
  }

  // -------------------------------------------
  // WAREHOUSES
  // -------------------------------------------
  console.log('?? Creating warehouses...');

  const wh1 = await prisma.warehouse.create({ data: { id: 'wh-1', name: company1.name, companyId: company1.id } });
  const wh2 = await prisma.warehouse.create({ data: { id: 'wh-2', name: company2.name, companyId: company2.id } });
  const wh3 = await prisma.warehouse.create({ data: { id: 'wh-3', name: company3.name, companyId: company3.id } });

  // -------------------------------------------
  // MACHINES (25)
  // -------------------------------------------
  console.log('??? Creating machines...');

  const machinesData = [
    // 8 SOLD
    { id: 'mach-01', serialNumber: 'SN-2024-001', manufacturer: 'Ricoh', model: 'MP C3004', isColor: true, paperSize: 'A3_A4' as const, currentStatus: 'SOLD' as const, purchaseDate: new Date('2024-01-15'), purchasePrice: 85000, salePrice: 130000, saleDate: new Date('2024-02-10'), productId: 'prod-m-01', currentOwnerId: 'cust-1', customerLocationId: createdLocations[0].id },
    { id: 'mach-02', serialNumber: 'SN-2024-002', manufacturer: 'Ricoh', model: 'MP C4504', isColor: true, paperSize: 'A3_A4' as const, currentStatus: 'SOLD' as const, purchaseDate: new Date('2024-01-20'), purchasePrice: 120000, salePrice: 180000, saleDate: new Date('2024-03-05'), productId: 'prod-m-02', currentOwnerId: 'cust-2', customerLocationId: createdLocations[2].id },
    { id: 'mach-03', serialNumber: 'SN-2024-003', manufacturer: 'Canon', model: 'imageRUNNER C3326i', isColor: true, paperSize: 'A4' as const, currentStatus: 'SOLD' as const, purchaseDate: new Date('2024-02-01'), purchasePrice: 75000, salePrice: 115000, saleDate: new Date('2024-03-20'), productId: 'prod-m-04', currentOwnerId: 'cust-3', customerLocationId: createdLocations[4].id },
    { id: 'mach-04', serialNumber: 'SN-2024-004', manufacturer: 'Xerox', model: 'VersaLink C405', isColor: true, paperSize: 'A4' as const, currentStatus: 'SOLD' as const, purchaseDate: new Date('2024-02-15'), purchasePrice: 90000, salePrice: 140000, saleDate: new Date('2024-04-10'), productId: 'prod-m-06', currentOwnerId: 'cust-4', customerLocationId: createdLocations[6].id },
    { id: 'mach-05', serialNumber: 'SN-2024-005', manufacturer: 'Sharp', model: 'MX-3071', isColor: true, paperSize: 'A3_A4' as const, currentStatus: 'SOLD' as const, purchaseDate: new Date('2024-03-01'), purchasePrice: 95000, salePrice: 145000, saleDate: new Date('2024-04-25'), productId: 'prod-m-08', currentOwnerId: 'cust-6', customerLocationId: createdLocations[10].id },
    { id: 'mach-06', serialNumber: 'SN-2024-006', manufacturer: 'Konica Minolta', model: 'bizhub C250i', isColor: true, paperSize: 'A4' as const, currentStatus: 'SOLD' as const, purchaseDate: new Date('2024-03-10'), purchasePrice: 80000, salePrice: 125000, saleDate: new Date('2024-05-05'), productId: 'prod-m-10', currentOwnerId: 'cust-8', customerLocationId: createdLocations[14].id },
    { id: 'mach-07', serialNumber: 'SN-2024-007', manufacturer: 'Ricoh', model: 'MP 2554', isColor: false, paperSize: 'A4' as const, currentStatus: 'SOLD' as const, purchaseDate: new Date('2024-01-10'), purchasePrice: 45000, salePrice: 72000, saleDate: new Date('2024-02-20'), productId: 'prod-m-03', currentOwnerId: 'cust-5', customerLocationId: createdLocations[8].id },
    { id: 'mach-08', serialNumber: 'SN-2024-008', manufacturer: 'Canon', model: 'imageRUNNER ADVANCE 6565i', isColor: false, paperSize: 'A3_A4' as const, currentStatus: 'SOLD' as const, purchaseDate: new Date('2024-04-01'), purchasePrice: 150000, salePrice: 230000, saleDate: new Date('2024-05-15'), productId: 'prod-m-05', currentOwnerId: 'cust-12', customerLocationId: createdLocations[20].id },
    // 5 RENTED
    { id: 'mach-09', serialNumber: 'SN-2024-009', manufacturer: 'Ricoh', model: 'MP 3055', isColor: false, paperSize: 'A4' as const, currentStatus: 'RENTED' as const, purchaseDate: new Date('2024-02-01'), purchasePrice: 52000, productId: 'prod-m-12', currentOwnerId: 'cust-7', customerLocationId: createdLocations[13].id },
    { id: 'mach-10', serialNumber: 'SN-2024-010', manufacturer: 'Xerox', model: 'WorkCentre 6515', isColor: true, paperSize: 'A4' as const, currentStatus: 'RENTED' as const, purchaseDate: new Date('2024-02-20'), purchasePrice: 65000, productId: 'prod-m-07', currentOwnerId: 'cust-9', customerLocationId: createdLocations[16].id },
    { id: 'mach-11', serialNumber: 'SN-2024-011', manufacturer: 'Sharp', model: 'MX-M264N', isColor: false, paperSize: 'A4' as const, currentStatus: 'RENTED' as const, purchaseDate: new Date('2024-03-15'), purchasePrice: 35000, productId: 'prod-m-09', currentOwnerId: 'cust-10', customerLocationId: createdLocations[17].id },
    { id: 'mach-12', serialNumber: 'SN-2024-012', manufacturer: 'Konica Minolta', model: 'bizhub 458', isColor: false, paperSize: 'A4' as const, currentStatus: 'RENTED' as const, purchaseDate: new Date('2024-03-20'), purchasePrice: 55000, productId: 'prod-m-11', currentOwnerId: 'cust-14', customerLocationId: createdLocations[23].id },
    { id: 'mach-13', serialNumber: 'SN-2024-013', manufacturer: 'Canon', model: 'imageRUNNER 2625', isColor: false, paperSize: 'A4' as const, currentStatus: 'RENTED' as const, purchaseDate: new Date('2024-04-05'), purchasePrice: 42000, productId: 'prod-m-13', currentOwnerId: 'cust-15', customerLocationId: createdLocations[24].id },
    // 5 IN_WAREHOUSE
    { id: 'mach-14', serialNumber: 'SN-2024-014', manufacturer: 'Ricoh', model: 'MP C3004', isColor: true, paperSize: 'A3_A4' as const, currentStatus: 'IN_WAREHOUSE' as const, purchaseDate: new Date('2024-05-01'), purchasePrice: 85000, productId: 'prod-m-01' },
    { id: 'mach-15', serialNumber: 'SN-2024-015', manufacturer: 'Ricoh', model: 'MP C4504', isColor: true, paperSize: 'A3_A4' as const, currentStatus: 'IN_WAREHOUSE' as const, purchaseDate: new Date('2024-05-10'), purchasePrice: 120000, productId: 'prod-m-02' },
    { id: 'mach-16', serialNumber: 'SN-2024-016', manufacturer: 'Xerox', model: 'VersaLink B405', isColor: false, paperSize: 'A4' as const, currentStatus: 'IN_WAREHOUSE' as const, purchaseDate: new Date('2024-05-15'), purchasePrice: 48000, productId: 'prod-m-14' },
    { id: 'mach-17', serialNumber: 'SN-2024-017', manufacturer: 'Konica Minolta', model: 'bizhub C3110', isColor: true, paperSize: 'A4' as const, currentStatus: 'IN_WAREHOUSE' as const, purchaseDate: new Date('2024-06-01'), purchasePrice: 38000, productId: 'prod-m-15' },
    { id: 'mach-18', serialNumber: 'SN-2024-018', manufacturer: 'Ricoh', model: 'MP 2554', isColor: false, paperSize: 'A4' as const, currentStatus: 'IN_WAREHOUSE' as const, purchaseDate: new Date('2024-06-10'), purchasePrice: 45000, productId: 'prod-m-03' },
    // 3 UNDER_MAINTENANCE
    { id: 'mach-19', serialNumber: 'SN-2024-019', manufacturer: 'Canon', model: 'imageRUNNER C3326i', isColor: true, paperSize: 'A4' as const, currentStatus: 'UNDER_MAINTENANCE' as const, purchaseDate: new Date('2024-01-25'), purchasePrice: 75000, productId: 'prod-m-04', currentOwnerId: 'cust-11', customerLocationId: createdLocations[19].id },
    { id: 'mach-20', serialNumber: 'SN-2024-020', manufacturer: 'Sharp', model: 'MX-3071', isColor: true, paperSize: 'A3_A4' as const, currentStatus: 'UNDER_MAINTENANCE' as const, purchaseDate: new Date('2024-02-10'), purchasePrice: 95000, productId: 'prod-m-08', currentOwnerId: 'cust-13', customerLocationId: createdLocations[22].id },
    { id: 'mach-21', serialNumber: 'SN-2024-021', manufacturer: 'Xerox', model: 'VersaLink C405', isColor: true, paperSize: 'A4' as const, currentStatus: 'UNDER_MAINTENANCE' as const, purchaseDate: new Date('2024-03-05'), purchasePrice: 90000, productId: 'prod-m-06', currentOwnerId: 'cust-1', customerLocationId: createdLocations[1].id },
    // 2 UNDER_INSPECTION
    { id: 'mach-22', serialNumber: 'SN-2024-022', manufacturer: 'Konica Minolta', model: 'bizhub C250i', isColor: true, paperSize: 'A4' as const, currentStatus: 'UNDER_INSPECTION' as const, purchaseDate: new Date('2024-04-10'), purchasePrice: 80000, productId: 'prod-m-10' },
    { id: 'mach-23', serialNumber: 'SN-2024-023', manufacturer: 'Ricoh', model: 'MP 3055', isColor: false, paperSize: 'A4' as const, currentStatus: 'UNDER_INSPECTION' as const, purchaseDate: new Date('2024-04-20'), purchasePrice: 52000, productId: 'prod-m-12' },
    // 2 SCRAPPED
    { id: 'mach-24', serialNumber: 'SN-2024-024', manufacturer: 'Ricoh', model: 'MP C3004', isColor: true, paperSize: 'A3_A4' as const, currentStatus: 'SCRAPPED' as const, purchaseDate: new Date('2023-06-01'), purchasePrice: 85000, productId: 'prod-m-01' },
    { id: 'mach-25', serialNumber: 'SN-2024-025', manufacturer: 'Xerox', model: 'WorkCentre 6515', isColor: true, paperSize: 'A4' as const, currentStatus: 'SCRAPPED' as const, purchaseDate: new Date('2023-08-15'), purchasePrice: 65000, productId: 'prod-m-07' },
  ];

  const createdMachines: Awaited<ReturnType<typeof prisma.machine.create>>[] = [];
  for (const m of machinesData) {
    const mach = await prisma.machine.create({ data: m });
    createdMachines.push(mach);
  }

  // -------------------------------------------
  // MACHINE OWNER HISTORY
  // -------------------------------------------
  console.log('?? Creating machine owner history...');

  const historyEntries = [
    // mach-01: purchased then sold
    { machineId: 'mach-01', transactionType: 'TRANSFER' as const, companyId: company1.id, date: new Date('2024-01-15'), financialValue: 85000, notes: 'Transfer to inventory' },
    { machineId: 'mach-01', transactionType: 'SALE' as const, customerId: 'cust-1', companyId: company1.id, date: new Date('2024-02-10'), financialValue: 130000, notes: 'Sold to maktb al-nour' },
    // mach-02
    { machineId: 'mach-02', transactionType: 'TRANSFER' as const, companyId: company1.id, date: new Date('2024-01-20'), financialValue: 120000, notes: 'Transfer to inventory' },
    { machineId: 'mach-02', transactionType: 'SALE' as const, customerId: 'cust-2', companyId: company1.id, date: new Date('2024-03-05'), financialValue: 180000, notes: 'Sold to al-shrooq' },
    // mach-03
    { machineId: 'mach-03', transactionType: 'TRANSFER' as const, companyId: company1.id, date: new Date('2024-02-01'), financialValue: 75000, notes: 'Transfer to inventory' },
    { machineId: 'mach-03', transactionType: 'SALE' as const, customerId: 'cust-3', companyId: company1.id, date: new Date('2024-03-20'), financialValue: 115000, notes: 'Sold to maktb al-salam' },
    // mach-09 (rented)
    { machineId: 'mach-09', transactionType: 'TRANSFER' as const, companyId: company1.id, date: new Date('2024-02-01'), financialValue: 52000, notes: 'Transfer to inventory' },
    { machineId: 'mach-09', transactionType: 'RENTAL' as const, customerId: 'cust-7', companyId: company1.id, date: new Date('2024-03-15'), financialValue: 3500, notes: 'Rental to al-najah' },
    // mach-19 (maintenance)
    { machineId: 'mach-19', transactionType: 'SALE' as const, customerId: 'cust-11', companyId: company1.id, date: new Date('2024-02-15'), financialValue: 110000, notes: 'Sold to maktb al-adl' },
    { machineId: 'mach-19', transactionType: 'MAINTENANCE' as const, customerId: 'cust-11', companyId: company1.id, date: new Date('2024-06-01'), notes: 'Sent for maintenance' },
    // mach-24 (scrapped)
    { machineId: 'mach-24', transactionType: 'TRANSFER' as const, companyId: company1.id, date: new Date('2023-06-01'), financialValue: 85000, notes: 'Transfer to inventory' },
    { machineId: 'mach-24', transactionType: 'SALE' as const, customerId: 'cust-3', companyId: company1.id, date: new Date('2023-07-01'), financialValue: 120000, notes: 'Original sale' },
    { machineId: 'mach-24', transactionType: 'RETURN' as const, customerId: 'cust-3', companyId: company1.id, date: new Date('2024-01-10'), notes: 'Customer return' },
    { machineId: 'mach-24', transactionType: 'SCRAP' as const, companyId: company1.id, date: new Date('2024-05-01'), financialValue: 2000, notes: 'Scrapped - beyond repair' },
  ];

  for (const h of historyEntries) {
    await prisma.machineOwnerHistory.create({ data: h });
  }

  // -------------------------------------------
  // METER READINGS (40+)
  // -------------------------------------------
  console.log('?? Creating meter readings...');

  const soldRentedIds = ['mach-01', 'mach-02', 'mach-03', 'mach-04', 'mach-05', 'mach-06', 'mach-07', 'mach-08', 'mach-09', 'mach-10', 'mach-11', 'mach-12', 'mach-13'];
  let readingCounter = 0;
  for (const machId of soldRentedIds) {
    const base = readingCounter * 5000 + 10000;
    const dates = ['2024-03-01', '2024-04-01', '2024-05-01', '2024-06-01'];
    for (let i = 0; i < dates.length; i++) {
      await prisma.meterReading.create({
        data: {
          machineId: machId,
          reading: base + (i + 1) * 2500,
          source: i % 2 === 0 ? 'MANUAL' : 'OCR',
          readingDate: new Date(dates[i]),
        },
      });
    }
    readingCounter++;
  }

  // -------------------------------------------
  // WAREHOUSE INVENTORY
  // -------------------------------------------
  console.log('?? Creating warehouse inventory...');

  // Machines in wh-1
  const warehouseMachines = ['mach-14', 'mach-15', 'mach-16', 'mach-17', 'mach-18', 'mach-22', 'mach-23'];
  const wh1Products = ['prod-m-01', 'prod-m-02', 'prod-m-03', 'prod-m-04', 'prod-m-05', 'prod-m-06', 'prod-m-07', 'prod-m-12', 'prod-m-13', 'prod-m-14'];
  for (const pid of wh1Products) {
    await prisma.warehouseInventory.create({
      data: { warehouseId: wh1.id, productId: pid, quantity: Math.floor(Math.random() * 5) + 1 },
    });
  }

  // Spare parts in wh-2
  const wh2SpareParts = ['prod-sp-01', 'prod-sp-02', 'prod-sp-03', 'prod-sp-04', 'prod-sp-05', 'prod-sp-06', 'prod-sp-07', 'prod-sp-08', 'prod-sp-09', 'prod-sp-10', 'prod-sp-11', 'prod-sp-12', 'prod-sp-13', 'prod-sp-14', 'prod-sp-15'];
  for (const pid of wh2SpareParts) {
    await prisma.warehouseInventory.create({
      data: { warehouseId: wh2.id, productId: pid, quantity: Math.floor(Math.random() * 20) + 5 },
    });
  }

  // Some items in wh-3 (workshop)
  for (const pid of ['prod-sp-01', 'prod-sp-03', 'prod-sp-04', 'prod-sp-08']) {
    await prisma.warehouseInventory.create({
      data: { warehouseId: wh3.id, productId: pid, quantity: Math.floor(Math.random() * 10) + 2 },
    });
  }

  // -------------------------------------------
  // STOCK MOVEMENTS - PURCHASE IN
  // -------------------------------------------
  console.log('?? Creating stock movements...');

  const allProducts = [...createdMachineProducts, ...createdSpareParts];
  for (const prod of allProducts) {
    const whId = prod.productType === 'MACHINE' ? wh1.id : (prod.companyId === company1.id ? wh2.id : wh2.id);
    await prisma.stockMovement.create({
      data: {
        warehouseId: prod.productType === 'MACHINE' ? wh1.id : wh2.id,
        productId: prod.id,
        quantity: prod.productType === 'MACHINE' ? 5 : 50,
        movementType: 'PURCHASE_IN',
        notes: 'Initial stock from supplier',
      },
    });
  }

  // -------------------------------------------
  // SPARE PART CUSTODY (10)
  // -------------------------------------------
  console.log('?? Creating spare part custody entries...');

  const custodyData = [
    { engineerId: 'eng-1', productId: 'prod-sp-01', quantityIssued: 5, quantityUsed: 3, quantityReturned: 2, status: 'RETURNED' as const, issuedAt: new Date('2024-03-01') },
    { engineerId: 'eng-1', productId: 'prod-sp-02', quantityIssued: 2, quantityUsed: 1, quantityReturned: 0, status: 'PARTIALLY_USED' as const, issuedAt: new Date('2024-04-10') },
    { engineerId: 'eng-2', productId: 'prod-sp-06', quantityIssued: 4, quantityUsed: 4, quantityReturned: 0, status: 'FULLY_USED' as const, issuedAt: new Date('2024-03-15') },
    { engineerId: 'eng-2', productId: 'prod-sp-07', quantityIssued: 6, quantityUsed: 2, quantityReturned: 4, status: 'RETURNED' as const, issuedAt: new Date('2024-04-01') },
    { engineerId: 'eng-3', productId: 'prod-sp-10', quantityIssued: 3, quantityUsed: 3, quantityReturned: 0, status: 'FULLY_USED' as const, issuedAt: new Date('2024-03-20') },
    { engineerId: 'eng-4', productId: 'prod-sp-03', quantityIssued: 2, quantityUsed: 1, quantityReturned: 0, status: 'PARTIALLY_USED' as const, issuedAt: new Date('2024-05-01') },
    { engineerId: 'eng-5', productId: 'prod-sp-04', quantityIssued: 3, quantityUsed: 3, quantityReturned: 0, status: 'FULLY_USED' as const, issuedAt: new Date('2024-03-10') },
    { engineerId: 'eng-5', productId: 'prod-sp-05', quantityIssued: 1, quantityUsed: 0, quantityReturned: 1, status: 'RETURNED' as const, issuedAt: new Date('2024-04-20') },
    { engineerId: 'eng-6', productId: 'prod-sp-14', quantityIssued: 4, quantityUsed: 2, quantityReturned: 0, status: 'ISSUED' as const, issuedAt: new Date('2024-05-15') },
    { engineerId: 'eng-1', productId: 'prod-sp-12', quantityIssued: 5, quantityUsed: 0, quantityReturned: 0, status: 'ISSUED' as const, issuedAt: new Date('2024-06-01') },
  ];

  for (const c of custodyData) {
    await prisma.sparePartCustody.create({ data: c });
  }

  // -------------------------------------------
  // PURCHASE ORDERS (5)
  // -------------------------------------------
  console.log('?? Creating purchase orders...');

  const po1 = await prisma.purchaseOrder.create({
    data: {
      id: 'po-1', companyId: company1.id, supplierId: 'sup-1', status: 'RECEIVED', total: 595000, orderDate: new Date('2024-01-10'), notes: 'Bulk order Ricoh machines',
      items: {
        create: [
          { productId: 'prod-m-01', quantity: 3, unitPrice: 85000 },
          { productId: 'prod-m-02', quantity: 2, unitPrice: 120000 },
          { productId: 'prod-m-03', quantity: 1, unitPrice: 45000 },
        ],
      },
    },
  });

  const po2 = await prisma.purchaseOrder.create({
    data: {
      id: 'po-2', companyId: company1.id, supplierId: 'sup-2', status: 'RECEIVED', total: 480000, orderDate: new Date('2024-02-01'), notes: 'Canon machines order',
      items: {
        create: [
          { productId: 'prod-m-04', quantity: 2, unitPrice: 75000 },
          { productId: 'prod-m-05', quantity: 2, unitPrice: 150000 },
        ],
      },
    },
  });

  const po3 = await prisma.purchaseOrder.create({
    data: {
      id: 'po-3', companyId: company1.id, supplierId: 'sup-3', status: 'CONFIRMED', total: 345000, orderDate: new Date('2024-04-15'), notes: 'Xerox machines order',
      items: {
        create: [
          { productId: 'prod-m-06', quantity: 2, unitPrice: 90000 },
          { productId: 'prod-m-07', quantity: 1, unitPrice: 65000 },
          { productId: 'prod-m-14', quantity: 1, unitPrice: 48000 },
        ],
      },
    },
  });

  const po4 = await prisma.purchaseOrder.create({
    data: {
      id: 'po-4', companyId: company2.id, supplierId: 'sup-4', status: 'RECEIVED', total: 395000, orderDate: new Date('2024-03-01'), notes: 'Sharp machines order',
      items: {
        create: [
          { productId: 'prod-m-08', quantity: 3, unitPrice: 95000 },
          { productId: 'prod-m-09', quantity: 2, unitPrice: 35000 },
        ],
      },
    },
  });

  const po5 = await prisma.purchaseOrder.create({
    data: {
      id: 'po-5', companyId: company2.id, supplierId: 'sup-5', status: 'DRAFT', total: 308000, orderDate: new Date('2024-06-01'), notes: 'Konica Minolta machines - pending',
      items: {
        create: [
          { productId: 'prod-m-10', quantity: 2, unitPrice: 80000 },
          { productId: 'prod-m-11', quantity: 1, unitPrice: 55000 },
          { productId: 'prod-m-15', quantity: 1, unitPrice: 38000 },
        ],
      },
    },
  });

  // -------------------------------------------
  // SALES ORDERS (8)
  // -------------------------------------------
  console.log('?? Creating sales orders...');

  const so1 = await prisma.salesOrder.create({
    data: {
      id: 'so-1', companyId: company1.id, customerId: 'cust-1', orderType: 'MACHINE_SALE', status: 'DELIVERED', total: 130000, paymentMethod: 'CASH', paymentStatus: 'PAID', orderDate: new Date('2024-02-10'),
      items: { create: [{ productId: 'prod-m-01', quantity: 1, unitPrice: 130000 }] },
    },
  });

  const so2 = await prisma.salesOrder.create({
    data: {
      id: 'so-2', companyId: company1.id, customerId: 'cust-2', orderType: 'MACHINE_SALE', status: 'DELIVERED', total: 180000, paymentMethod: 'INSTALLMENT', paymentStatus: 'PARTIAL', orderDate: new Date('2024-03-05'),
      items: { create: [{ productId: 'prod-m-02', quantity: 1, unitPrice: 180000 }] },
      installments: {
        create: [
          { installmentNo: 1, amount: 60000, dueDate: new Date('2024-04-05'), paidDate: new Date('2024-04-03'), status: 'PAID' },
          { installmentNo: 2, amount: 60000, dueDate: new Date('2024-05-05'), paidDate: new Date('2024-05-02'), status: 'PAID' },
          { installmentNo: 3, amount: 60000, dueDate: new Date('2024-06-05'), status: 'PENDING' },
        ],
      },
    },
  });

  const so3 = await prisma.salesOrder.create({
    data: {
      id: 'so-3', companyId: company1.id, customerId: 'cust-3', orderType: 'MACHINE_SALE', status: 'DELIVERED', total: 115000, paymentMethod: 'CREDIT', paymentStatus: 'PAID', orderDate: new Date('2024-03-20'),
      items: { create: [{ productId: 'prod-m-04', quantity: 1, unitPrice: 115000 }] },
    },
  });

  const so4 = await prisma.salesOrder.create({
    data: {
      id: 'so-4', companyId: company1.id, customerId: 'cust-4', orderType: 'MACHINE_SALE', status: 'DELIVERED', total: 140000, paymentMethod: 'CASH', paymentStatus: 'PAID', orderDate: new Date('2024-04-10'),
      items: { create: [{ productId: 'prod-m-06', quantity: 1, unitPrice: 140000 }] },
    },
  });

  const so5 = await prisma.salesOrder.create({
    data: {
      id: 'so-5', companyId: company2.id, customerId: 'cust-6', orderType: 'MACHINE_SALE', status: 'DELIVERED', total: 145000, paymentMethod: 'INSTALLMENT', paymentStatus: 'PARTIAL', orderDate: new Date('2024-04-25'),
      items: { create: [{ productId: 'prod-m-08', quantity: 1, unitPrice: 145000 }] },
      installments: {
        create: [
          { installmentNo: 1, amount: 50000, dueDate: new Date('2024-05-25'), paidDate: new Date('2024-05-20'), status: 'PAID' },
          { installmentNo: 2, amount: 50000, dueDate: new Date('2024-06-25'), status: 'PENDING' },
          { installmentNo: 3, amount: 45000, dueDate: new Date('2024-07-25'), status: 'PENDING' },
        ],
      },
    },
  });

  const so6 = await prisma.salesOrder.create({
    data: {
      id: 'so-6', companyId: company1.id, customerId: 'cust-1', orderType: 'SPARE_PART_SALE', status: 'DELIVERED', total: 9600, discount: 600, paymentMethod: 'CASH', paymentStatus: 'PAID', orderDate: new Date('2024-05-01'),
      items: {
        create: [
          { productId: 'prod-sp-01', quantity: 3, unitPrice: 2200, discount: 200 },
          { productId: 'prod-sp-02', quantity: 1, unitPrice: 3000 },
        ],
      },
    },
  });

  const so7 = await prisma.salesOrder.create({
    data: {
      id: 'so-7', companyId: company1.id, customerId: 'cust-5', orderType: 'SPARE_PART_SALE', status: 'CONFIRMED', total: 7500, paymentMethod: 'CREDIT', paymentStatus: 'PENDING', orderDate: new Date('2024-06-01'),
      items: {
        create: [
          { productId: 'prod-sp-06', quantity: 2, unitPrice: 3200 },
          { productId: 'prod-sp-07', quantity: 1, unitPrice: 1100 },
        ],
      },
    },
  });

  const so8 = await prisma.salesOrder.create({
    data: {
      id: 'so-8', companyId: company1.id, customerId: 'cust-8', orderType: 'MACHINE_SALE', status: 'DELIVERED', total: 125000, paymentMethod: 'MIXED', paymentStatus: 'PAID', discount: 5000, orderDate: new Date('2024-05-05'),
      items: { create: [{ productId: 'prod-m-10', quantity: 1, unitPrice: 130000, discount: 5000 }] },
    },
  });

  // -------------------------------------------
  // CONTRACTS (6)
  // -------------------------------------------
  console.log('?? Creating contracts...');

  const contract1 = await prisma.contract.create({
    data: {
      id: 'contract-1', contractNumber: 'CNT-2024-001', customerId: 'cust-1', contractType: 'MAINTENANCE', status: 'ACTIVE', startDate: new Date('2024-01-01'), endDate: new Date('2025-01-01'), value: 24000, billingCycle: 'MONTHLY', visitLimit: 4, costPerCopy: 0.30, notes: 'Maintenance contract for maktb al-nour',
      machines: { create: [{ machineId: 'mach-01' }] },
    },
  });

  const contract2 = await prisma.contract.create({
    data: {
      id: 'contract-2', contractNumber: 'CNT-2024-002', customerId: 'cust-2', contractType: 'MAINTENANCE', status: 'ACTIVE', startDate: new Date('2024-03-01'), endDate: new Date('2025-03-01'), value: 36000, billingCycle: 'MONTHLY', visitLimit: 4, costPerCopy: 0.35, notes: 'Maintenance for al-shrooq',
      machines: { create: [{ machineId: 'mach-02' }] },
    },
  });

  const contract3 = await prisma.contract.create({
    data: {
      id: 'contract-3', contractNumber: 'CNT-2024-003', customerId: 'cust-4', contractType: 'MAINTENANCE', status: 'ACTIVE', startDate: new Date('2024-04-01'), endDate: new Date('2025-04-01'), value: 60000, billingCycle: 'MONTHLY', visitLimit: 6, costPerCopy: 0.40, notes: 'Maintenance and parts for al-fagr',
      machines: { create: [{ machineId: 'mach-04' }] },
    },
  });

  const contract4 = await prisma.contract.create({
    data: {
      id: 'contract-4', contractNumber: 'CNT-2024-004', customerId: 'cust-6', contractType: 'MAINTENANCE', status: 'ACTIVE', startDate: new Date('2024-05-01'), endDate: new Date('2025-05-01'), value: 48000, billingCycle: 'MONTHLY', visitLimit: 4, costPerCopy: 0.35, notes: 'Maintenance and parts for al-aman',
      machines: { create: [{ machineId: 'mach-05' }] },
    },
  });

  const contract5 = await prisma.contract.create({
    data: {
      id: 'contract-5', contractNumber: 'CNT-2024-005', customerId: 'cust-7', contractType: 'RENTAL', status: 'ACTIVE', startDate: new Date('2024-03-15'), endDate: new Date('2025-03-15'), value: 42000, billingCycle: 'MONTHLY', costPerCopy: 0.25, notes: 'Rental contract for al-najah',
      machines: { create: [{ machineId: 'mach-09' }] },
    },
  });

  const contract6 = await prisma.contract.create({
    data: {
      id: 'contract-6', contractNumber: 'CNT-2024-006', customerId: 'cust-8', contractType: 'MAINTENANCE', status: 'EXPIRED', startDate: new Date('2023-06-01'), endDate: new Date('2024-06-01'), value: 18000, billingCycle: 'QUARTERLY', visitLimit: 3, costPerCopy: 0.30, notes: 'Expired maintenance contract for al-amal',
      machines: { create: [{ machineId: 'mach-06' }] },
    },
  });

  // -------------------------------------------
  // SERVICE REQUESTS (15)
  // -------------------------------------------
  console.log('?? Creating service requests...');

  const sr1 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-1', requestNumber: 'SR-2024-001', customerId: 'cust-1', locationId: createdLocations[0].id, machineId: 'mach-01', description: 'خطأ في الوحدة أثناء التشغيل', priority: 'URGENT', status: 'CLOSED', engineerId: 'eng-1', companyId: company1.id, customerRating: 5, ratingNotes: 'خدمة ممتازة',
      problems: { create: [{ description: 'Drum unit needs replacement' }] },
    },
  });

  const sr2 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-2', requestNumber: 'SR-2024-002', customerId: 'cust-2', locationId: createdLocations[2].id, machineId: 'mach-02', description: '☓ وقوع في الورقة', priority: 'IMPORTANT', status: 'RESOLVED', engineerId: 'eng-4', companyId: company1.id, customerRating: 4, ratingNotes: 'جيد جدا',
      problems: { create: [{ description: 'Paper feed roller worn out' }, { description: 'Pickup roller needs cleaning' }] },
    },
  });

  const sr3 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-3', requestNumber: 'SR-2024-003', customerId: 'cust-3', locationId: createdLocations[4].id, machineId: 'mach-03',       description: 'Noise coming from machine during operation', priority: 'NORMAL', status: 'VISITED', engineerId: 'eng-5', companyId: company1.id,
      problems: { create: [{ description: 'Unusual noise during printing' }] },
    },
  });

  const sr4 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-4', requestNumber: 'SR-2024-004', customerId: 'cust-4', locationId: createdLocations[6].id, machineId: 'mach-04', description: 'Machine showing error code SC542', priority: 'URGENT', status: 'ASSIGNED', engineerId: 'eng-2', companyId: company1.id,
      problems: { create: [{ description: 'SC542 fuser error' }] },
    },
  });

  const sr5 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-5', requestNumber: 'SR-2024-005', customerId: 'cust-6', locationId: createdLocations[10].id, machineId: 'mach-05', description: 'Printer jams frequently', priority: 'IMPORTANT', status: 'NEW', companyId: company2.id,
      problems: { create: [{ description: 'Paper jams in fuser area' }, { description: 'Rollers need replacement' }] },
    },
  });

  const sr6 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-6', requestNumber: 'SR-2024-006', customerId: 'cust-7', locationId: createdLocations[13].id, machineId: 'mach-09', description: 'Spots on printed pages', priority: 'NORMAL', status: 'CLOSED', engineerId: 'eng-4', companyId: company1.id, customerRating: 4,
      problems: { create: [{ description: 'Drum unit contamination' }] },
    },
  });

  const sr7 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-7', requestNumber: 'SR-2024-007', customerId: 'cust-11', locationId: createdLocations[19].id, machineId: 'mach-19', description: 'Machine does not power on', priority: 'EMERGENCY', status: 'VISITED', engineerId: 'eng-1', companyId: company1.id,
      problems: { create: [{ description: 'Power supply failure' }] },
    },
  });

  const sr8 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-8', requestNumber: 'SR-2024-008', customerId: 'cust-13', locationId: createdLocations[22].id, machineId: 'mach-20', description: 'Low print quality', priority: 'NORMAL', status: 'ASSIGNED', engineerId: 'eng-3', companyId: company2.id,
      problems: { create: [{ description: 'Toner concentration issue' }] },
    },
  });

  const sr9 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-9', requestNumber: 'SR-2024-009', customerId: 'cust-9', locationId: createdLocations[16].id, machineId: 'mach-10', description: 'Paper skew when printing', priority: 'NORMAL', status: 'NEW', companyId: company1.id,
      problems: { create: [{ description: 'Paper alignment issue' }] },
    },
  });

  const sr10 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-10', requestNumber: 'SR-2024-010', customerId: 'cust-10', locationId: createdLocations[17].id, machineId: 'mach-11', description: 'Machine slow startup', priority: 'NORMAL', status: 'RESOLVED', engineerId: 'eng-2', companyId: company1.id, customerRating: 5,
      problems: { create: [{ description: 'Firmware update needed' }] },
    },
  });

  const sr11 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-11', requestNumber: 'SR-2024-011', customerId: 'cust-1', locationId: createdLocations[1].id, machineId: 'mach-21', description: 'Toner leaking from cartridge', priority: 'IMPORTANT', status: 'NEW', companyId: company1.id,
      problems: { create: [{ description: 'Toner cartridge seal broken' }] },
    },
  });

  const sr12 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-12', requestNumber: 'SR-2024-012', customerId: 'cust-14', locationId: createdLocations[23].id, machineId: 'mach-12', description: 'Scanner not working', priority: 'URGENT', status: 'ASSIGNED', engineerId: 'eng-6', companyId: company2.id,
      problems: { create: [{ description: 'Scanner lamp failure' }] },
    },
  });

  const sr13 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-13', requestNumber: 'SR-2024-013', customerId: 'cust-15', locationId: createdLocations[24].id, machineId: 'mach-13', description: 'Stapler not functioning', priority: 'NORMAL', status: 'VISITED', engineerId: 'eng-5', companyId: company1.id,
      problems: { create: [{ description: 'Stapler mechanism jam' }] },
    },
  });

  const sr14 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-14', requestNumber: 'SR-2024-014', customerId: 'cust-5', locationId: createdLocations[8].id, machineId: 'mach-07', description: 'Network connectivity issue', priority: 'NORMAL', status: 'CLOSED', engineerId: 'eng-1', companyId: company1.id, customerRating: 5,
      problems: { create: [{ description: 'Network card faulty' }] },
    },
  });

  const sr15 = await prisma.serviceRequest.create({
    data: {
      id: 'sr-15', requestNumber: 'SR-2024-015', customerId: 'cust-12', locationId: createdLocations[20].id, machineId: 'mach-08', description: 'Blank pages printing', priority: 'IMPORTANT', status: 'NEW', companyId: company1.id,
      problems: { create: [{ description: 'Drum unit end of life' }, { description: 'Laser unit may need cleaning' }] },
    },
  });

  // -------------------------------------------
  // VISITS (20)
  // -------------------------------------------
  console.log('?? Creating visits...');

  const visitsData = [
    { serviceRequestId: 'sr-1', engineerId: 'eng-1', visitedAt: new Date('2024-02-15'), resolved: true, resolutionNotes: 'Replaced drum unit', partsUsed: 'Drum Unit Ricoh MP C3004' },
    { serviceRequestId: 'sr-1', engineerId: 'eng-1', visitedAt: new Date('2024-02-20'), resolved: true, resolutionNotes: 'Follow-up check - all good', contractId: 'contract-1' },
    { serviceRequestId: 'sr-2', engineerId: 'eng-4', visitedAt: new Date('2024-03-10'), resolved: true, resolutionNotes: 'Replaced pickup roller', partsUsed: 'Roller Feed Xerox 6515' },
    { serviceRequestId: 'sr-3', engineerId: 'eng-5', visitedAt: new Date('2024-04-01'), resolved: false, resolutionNotes: 'Noise identified - need fuser unit replacement' },
    { serviceRequestId: 'sr-4', engineerId: 'eng-2', visitedAt: new Date('2024-05-01'), resolved: false, resolutionNotes: 'Diagnosed fuser heater failure' },
    { serviceRequestId: 'sr-6', engineerId: 'eng-4', visitedAt: new Date('2024-04-15'), resolved: true, resolutionNotes: 'Cleaned drum, replaced toner', partsUsed: 'Toner Ricoh MP 3055' },
    { serviceRequestId: 'sr-7', engineerId: 'eng-1', visitedAt: new Date('2024-06-05'), resolved: false, resolutionNotes: 'Power supply unit burnt - needs replacement' },
    { serviceRequestId: 'sr-8', engineerId: 'eng-3', visitedAt: new Date('2024-06-10'), resolved: false, resolutionNotes: 'Ordered new toner' },
    { serviceRequestId: 'sr-10', engineerId: 'eng-2', visitedAt: new Date('2024-05-15'), resolved: true, resolutionNotes: 'Updated firmware to latest version' },
    { serviceRequestId: 'sr-13', engineerId: 'eng-5', visitedAt: new Date('2024-06-01'), resolved: false, resolutionNotes: 'Stapler mechanism needs part replacement' },
    { serviceRequestId: 'sr-14', engineerId: 'eng-1', visitedAt: new Date('2024-05-20'), resolved: true, resolutionNotes: 'Replaced network card', partsUsed: 'Network Card' },
    { serviceRequestId: 'sr-14', engineerId: 'eng-1', visitedAt: new Date('2024-05-25'), resolved: true, resolutionNotes: 'Confirmed network stable', contractId: 'contract-1' },
    { serviceRequestId: 'sr-6', engineerId: 'eng-4', visitedAt: new Date('2024-04-20'), resolved: true, resolutionNotes: 'Final check - resolved', contractId: 'contract-2' },
    { serviceRequestId: 'sr-1', engineerId: 'eng-1', visitedAt: new Date('2024-03-01'), resolved: true, resolutionNotes: 'Monthly maintenance check', contractId: 'contract-1' },
    { serviceRequestId: 'sr-2', engineerId: 'eng-4', visitedAt: new Date('2024-03-15'), resolved: true, resolutionNotes: 'Preventive maintenance', contractId: 'contract-2' },
    { serviceRequestId: 'sr-7', engineerId: 'eng-1', visitedAt: new Date('2024-06-10'), resolved: false, resolutionNotes: 'Awaiting power supply part' },
    { serviceRequestId: 'sr-3', engineerId: 'eng-5', visitedAt: new Date('2024-04-05'), resolved: true, resolutionNotes: 'Replaced fuser unit', partsUsed: 'Fuser Unit Canon C3326i' },
    { serviceRequestId: 'sr-10', engineerId: 'eng-2', visitedAt: new Date('2024-05-10'), resolved: true, resolutionNotes: 'Initial diagnosis' },
    { serviceRequestId: 'sr-8', engineerId: 'eng-3', visitedAt: new Date('2024-06-15'), resolved: false, resolutionNotes: 'Cleaning done, monitoring' },
    { serviceRequestId: 'sr-12', engineerId: 'eng-6', visitedAt: new Date('2024-06-12'), resolved: false, resolutionNotes: 'Scanner lamp needs replacement' },
  ];

  for (const v of visitsData) {
    await prisma.visit.create({ data: v });
  }

  // -------------------------------------------
  // SETTLEMENTS (10)
  // -------------------------------------------
  console.log('?? Creating settlements...');

  // شركة جملة آلات (company1) - مبيعات آلات + إيجار + أقساط
  // شركة جملة قطع غيار (company2) - مبيعات قطع غيار + صيانة
  // شركة القطاعي (company3) - خدمات + صيانة + بيع

  const settlementsData = [
    // ===== شركة جملة آلات (company1) — 10 تسوية =====
    { settlementNumber: 'STL-2024-001', companyId: company1.id, customerId: 'cust-1', engineerId: 'eng-1', amount: 130000, paymentMethod: 'CASH' as const, reason: 'بيع جهاز Ricoh C3004 — مكتبة النور', status: 'VERIFIED' as const, collectedBy: user1.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-002', companyId: company1.id, customerId: 'cust-2', amount: 60000, paymentMethod: 'CASH' as const, reason: 'قسط أول — جهاز Ricoh C4504 — الشروق', status: 'VERIFIED' as const, collectedBy: user7.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-003', companyId: company1.id, customerId: 'cust-3', engineerId: 'eng-5', amount: 115000, paymentMethod: 'CREDIT' as const, reason: 'بيع جهاز Canon C3326i — النهضة', status: 'VERIFIED' as const, collectedBy: user1.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-004', companyId: company1.id, customerId: 'cust-4', amount: 140000, paymentMethod: 'CASH' as const, reason: 'بيع جهاز Xerox VersaLink C405 — الفجر', status: 'INITIAL' as const, collectedBy: user1.id },
    { settlementNumber: 'STL-2024-005', companyId: company1.id, customerId: 'cust-2', amount: 60000, paymentMethod: 'CASH' as const, reason: 'قسط ثاني — جهاز Ricoh C4504 — الشروق', status: 'INITIAL' as const, collectedBy: user7.id },
    { settlementNumber: 'STL-2024-006', companyId: company1.id, customerId: 'cust-1', engineerId: 'eng-1', amount: 2000, paymentMethod: 'CASH' as const, reason: 'بيع قطع غيار — درام يونيتس', status: 'VERIFIED' as const, collectedBy: user7.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-007', companyId: company1.id, engineerId: 'eng-4', amount: 3500, paymentMethod: 'CASH' as const, reason: 'تحصيل إيجار شهري — mach-09', status: 'INITIAL' as const, collectedBy: user4.id },
    { settlementNumber: 'STL-2024-008', companyId: company1.id, customerId: 'cust-8', engineerId: 'eng-3', amount: 125000, paymentMethod: 'MIXED' as const, reason: 'بيع جهاز Konica C250i — الأعمال', status: 'VERIFIED' as const, collectedBy: user1.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-009', companyId: company1.id, customerId: 'cust-5', amount: 7500, paymentMethod: 'CREDIT' as const, reason: 'مبيعة قطع غيار — رولرات —曙光', status: 'INITIAL' as const, collectedBy: user7.id },
    { settlementNumber: 'STL-2024-010', companyId: company1.id, customerId: 'cust-9', engineerId: 'eng-2', amount: 82000, paymentMethod: 'CASH' as const, reason: 'بيع جهاز Ricoh 3055 — المizrab', status: 'INITIAL' as const, collectedBy: user1.id },

    // ===== شركة جملة قطع غيار (company2) — 10 تسوية =====
    { settlementNumber: 'STL-2024-011', companyId: company2.id, customerId: 'cust-6', amount: 50000, paymentMethod: 'CASH' as const, reason: 'قسط أول — جهاز Sharp MX-3071 — الأمان', status: 'VERIFIED' as const, collectedBy: user2.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-012', companyId: company2.id, customerId: 'cust-14', engineerId: 'eng-6', amount: 8000, paymentMethod: 'CASH' as const, reason: 'بيع قطع غيار + صيانة — أجهزة Konica', status: 'VERIFIED' as const, collectedBy: user2.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-013', companyId: company2.id, customerId: 'cust-10', amount: 22000, paymentMethod: 'CASH' as const, reason: 'بيع 3 درام يونيتس — Sharp MX', status: 'INITIAL' as const, collectedBy: user2.id },
    { settlementNumber: 'STL-2024-014', companyId: company2.id, customerId: 'cust-11', engineerId: 'eng-3', amount: 15000, paymentMethod: 'CREDIT' as const, reason: 'بيع طبول + رولرات — Konica bizhub', status: 'INITIAL' as const, collectedBy: user2.id },
    { settlementNumber: 'STL-2024-015', companyId: company2.id, customerId: 'cust-6', amount: 50000, paymentMethod: 'CASH' as const, reason: 'قسط ثاني — جهاز Sharp MX-3071 — الأمان', status: 'INITIAL' as const, collectedBy: user2.id },
    { settlementNumber: 'STL-2024-016', companyId: company2.id, customerId: 'cust-12', engineerId: 'eng-6', amount: 4500, paymentMethod: 'CASH' as const, reason: 'بيع فلاتر + كمية تونر — Sharp MX-M264', status: 'VERIFIED' as const, collectedBy: user2.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-017', companyId: company2.id, customerId: 'cust-13', amount: 35000, paymentMethod: 'INSTALLMENT' as const, reason: 'بيع جهاز Konica C3110 — النور', status: 'INITIAL' as const, collectedBy: user2.id },
    { settlementNumber: 'STL-2024-018', companyId: company2.id, customerId: 'cust-15', engineerId: 'eng-2', amount: 12000, paymentMethod: 'CASH' as const, reason: 'بيع قطع غيار — رولرات Xerox WorkCentre', status: 'INITIAL' as const, collectedBy: user2.id },
    { settlementNumber: 'STL-2024-019', companyId: company2.id, customerId: 'cust-10', amount: 18000, paymentMethod: 'CASH' as const, reason: 'بيع طبورة + درام — Konica 458', status: 'VERIFIED' as const, collectedBy: user2.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-020', companyId: company2.id, customerId: 'cust-14', amount: 6500, paymentMethod: 'CASH' as const, reason: 'بيع قطع غيار — فلاتر + وصلات', status: 'INITIAL' as const, collectedBy: user2.id },

    // ===== شركة القطاعي (company3) — 10 تسوية =====
    { settlementNumber: 'STL-2024-021', companyId: company3.id, customerId: 'cust-7', engineerId: 'eng-4', amount: 42000, paymentMethod: 'CASH' as const, reason: 'تحصيل إيجار شهري — عقد الإيجار — النجاح', status: 'VERIFIED' as const, collectedBy: user4.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-022', companyId: company3.id, customerId: 'cust-9', amount: 28000, paymentMethod: 'CASH' as const, reason: 'بيع جهاز Xerox B405 — المزرع', status: 'INITIAL' as const, collectedBy: user4.id },
    { settlementNumber: 'STL-2024-023', companyId: company3.id, customerId: 'cust-11', engineerId: 'eng-3', amount: 16000, paymentMethod: 'CREDIT' as const, reason: 'بيع قطع غيار — بكرات — Konica bizhub', status: 'INITIAL' as const, collectedBy: user4.id },
    { settlementNumber: 'STL-2024-024', companyId: company3.id, customerId: 'cust-15', engineerId: 'eng-2', amount: 58000, paymentMethod: 'CASH' as const, reason: 'بيع جهاز Xerox WorkCentre 6515', status: 'VERIFIED' as const, collectedBy: user4.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-025', companyId: company3.id, customerId: 'cust-7', engineerId: 'eng-4', amount: 3500, paymentMethod: 'CASH' as const, reason: 'رسوم صيانة دورية — الإنجاز', status: 'INITIAL' as const, collectedBy: user4.id },
    { settlementNumber: 'STL-2024-026', companyId: company3.id, customerId: 'cust-12', amount: 32000, paymentMethod: 'INSTALLMENT' as const, reason: 'قسط أول — بيع جهاز Ricoh 2554', status: 'INITIAL' as const, collectedBy: user4.id },
    { settlementNumber: 'STL-2024-027', companyId: company3.id, customerId: 'cust-3', engineerId: 'eng-5', amount: 4000, paymentMethod: 'CASH' as const, reason: 'بيع قطع غيار — درام — Canon', status: 'VERIFIED' as const, collectedBy: user5.id, verifiedBy: user3.id },
    { settlementNumber: 'STL-2024-028', companyId: company3.id, customerId: 'cust-4', amount: 45000, paymentMethod: 'CASH' as const, reason: 'بيع جهاز Canon 2625 — الفجر', status: 'INITIAL' as const, collectedBy: user5.id },
    { settlementNumber: 'STL-2024-029', companyId: company3.id, customerId: 'cust-8', engineerId: 'eng-3', amount: 9500, paymentMethod: 'CASH' as const, reason: 'رسوم صيانة + قطع — الأعمال', status: 'INITIAL' as const, collectedBy: user5.id },
    { settlementNumber: 'STL-2024-030', companyId: company3.id, customerId: 'cust-1', engineerId: 'eng-1', amount: 110000, paymentMethod: 'MIXED' as const, reason: 'بيع جهاز Ricoh MP C4004 — مكتب النور', status: 'VERIFIED' as const, collectedBy: user4.id, verifiedBy: user3.id },
  ];

  for (const s of settlementsData) {
    await prisma.settlement.create({ data: s });
  }

  // -------------------------------------------
  // EXPENSES (8)
  // -------------------------------------------
  console.log('?? Creating expenses...');

  const expensesData = [
    { companyId: company1.id, categoryId: 'expcat-1', category: 'RENT', description: 'إيجار المكتب - يونيو 2024', amount: 15000, paidBy: user1.id, date: new Date('2024-06-01') },
    { companyId: company1.id, categoryId: 'expcat-2', category: 'UTILITIES', description: 'فواتير الكهرباء والمياه - يونيو', amount: 3500, paidBy: user3.id, date: new Date('2024-06-05') },
    { companyId: company1.id, categoryId: 'expcat-4', category: 'TRANSPORT', description: 'مصاريف النقل للعملاء', amount: 2800, paidBy: user4.id, date: new Date('2024-06-10') },
    { companyId: company1.id, categoryId: 'expcat-5', category: 'MAINTENANCE', description: 'صيانة الورشةworkshop', amount: 4500, paidBy: user5.id, date: new Date('2024-06-12') },
    { companyId: company1.id, categoryId: 'expcat-3', category: 'SALARY', description: 'رواتب الموظفين - يونيو', amount: 85000, paidBy: user1.id, date: new Date('2024-06-28') },
    { companyId: company2.id, categoryId: 'expcat-8', category: 'RENT', description: 'إيجار المكتب - يونيو 2024', amount: 8000, paidBy: user2.id, date: new Date('2024-06-01') },
    { companyId: company2.id, categoryId: 'expcat-9', category: 'UTILITIES', description: 'فواتير الكهرباء - يونيو', amount: 2000, paidBy: user2.id, date: new Date('2024-06-05') },
    { companyId: company1.id, categoryId: 'expcat-6', category: 'OFFICE', description: 'مشتريات مكتبية', amount: 1200, paidBy: user3.id, date: new Date('2024-06-15') },
  ];

  for (const e of expensesData) {
    await prisma.expense.create({ data: e });
  }

  // -------------------------------------------
  // WARRANTIES (10)
  // -------------------------------------------
  console.log('??? Creating warranties...');

  const warrantiesData = [
    { machineId: 'mach-01', startDate: new Date('2024-02-10'), endDate: new Date('2025-02-10'), copyLimit: 500000, copyLimitMonths: 12, engineerId: 'eng-1' },
    { machineId: 'mach-02', startDate: new Date('2024-03-05'), endDate: new Date('2025-03-05'), copyLimit: 600000, copyLimitMonths: 12, engineerId: 'eng-4' },
    { machineId: 'mach-03', startDate: new Date('2024-03-20'), endDate: new Date('2025-03-20'), copyLimit: 400000, copyLimitMonths: 12, engineerId: 'eng-5' },
    { machineId: 'mach-04', startDate: new Date('2024-04-10'), endDate: new Date('2025-04-10'), copyLimit: 500000, copyLimitMonths: 12, engineerId: 'eng-2' },
    { machineId: 'mach-05', startDate: new Date('2024-04-25'), endDate: new Date('2025-04-25'), copyLimit: 800000, copyLimitMonths: 12, engineerId: 'eng-3' },
    { machineId: 'mach-06', startDate: new Date('2024-05-05'), endDate: new Date('2024-11-05'), copyLimit: 300000, copyLimitMonths: 6, engineerId: 'eng-3' },
    { machineId: 'mach-07', startDate: new Date('2024-02-20'), endDate: new Date('2025-02-20'), copyLimit: 400000, copyLimitMonths: 12, engineerId: 'eng-1' },
    { machineId: 'mach-08', startDate: new Date('2024-05-15'), endDate: new Date('2024-08-15'), copyLimit: 200000, copyLimitMonths: 3, isExpired: true, engineerId: 'eng-5' },
    { machineId: 'mach-14', startDate: new Date('2024-05-01'), endDate: new Date('2025-05-01'), copyLimit: 500000, copyLimitMonths: 12 },
    { machineId: 'mach-19', startDate: new Date('2024-02-15'), endDate: new Date('2025-02-15'), copyLimit: 500000, copyLimitMonths: 12, engineerId: 'eng-1' },
  ];

  for (const w of warrantiesData) {
    await prisma.warranty.create({ data: w });
  }

  // -------------------------------------------
  // ENGINEER SALARIES (6)
  // -------------------------------------------
  console.log('?? Creating engineer salaries...');

  const salariesData = [
    { engineerId: 'eng-1', month: 6, year: 2024, baseSalary: 8000, transportAllowance: 2000, totalSales: 130000, totalCostOfGoods: 85000, commissionAmount: 11250, totalDeductions: 500, netPayable: 20750 },
    { engineerId: 'eng-2', month: 6, year: 2024, baseSalary: 9000, transportAllowance: 2500, totalSales: 45000, totalCostOfGoods: 28000, commissionAmount: 4250, totalDeductions: 300, netPayable: 15450 },
    { engineerId: 'eng-3', month: 6, year: 2024, baseSalary: 8500, transportAllowance: 2200, totalSales: 125000, totalCostOfGoods: 80000, commissionAmount: 11250, totalDeductions: 400, netPayable: 21550 },
    { engineerId: 'eng-4', month: 6, year: 2024, baseSalary: 7500, transportAllowance: 1800, totalSales: 30000, totalCostOfGoods: 18000, commissionAmount: 3000, totalDeductions: 250, netPayable: 12050 },
    { engineerId: 'eng-5', month: 6, year: 2024, baseSalary: 8000, transportAllowance: 2000, totalSales: 85000, totalCostOfGoods: 52000, commissionAmount: 8250, totalDeductions: 350, netPayable: 17900 },
    { engineerId: 'eng-6', month: 6, year: 2024, baseSalary: 7000, transportAllowance: 1500, totalSales: 20000, totalCostOfGoods: 12000, commissionAmount: 2000, totalDeductions: 200, netPayable: 10300 },
  ];

  for (const s of salariesData) {
    await prisma.engineerSalary.create({ data: s });
  }

  // -------------------------------------------
  // ACCOUNTS (10)
  // -------------------------------------------
  console.log('?? Creating accounts...');

  const accountsData = [
    { id: 'acc-1', code: '1001', name: 'الصندوق', accountType: 'ASSET' as const, companyId: company1.id, balance: 250000 },
    { id: 'acc-2', code: '1002', name: 'البنك', accountType: 'ASSET' as const, companyId: company1.id, balance: 1500000 },
    { id: 'acc-3', code: '1100', name: 'المدينون', accountType: 'ASSET' as const, companyId: company1.id, balance: 380000 },
    { id: 'acc-4', code: '1200', name: 'المخزون', accountType: 'ASSET' as const, companyId: company1.id, balance: 2200000 },
    { id: 'acc-5', code: '2001', name: 'الدائنون', accountType: 'LIABILITY' as const, companyId: company1.id, balance: 850000 },
    { id: 'acc-6', code: '3001', name: 'رأس المال', accountType: 'EQUITY' as const, companyId: company1.id, balance: 3000000 },
    { id: 'acc-7', code: '4001', name: 'إيرادات المبيعات', accountType: 'REVENUE' as const, companyId: company1.id, balance: 1850000 },
    { id: 'acc-8', code: '4002', name: 'إيرادات الصيانة', accountType: 'REVENUE' as const, companyId: company1.id, balance: 240000 },
    { id: 'acc-9', code: '5001', name: 'تكلفة البضاعة المباعة', accountType: 'EXPENSE' as const, companyId: company1.id, balance: 1200000 },
    { id: 'acc-10', code: '5002', name: 'مصاريف إدارية', accountType: 'EXPENSE' as const, companyId: company1.id, balance: 120000 },
  ];

  for (const a of accountsData) {
    await prisma.account.create({ data: a });
  }

  // حسابات خاصة بشركة جملة قطع غيار (company2) وشركة القطاعي (company3)
  // حتى يمكن تسجيل البيع الداخلي والقيود المحاسبية لكل شركة على حدة
  const companyAccounts = [
    { id: 'acc2-1', code: '1001', name: 'الصندوق', accountType: 'ASSET' as const, companyId: company2.id, balance: 300000 },
    { id: 'acc2-2', code: '1100', name: 'المدينون', accountType: 'ASSET' as const, companyId: company2.id, balance: 450000 },
    { id: 'acc2-3', code: '1200', name: 'المخزون', accountType: 'ASSET' as const, companyId: company2.id, balance: 1800000 },
    { id: 'acc2-4', code: '2001', name: 'الدائنون', accountType: 'LIABILITY' as const, companyId: company2.id, balance: 600000 },
    { id: 'acc2-5', code: '3001', name: 'رأس المال', accountType: 'EQUITY' as const, companyId: company2.id, balance: 2000000 },
    { id: 'acc2-6', code: '4001', name: 'إيرادات المبيعات', accountType: 'REVENUE' as const, companyId: company2.id, balance: 1500000 },
    { id: 'acc2-7', code: '5001', name: 'تكلفة البضاعة المباعة', accountType: 'EXPENSE' as const, companyId: company2.id, balance: 950000 },

    { id: 'acc3-1', code: '1001', name: 'الصندوق', accountType: 'ASSET' as const, companyId: company3.id, balance: 200000 },
    { id: 'acc3-2', code: '1100', name: 'المدينون', accountType: 'ASSET' as const, companyId: company3.id, balance: 350000 },
    { id: 'acc3-3', code: '1200', name: 'المخزون', accountType: 'ASSET' as const, companyId: company3.id, balance: 900000 },
    { id: 'acc3-4', code: '2001', name: 'الدائنون', accountType: 'LIABILITY' as const, companyId: company3.id, balance: 400000 },
    { id: 'acc3-5', code: '3001', name: 'رأس المال', accountType: 'EQUITY' as const, companyId: company3.id, balance: 1500000 },
    { id: 'acc3-6', code: '4001', name: 'إيرادات المبيعات', accountType: 'REVENUE' as const, companyId: company3.id, balance: 1100000 },
    { id: 'acc3-7', code: '5001', name: 'تكلفة البضاعة المباعة', accountType: 'EXPENSE' as const, companyId: company3.id, balance: 700000 },
  ];

  for (const a of companyAccounts) {
    await prisma.account.create({ data: a });
  }

  // -------------------------------------------
  // JOURNAL ENTRIES (5)
  // -------------------------------------------
  console.log('?? Creating journal entries...');

  const je1 = await prisma.journalEntry.create({
    data: {
      id: 'je-1', companyId: company1.id, entryNumber: 'JE-2024-001', date: new Date('2024-02-10'), description: 'Sale of machine SN-2024-001 to maktb al-nour', referenceType: 'SalesOrder', referenceId: 'so-1', isVerified: true,
      items: {
        create: [
          { accountId: 'acc-1', debit: 130000, credit: 0 },
          { accountId: 'acc-7', debit: 0, credit: 130000 },
        ],
      },
    },
  });

  const je2 = await prisma.journalEntry.create({
    data: {
      id: 'je-2', companyId: company1.id, entryNumber: 'JE-2024-002', date: new Date('2024-02-10'), description: 'Cost of goods sold - machine SN-2024-001', referenceType: 'SalesOrder', referenceId: 'so-1', isVerified: true,
      items: {
        create: [
          { accountId: 'acc-9', debit: 85000, credit: 0 },
          { accountId: 'acc-4', debit: 0, credit: 85000 },
        ],
      },
    },
  });

  const je3 = await prisma.journalEntry.create({
    data: {
      id: 'je-3', companyId: company1.id, entryNumber: 'JE-2024-003', date: new Date('2024-06-01'), description: 'Rent expense - June 2024', isVerified: false,
      items: {
        create: [
          { accountId: 'acc-10', debit: 15000, credit: 0 },
          { accountId: 'acc-1', debit: 0, credit: 15000 },
        ],
      },
    },
  });

  const je4 = await prisma.journalEntry.create({
    data: {
      id: 'je-4', companyId: company1.id, entryNumber: 'JE-2024-004', date: new Date('2024-06-05'), description: 'Utilities expense - June 2024', isVerified: false,
      items: {
        create: [
          { accountId: 'acc-10', debit: 3500, credit: 0 },
          { accountId: 'acc-1', debit: 0, credit: 3500 },
        ],
      },
    },
  });

  const je5 = await prisma.journalEntry.create({
    data: {
      id: 'je-5', companyId: company1.id, entryNumber: 'JE-2024-005', date: new Date('2024-06-28'), description: 'Salary expense - June 2024', isVerified: true,
      items: {
        create: [
          { accountId: 'acc-10', debit: 85000, credit: 0 },
          { accountId: 'acc-2', debit: 0, credit: 85000 },
        ],
      },
    },
  });

  console.log('? Seed completed successfully!');
  console.log('?? Summary:');
  console.log('  - 3 companies');
  console.log('  - 9 users');
  console.log('  - 15 customers with 25 locations');
  console.log('  - 5 suppliers');
  console.log('  - 6 engineers with areas and skills');
  console.log('  - 3 investors');
  console.log('  - 30 products (15 machines + 15 spare parts)');
  console.log('  - 25 machines');
  console.log('  - 52 meter readings');
  console.log('  - 30+ warehouse inventory entries');
  console.log('  - 30 stock movements');
  console.log('  - 10 custody entries');
  console.log('  - 5 purchase orders');
  console.log('  - 8 sales orders');
  console.log('  - 6 contracts');
  console.log('  - 15 service requests');
  console.log('  - 20 visits');
  console.log('  - 30 settlements (10 per company)');
  console.log('  - 8 expenses');
  console.log('  - 14 expense categories');
  console.log('  - 9 sales categories');
  console.log('  - 10 warranties');
  console.log('  - 6 engineer salaries');
  console.log('  - 24 accounts');
  console.log('  - 5 journal entries');
}

main()
  .catch((e) => {
    console.error('? Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
