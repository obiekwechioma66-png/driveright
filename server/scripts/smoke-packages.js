// Packages CRUD + learner choose flow — API smoke test (idempotent via unique suffix).
const BASE = process.env.DRIVERIGHT_API_BASE || "http://localhost:4000/api";
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);

async function call(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

(async () => {
  // sign in
  const login = async (email) => (await call("/auth/login", { method: "POST", body: { email, password: "password123" } })).json;
  const admin = await login("admin@driveright.ng");
  const learner = await login("tunde@example.com");
  const instructor = await login("chike@driveright.ng");

  // public list
  const pub = await call("/packages");
  check("public packages list (no auth)", pub.status === 200 && Array.isArray(pub.json?.packages));
  const before = pub.json.packages.length;

  // create
  const suffix = Date.now();
  const created = await call("/packages", {
    method: "POST", token: admin.token,
    body: { name: "Evening Saver " + suffix, description: "Weeknight lessons", priceKobo: 12_000_000, lessonCount: 8 },
  });
  check("admin creates package", created.status === 201 && created.json?.package?.active === true);
  const id = created.json?.package?.id;

  // role guards
  check("learner cannot create", (await call("/packages", { method: "POST", token: learner.token, body: { name: "X", priceKobo: 100, lessonCount: 1 } })).status === 403);
  check("instructor cannot edit", (await call(`/packages/${id}`, { method: "PATCH", token: instructor.token, body: { active: false } })).status === 403);
  check("guest cannot create", (await call("/packages", { method: "POST", body: { name: "X", priceKobo: 100, lessonCount: 1 } })).status === 401);

  // validation
  check("bad price rejected", (await call("/packages", { method: "POST", token: admin.token, body: { name: "Bad", priceKobo: -5, lessonCount: 1 } })).status === 400);

  // edit
  const edited = await call(`/packages/${id}`, { method: "PATCH", token: admin.token, body: { priceKobo: 13_500_000, lessonCount: 9 } });
  check("admin edits price+lessons", edited.status === 200 && edited.json?.package?.priceKobo === 13_500_000 && edited.json?.package?.lessonCount === 9);

  // public list grows and shows new package; admin list too
  const pub2 = await call("/packages");
  check("new package visible publicly", pub2.status === 200 && pub2.json.packages.length === before + 1 && pub2.json.packages.some((p) => p.id === id));

  // learner chooses it
  const buy = await call("/purchases", { method: "POST", token: learner.token, body: { packageId: id } });
  check("learner chooses package -> pending purchase", buy.status === 201 && buy.json?.purchase?.status === "pending" && buy.json?.purchase?.lessonsTotal === 9);

  // learner dashboard reflects the new purchase + balance
  const lD = await call("/learner/dashboard", { token: learner.token });
  const newP = lD.json.purchases.find((p) => p.id === buy.json.purchase.id);
  check("purchase shows on learner dashboard with full balance owed", lD.status === 200 && newP && newP.balanceOwedKobo === 13_500_000 && newP.creditsLeft === 9);

  // instructor/admin cannot choose
  check("instructor cannot choose", (await call("/purchases", { method: "POST", token: instructor.token, body: { packageId: id } })).status === 403);

  // delete with sales -> soft deactivated
  const del = await call(`/packages/${id}`, { method: "DELETE", token: admin.token });
  check("delete with buyers deactivates instead", del.status === 200 && del.json?.deactivated === true);
  const pub3 = await call("/packages");
  check("deactivated package hidden from public", !pub3.json.packages.some((p) => p.id === id));

  // delete a package with no sales -> hard delete
  const temp = await call("/packages", { method: "POST", token: admin.token, body: { name: "Temp " + suffix, priceKobo: 1_000_000, lessonCount: 2 } });
  const del2 = await call(`/packages/${temp.json.package.id}`, { method: "DELETE", token: admin.token });
  check("unused package hard-deletes", del2.status === 200 && del2.json?.deleted === true);

  // admin deactivated purchase-side effects: still in /all
  const all = await call("/packages/all", { token: admin.token });
  check("admin /all includes hidden package", all.status === 200 && all.json.packages.some((p) => p.id === id));

  console.log(results.join("\n"));
  console.log(results.some((r) => r.startsWith("FAIL")) ? "\n>>> SOME CHECKS FAILED" : "\n>>> ALL CHECKS PASSED");
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
