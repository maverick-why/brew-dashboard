module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
    }

    const pass = req.headers["x-admin-pass"] || req.headers["x-admin-password"];
    if (!pass || pass !== process.env.ADMIN_WRITE_PASSWORD) {
      return res.status(401).end(JSON.stringify({ ok: false, error: "Unauthorized" }));
    }

    return res.status(200).end(JSON.stringify({ ok: true }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};

