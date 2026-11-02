// Admin invitation, assignment, and public review smoke checks.
// Uses a local seeded administrator and cleans up its own fixtures.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const BASE = process.env.DRIVERIGHT_API_BASE || "http://localhost:4000/api";
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);

async function call(path, { method = "GET", token, body } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

(async () => {
  const stem = Date.now();
  const instructorEmail = `invite-${stem}@example.com`;
  const learnerEmail = `assigned-${stem}@example.com`;
  const reviewQuote = `Test review ${stem} confirms the progress experience.`;
  let inviteId = null;
  let instructorId = null;
  let learnerId = null;
  let reviewId = null;
  try {
    const [admin, learner] = await Promise.all([
      call("/auth/login", { method: "POST", body: { email: "admin@driveright.ng", password: "password123" } }),
      call("/auth/login", { method: "POST", body: { email: "tunde@example.com", password: "password123" } }),
    ]);
    check("seed admin can sign in", admin.status === 200 && !!admin.json?.token);
    check("seed learner can sign in", learner.status === 200 && !!learner.json?.token);
    if (!admin.json?.token || !learner.json?.token) throw new Error("Seed accounts are unavailable");

    const adminSettings = await call("/admin/school-settings", { token: admin.json.token });
    const publicSettings = await call("/school-settings");
    check("owner profile fields are available to admin settings and public site",
      adminSettings.status === 200 && Object.hasOwn(adminSettings.json?.settings || {}, "ownerName") &&
      publicSettings.status === 200 && Object.hasOwn(publicSettings.json?.settings || {}, "ownerBio"));

    check("learner cannot create staff invitations", (await call("/admin/instructor-invites", { method: "POST", token: learner.json.token, body: { email: instructorEmail } })).status === 403);
    const invite = await call("/admin/instructor-invites", { method: "POST", token: admin.json.token, body: { email: instructorEmail } });
    check("admin creates invitation link", invite.status === 201 && !!invite.json?.inviteUrl && invite.json?.emailSent === false);
    inviteId = invite.json?.invite?.id;
    const token = invite.json?.inviteUrl ? new URL(invite.json.inviteUrl).searchParams.get("token") : "";
    check("invite token resolves to invited email", (await call(`/staff/invitations/${encodeURIComponent(token)}`)).json?.email === instructorEmail);

    const accepted = await call("/staff/invitations/accept", { method: "POST", body: { token, email: instructorEmail, name: "Test Instructor", password: "password123", phone: "08012345678" } });
    check("invite creates an instructor account", accepted.status === 201 && accepted.json?.user?.role === "instructor");
    const usedAgain = await call("/staff/invitations/accept", { method: "POST", body: { token, email: instructorEmail, name: "Test Instructor", password: "password123" } });
    check("invitation is single-use", usedAgain.status === 410);

    const learnerSignup = await call("/auth/register", { method: "POST", body: { name: "Assigned Learner", email: learnerEmail, password: "password123", phone: "08012345678" } });
    check("learner fixture can sign up", learnerSignup.status === 201);
    const instructor = await prisma.user.findUnique({ where: { email: instructorEmail }, include: { instructorProfile: true } });
    const learnerRow = await prisma.learner.findFirst({ where: { user: { email: learnerEmail } } });
    instructorId = instructor?.instructorProfile?.id;
    learnerId = learnerRow?.id;
    const assignment = await call(`/admin/learners/${encodeURIComponent(learnerId)}/instructor`, { method: "PATCH", token: admin.json.token, body: { instructorId } });
    check("admin assigns learner to instructor", assignment.status === 200 && assignment.json?.instructorId === instructorId);
    const instructorLogin = await call("/auth/login", { method: "POST", body: { email: instructorEmail, password: "password123" } });
    const instructorDashboard = await call("/instructor/dashboard", { token: instructorLogin.json?.token });
    check("assigned learner appears in instructor dashboard", instructorDashboard.status === 200 && instructorDashboard.json?.learners?.some((row) => row.email === learnerEmail));

    const review = await call("/admin/testimonials", { method: "POST", token: admin.json.token, body: { learnerName: "Test Learner", quote: reviewQuote, rating: 5, active: true } });
    reviewId = review.json?.testimonial?.id;
    const publicReviews = await call("/testimonials");
    check("published reviews appear publicly", review.status === 201 && publicReviews.json?.testimonials?.some((row) => row.quote === reviewQuote));
  } finally {
    if (reviewId) await prisma.testimonial.deleteMany({ where: { id: reviewId } });
    if (inviteId) await prisma.instructorInvite.deleteMany({ where: { id: inviteId } });
    if (learnerId) await prisma.learner.deleteMany({ where: { id: learnerId } });
    if (instructorId) await prisma.instructor.deleteMany({ where: { id: instructorId } });
    await prisma.user.deleteMany({ where: { email: { in: [instructorEmail, learnerEmail] } } });
    await prisma.$disconnect();
  }
  console.log(results.join("\n"));
  console.log(results.some((result) => result.startsWith("FAIL")) ? "\n>>> SOME CHECKS FAILED" : "\n>>> ALL CHECKS PASSED");
  if (results.some((result) => result.startsWith("FAIL"))) process.exitCode = 1;
})().catch(async (error) => { console.error("CRASH", error); await prisma.$disconnect(); process.exit(1); });
