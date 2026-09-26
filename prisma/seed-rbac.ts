// ═══════════════════════════════════════════════════════════════════════════
// RBAC SEEDER — creates the Role rows and their starting permissions.
//
//   npm run db:seed:rbac          create what is missing (safe to re-run)
//   npm run db:seed:rbac -- --reset  overwrite permissions back to defaults
//
// Idempotent by design. It never touches a RolePage / RoleActionPermission row
// that already exists, so re-running after the general manager has customised
// the matrix does not undo their work. `--reset` is the explicit escape hatch.
//
// Page-level access is taken verbatim from ROLE_PERMISSIONS in
// src/lib/permissions.ts — the table the running system already enforces. So
// seeding does not change who can see what; it only adds the action layer on
// top and makes both editable from the dashboard.
// ═══════════════════════════════════════════════════════════════════════════

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ACTION_KEYS, type ActionKey } from "../src/lib/rbac-catalog";
import { ROLE_LABELS_AR, ROLE_PERMISSIONS, ROLES, type Role } from "../src/lib/permissions";

const RESET = process.argv.includes("--reset");

/** Roles whose permissions the general manager must never be able to reduce. */
const SYSTEM_ROLES: Role[] = ["GENERAL_MANAGER"];

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  GENERAL_MANAGER: "صلاحية كاملة على كل الصفحات والإجراءات. محمي ولا يمكن تعديله.",
  COMPANY_MANAGER: "إدارة شاملة للشركة، بدون إعدادات النظام الحساسة.",
  ACCOUNTANT: "المحاسبة والفواتير والتقارير المالية.",
  MAINTENANCE_MANAGER: "إدارة الصيانة وطلبات الخدمة والمهندسين.",
  WORKSHOP_MANAGER: "إدارة الورشة والمخزون والفنيين.",
  ENGINEER: "متابعة مهامه وعملائه فقط.",
  SALES_EMPLOYEE: "المبيعات والعملاء والعقود.",
  HR_MANAGER: "إدارة الموارد البشرية.",
  EMPLOYEE: "الخدمة الذاتية فقط.",
};

/**
 * Which actions each role may hold, per page. `page` narrows this further for
 * roles that are strong in one area and read-only elsewhere.
 */
interface ActionProfile {
  /** Actions allowed on any page this role can see. */
  anywhere: ActionKey[];
  /** Pages where the role gets every action the page offers. */
  fullOn?: Pageish[];
  /** Pages where the role is limited to `readOnly` (defaults to `anywhere`). */
  readOnly?: Pageish[];
  /** Actions never granted, whatever the page. */
  never?: ActionKey[];
}

type Pageish = (typeof ROLE_PERMISSIONS)[Role][number];

const ACTION_PROFILES: Record<Role, ActionProfile> = {
  // Full access is handled separately and is not reducible.
  GENERAL_MANAGER: { anywhere: [...ACTION_KEYS] },

  // "شبه كامل" — everything except the sensitive system settings page and the
  // destructive book reset.
  COMPANY_MANAGER: {
    anywhere: ["view", "add", "edit", "delete", "import", "export", "print", "approve", "assign", "share", "close", "scrap"],
    readOnly: ["settings"],
    never: ["reset"],
  },

  // Accounting: full financial paperwork, but no deletions.
  ACCOUNTANT: {
    anywhere: ["view", "add", "edit", "export", "print", "approve", "import"],
    never: ["delete", "scrap", "reset", "assign"],
  },

  // Maintenance: everything on the maintenance pages, read-only elsewhere.
  MAINTENANCE_MANAGER: {
    anywhere: ["view", "export", "print"],
    fullOn: ["serviceRequests", "engineers", "copierTests", "workshop", "workshopDaily", "machines", "contracts"],
  },

  // Workshop: full on the workshop floor, never on money.
  WORKSHOP_MANAGER: {
    anywhere: ["view", "export", "print"],
    fullOn: ["workshop", "workshopDaily", "engineers", "machines", "inventory", "warehouses", "products", "copierTests"],
    never: ["reset", "approve"],
  },

  // Engineer: read his work, update task state, never delete.
  ENGINEER: {
    anywhere: ["view", "add", "edit", "export", "print"],
    never: ["delete", "scrap", "reset", "approve", "assign", "import", "close"],
  },

  // Sales: view and add customers/orders, nothing destructive.
  SALES_EMPLOYEE: {
    anywhere: ["view", "add", "export", "print"],
    never: ["delete", "edit", "approve", "assign", "import", "close", "scrap", "reset", "share"],
  },

  HR_MANAGER: {
    anywhere: ["view", "add", "edit", "delete", "export", "print", "approve", "import", "assign"],
    never: ["reset", "scrap", "close"],
  },

  EMPLOYEE: {
    anywhere: ["view"],
    never: ["add", "edit", "delete", "approve", "assign", "import", "export", "share", "close", "scrap", "reset", "print"],
  },
};

function actionsForRolePage(role: Role, page: Pageish, pageActions: ActionKey[]): ActionKey[] {
  const profile = ACTION_PROFILES[role];

  let allowed: ActionKey[];
  if (profile.fullOn?.includes(page)) {
    allowed = [...ACTION_KEYS];
  } else if (profile.readOnly?.includes(page)) {
    allowed = ["view"];
  } else {
    allowed = profile.anywhere;
  }

  const never = new Set<ActionKey>(profile.never ?? []);
  // A granted action is only real if the page actually offers it.
  return pageActions.filter((a) => allowed.includes(a) && !never.has(a));
}

