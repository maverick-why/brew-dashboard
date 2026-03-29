// api/_lib/admin-auth.js
function verifyAdmin(req) {
  const pwd = req.headers['x-admin-pass'];
  if (!pwd || pwd !== process.env.ADMIN_PASSWORD) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}
module.exports = { verifyAdmin };
