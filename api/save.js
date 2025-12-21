function requireAdminPass(req) {
  const raw =
    req.headers["x-admin-pass"] ||
    req.headers["x-admin-password"] ||
    req.headers["authorization"];

  const pass = String(raw || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  const expected = String(process.env.ADMIN_WRITE_PASSWORD || "").trim();

  if (!expected) {
    const err = new Error("ADMIN_WRITE_PASSWORD is missing");
    err.statusCode = 500;
    throw err;
  }

  if (!pass || pass !== expected) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}