interface PageRow {
  id: string;
  key: string;
  actions: { id: string; key: string }[];
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

  try {
    // One read of the catalogue, then everything else is computed in memory.
    // A per-row loop here would mean ~2000 round trips to a remote Neon DB.
    const pages: PageRow[] = await prisma.page.findMany({
      where: { isActive: true },
      include: { actions: { where: { isActive: true }, select: { id: true, key: true } } },
      orderBy: { sortOrder: "asc" },
    });

    if (pages.length === 0) {
      console.error("No pages in the database. Run `npm run rbac:sync` first.");
      process.exit(1);
    }

    // Roles: upsert all nine in one transaction.
    const roles = await prisma.$transaction(
      ROLES.map((role, index) =>
        prisma.role.upsert({
          where: { key: role },
          create: {
            key: role,
            name: ROLE_LABELS_AR[role],
            description: ROLE_DESCRIPTIONS[role],
            isSystem: SYSTEM_ROLES.includes(role),
            sortOrder: index * 10,
          },
          // Never rename or re-scope a built-in role: the label is code-owned
          // and permissions stay editable from the matrix.
          update: { isSystem: SYSTEM_ROLES.includes(role), sortOrder: index * 10 },
        })
      )
    );
    const roleByKey = new Map(roles.map((r) => [r.key, r]));

    // Existing grants for every seeded role, in two queries.
    const roleIds = roles.map((r) => r.id);
    const [existingPages, existingActions] = await Promise.all([
      prisma.rolePage.findMany({
        where: { roleId: { in: roleIds } },
        select: { id: true, roleId: true, pageId: true, canView: true },
      }),
      prisma.roleActionPermission.findMany({
        where: { roleId: { in: roleIds } },
        select: { id: true, roleId: true, actionId: true, isAllowed: true },
      }),
    ]);

    const pageIndex = new Map(pages.map((p) => [p.id, p]));
    const existingPageKey = new Map(existingPages.map((r) => [`${r.roleId}:${r.pageId}`, r]));
    const existingActionKey = new Map(existingActions.map((r) => [`${r.roleId}:${r.actionId}`, r]));

    const newPages: { roleId: string; pageId: string; canView: boolean }[] = [];
    const newActions: { roleId: string; actionId: string; isAllowed: boolean }[] = [];
    const pageFixes: { id: string; canView: boolean }[] = [];
    const actionFixes: { id: string; isAllowed: boolean }[] = [];

    for (const role of ROLES) {
      const roleRow = roleByKey.get(role)!;
      const allowedPages = new Set<string>(ROLE_PERMISSIONS[role]);

      for (const page of pages) {
        const canView = allowedPages.has(page.key);
        const existing = existingPageKey.get(`${roleRow.id}:${page.id}`);

        if (!existing) {
          newPages.push({ roleId: roleRow.id, pageId: page.id, canView });
        } else if (RESET && existing.canView !== canView) {
          pageFixes.push({ id: existing.id, canView });
        }

        // An action on a page the role cannot open is meaningless, so it is
        // never granted in the first place.
        if (!canView) continue;

        const wanted = new Set<ActionKey>(
          actionsForRolePage(role, page.key as Pageish, page.actions.map((a) => a.key as ActionKey))
        );

        for (const action of page.actions) {
          const isAllowed = wanted.has(action.key as ActionKey);
          const current = existingActionKey.get(`${roleRow.id}:${action.id}`);
          if (!current) newActions.push({ roleId: roleRow.id, actionId: action.id, isAllowed });
          else if (RESET && current.isAllowed !== isAllowed) actionFixes.push({ id: current.id, isAllowed });
        }
      }
    }

    if (newPages.length > 0) await prisma.rolePage.createMany({ data: newPages });
    if (newActions.length > 0) await prisma.roleActionPermission.createMany({ data: newActions });
    for (const fix of pageFixes) {
      await prisma.rolePage.update({ where: { id: fix.id }, data: { canView: fix.canView } });
    }
    for (const fix of actionFixes) {
      await prisma.roleActionPermission.update({ where: { id: fix.id }, data: { isAllowed: fix.isAllowed } });
    }

    for (const role of ROLES) {
      const roleRow = roleByKey.get(role)!;
      const [p, a] = await Promise.all([
        prisma.rolePage.count({ where: { roleId: roleRow.id, canView: true } }),
        prisma.roleActionPermission.count({ where: { roleId: roleRow.id, isAllowed: true } }),
      ]);
      console.log(
        `  ${ROLE_LABELS_AR[role].padEnd(24)} ${String(p).padStart(2)} pages  ${String(a).padStart(3)} actions`
      );
    }

    // Link every existing user to their Role row, keyed off the enum value.
    let linked = 0;
    for (const role of ROLES) {
      const result = await prisma.user.updateMany({
        where: { role, roleId: null },
        data: { roleId: roleByKey.get(role)?.id ?? null },
      });
      linked += result.count;
    }

    console.log(
      `\nSeeded ${ROLES.length} roles — ${newPages.length} page grants and ` +
        `${newActions.filter((a) => a.isAllowed).length} action grants created` +
        (pageFixes.length || actionFixes.length ? `, ${pageFixes.length + actionFixes.length} reset.` : ".")
    );
    if (linked) console.log(`Linked ${linked} existing users to their role.`);
    if (RESET) console.log("(--reset: existing permission rows were overwritten with the defaults.)");
    else console.log("Existing permissions were left untouched. Use --reset to overwrite them.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


