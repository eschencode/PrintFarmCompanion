/**
 * Automated tenant-isolation ("leak") test. Run with `bun run scripts/leak-test.ts`
 * against a running dev server that's been seeded with `bun run db:seed:test`.
 *
 * It logs in as each seed user over real HTTP (so the whole hooks → requireCtx →
 * workspace-scoped-query path is exercised, not mocked) and asserts that one
 * tenant can never read or mutate another tenant's data:
 *
 *   1. READ isolation   — GET /api/objects returns ONLY the caller's objects.
 *   2. MUTATION IDOR     — PATCH /api/printer/:id with a victim's printer id is a
 *                          no-op (the victim's row is untouched in the DB).
 *   3. POSITIVE control  — the caller CAN read their own objects + patch their own
 *                          printer, proving the test isn't passing by breaking auth.
 *
 * Exits non-zero on the first leak so it can gate CI / a pre-deploy check.
 *
 * Env:
 *   BASE_URL   dev server origin (default http://localhost:5173)
 */
import { Database } from "bun:sqlite";
import { readdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const PASSWORD = "password123";

// ── locate the same local D1 sqlite the seed wrote ───────────────────────────
const d1Dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
let file: string;
try {
  file = readdirSync(d1Dir).find((f) => f.endsWith(".sqlite"))!;
} catch {
  console.error(`No local D1 in ${d1Dir}. Run \`bun run db:migrate:local && bun run db:seed:test\` first.`);
  process.exit(1);
}
const db = new Database(`${d1Dir}/${file}`);

type WS = {
  email: string;
  ws: number;
  objectIds: number[];
  printerIds: number[];
  moduleIds: number[];
  taskIds: string[]; // print_jobs.external_task_id — per-tenant UUIDs
};

const workspaces: WS[] = db
  .query<{ email: string; ws: number }, []>(
    `SELECT u.email AS email, w.id AS ws
       FROM workspaces w JOIN user u ON u.id = w.owner_user_id
      WHERE u.email LIKE '%@test.dev' ORDER BY w.id`,
  )
  .all()
  .map((r) => ({
    email: r.email,
    ws: r.ws,
    objectIds: db.query<{ id: number }, [number]>(`SELECT id FROM objects WHERE workspace_id = ?`).all(r.ws).map((x) => x.id),
    printerIds: db.query<{ id: number }, [number]>(`SELECT id FROM printers WHERE workspace_id = ?`).all(r.ws).map((x) => x.id),
    moduleIds: db.query<{ id: number }, [number]>(`SELECT id FROM print_modules WHERE workspace_id = ?`).all(r.ws).map((x) => x.id),
    taskIds: db
      .query<{ t: string }, [number]>(`SELECT external_task_id t FROM print_jobs WHERE workspace_id = ? AND external_task_id IS NOT NULL`)
      .all(r.ws)
      .map((x) => x.t),
  }));

if (workspaces.length < 2) {
  console.error(`Need ≥2 seeded @test.dev workspaces; found ${workspaces.length}. Run \`bun run db:seed:test\`.`);
  process.exit(1);
}

const printerActive = (id: number) =>
  Number(db.query<{ active: number }, [number]>(`SELECT active FROM printers WHERE id = ?`).get(id)?.active ?? -1);

// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function assertServerUp() {
  try {
    await fetch(BASE, { redirect: "manual" });
  } catch {
    console.error(`Dev server not reachable at ${BASE}. Start it with \`bun run dev\` (or set BASE_URL).`);
    process.exit(1);
  }
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD }),
    redirect: "manual",
  });
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  if (!res.ok || cookies.length === 0) {
    throw new Error(`Sign-in failed for ${email} (status ${res.status}). Is the DB seeded?`);
  }
  return cookies.join("; ");
}

const authFetch = (cookie: string, path: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), cookie, origin: BASE },
    redirect: "manual",
  });

// ── test runner ──────────────────────────────────────────────────────────────
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

