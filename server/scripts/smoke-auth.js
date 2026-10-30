// End-to-end auth smoke test against http://localhost:4000
const BASE = process.env.DRIVERIGHT_API_BASE || "http://localhost:4000/api";
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);

async function call(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

(async () => {
  // 1. login all three seeded roles
  const roles = {
    learner: ["tunde@example.com", "password123"],
    instructor: ["chike@driveright.ng", "password123"],
    admin: ["admin@driveright.ng", "password123"],
  };
  const tokens = {};
  for (const [role, [email, pw]] of Object.entries(roles)) {
    const r = await call("/auth/login", { method: "POST", body: { email, password: pw } });
    check(`login ${role}`, r.status === 200 && r.json?.user?.role === role);
    tokens[role] = r.json?.token;
  }

  // 2. wrong password rejected, unknown email rejected
  check("wrong password -> 401", (await call("/auth/login", { method: "POST", body: { email: roles.learner[0], password: "nope-nope" } })).status === 401);
  check("unknown email -> 401", (await call("/auth/login", { method: "POST", body: { email: "ghost@x.com", password: "whatever123" } })).status === 401);

  // 3. each role reaches its own dashboard
  const lD = await call("/learner/dashboard", { token: tokens.learner });
  const owed = (lD.json?.balanceOwedKobo || 0) / 100;
  check("learner dashboard by learner", lD.status === 200 && Array.isArray(lD.json?.purchases) && lD.json.purchases.length >= 1, `balance owed ₦${owed.toLocaleString()}`);
  check("instructor dashboard by instructor", (await call("/instructor/dashboard", { token: tokens.instructor })).status === 200);
  check("admin dashboard by admin", (await call("/admin/dashboard", { token: tokens.admin })).status === 200);

  // 4. cross-role pages blocked (rule: no opening other roles' pages)
  check("learner blocked from instructor dash", (await call("/instructor/dashboard", { token: tokens.learner })).status === 403);
  check("learner blocked from admin dash", (await call("/admin/dashboard", { token: tokens.learner })).status === 403);
  check("instructor blocked from admin dash", (await call("/admin/dashboard", { token: tokens.instructor })).status === 403);

  // 5. no token / bad token
  check("no token -> 401", (await call("/learner/dashboard")).status === 401);
  check("garbage token -> 401", (await call("/learner/dashboard", { token: "junk" })).status === 401);

  // 6. registration works + duplicate rejected
  const reg = await call("/auth/register", { method: "POST", body: { name: "Ada Test", email: `ada${Date.now()}@example.com`, password: "adapas123", role: "learner" } });
  check("register learner", reg.status === 201 && reg.json?.user?.role === "learner");
  check("duplicate email -> 409", (await call("/auth/register", {
    method: "POST",
    body: { name: "Ada Duplicate", email: reg.json?.user?.email, password: "adapas123", role: "learner" },
  })).status === 409);
  check("invalid role rejected", (await call("/auth/register", { method: "POST", body: { name: "Evil", email: "evil@x.com", password: "12345678", role: "superadmin" } })).status === 400);
  check("short password rejected", (await call("/auth/register", { method: "POST", body: { name: "S", email: "s@x.com", password: "123", role: "learner" } })).status === 400);
  const ada = await call("/learner/dashboard", { token: reg.json?.token });
  check("fresh learner dashboard loads (empty)", ada.status === 200 && ada.json?.purchases?.length === 0);

  console.log(results.join("\n"));
  console.log(results.some((r) => r.startsWith("FAIL")) ? "\n>>> SOME CHECKS FAILED" : "\n>>> ALL CHECKS PASSED");
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
