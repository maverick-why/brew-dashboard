function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Wechat-Signature");
}

function ok(res, data) {
  setCors(res);
  return res.status(200).json({ code: 0, data });
}

function error(res, status, message) {
  setCors(res);
  return res.status(status).json({ code: 1, message });
}

function xml(res, status, body) {
  setCors(res);
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  return res.status(status).send(body);
}

module.exports = { ok, error, xml, setCors };