console.log(`Tenant-isolation leak test → ${BASE}\n`);
await assertServerUp();

const cookies = new Map<string, string>();
for (const w of workspaces) cookies.set(w.email, await signIn(w.email));

for (const attacker of workspaces) {
  const cookie = cookies.get(attacker.email)!;
  console.log(`\nAs ${attacker.email} (workspace #${attacker.ws}):`);

  // 1. READ isolation — GET /api/objects returns only the caller's objects.
  const res = await authFetch(cookie, "/api/objects");
  const body = (await res.json()) as { data?: { id: number }[] };
  const seen = new Set((body.data ?? []).map((o) => Number(o.id)));
  const own = new Set(attacker.objectIds);
  const foreign = workspaces.filter((w) => w !== attacker).flatMap((w) => w.objectIds).filter((id) => seen.has(id));
  check("GET /api/objects returns own objects", seen.size > 0 && [...own].every((id) => seen.has(id)));
  check("GET /api/objects leaks NO foreign objects", foreign.length === 0, foreign.length ? `saw ${foreign.join(",")}` : "");

  // 1b. READ isolation — GET /api/print-modules returns only the caller's modules.
  const modRes = await authFetch(cookie, "/api/print-modules");
  const modBody = (await modRes.json()) as { data?: { id: number }[] };
  const modSeen = new Set((modBody.data ?? []).map((m) => Number(m.id)));
  const modForeign = workspaces.filter((w) => w !== attacker).flatMap((w) => w.moduleIds).filter((id) => modSeen.has(id));
  check("GET /api/print-modules returns own modules", [...new Set(attacker.moduleIds)].every((id) => modSeen.has(id)));
  check("GET /api/print-modules leaks NO foreign modules", modForeign.length === 0, modForeign.length ? `saw ${modForeign.join(",")}` : "");

  // 1c. PRINT-JOB isolation — the dashboard (`/`) serializes the caller's jobs
  // into its hydration data. A foreign job's external_task_id (a per-tenant UUID)
  // must never appear; the caller's own must (proving jobs actually render, so the
  // negative check isn't vacuous).
  const dash = await authFetch(cookie, "/");
  const html = await dash.text();
  const ownTaskSeen = attacker.taskIds.filter((t) => html.includes(t)).length;
  const foreignTaskSeen = workspaces.filter((w) => w !== attacker).flatMap((w) => w.taskIds).filter((t) => html.includes(t));
  check("dashboard renders own print jobs", ownTaskSeen > 0, `${ownTaskSeen}/${attacker.taskIds.length} task ids present`);
  check("dashboard leaks NO foreign print jobs", foreignTaskSeen.length === 0, foreignTaskSeen.length ? `saw ${foreignTaskSeen.length} foreign task id(s)` : "");

  // 2. MUTATION IDOR — patching a victim's printer must not touch it.
  for (const victim of workspaces) {
    if (victim === attacker) continue;
    const victimPrinter = victim.printerIds[0];
    const before = printerActive(victimPrinter);
    await authFetch(cookie, `/api/printer/${victimPrinter}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "broken" }), // tries to deactivate it
    });
    const after = printerActive(victimPrinter);
    check(`PATCH ${victim.email}'s printer #${victimPrinter} is a no-op`, before === after, before !== after ? `active ${before}→${after}` : "");
  }

  // 3. POSITIVE control — the caller CAN patch their OWN printer.
  const ownPrinter = attacker.printerIds[0];
  const ownRes = await authFetch(cookie, `/api/printer/${ownPrinter}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transport: "pi" }),
  });
  check(`PATCH own printer #${ownPrinter} succeeds`, ownRes.ok);
}

db.close();
console.log(`\n${failures === 0 ? "✅ PASS — no cross-tenant leaks." : `❌ FAIL — ${failures} leak(s) detected.`}`);
process.exit(failures === 0 ? 0 : 1);
