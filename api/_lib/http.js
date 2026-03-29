const { error, setCors } = require("./response");

function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    setCors(res);
    res.status(204).end();
    return true;
  }

  return false;
}

function ensureMethod(req, res, methods) {
  if (!methods.includes(req.method)) {
    error(res, 405, `Method ${req.method} not allowed`);
    return false;
  }

  return true;
}

function getQuery(req) {
  const url = new URL(req.url, "http://localhost");
  return Object.fromEntries(url.searchParams.entries());
}

async function readRawBody(req) {
  if (typeof req.body === "string") {
    return req.body;
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }

  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw = await readRawBody(req);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    const errorInstance = new Error("Invalid JSON body");
    errorInstance.status = 400;
    throw errorInstance;
  }
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round(parseNumber(value) * 100) / 100;
}

module.exports = {
  ensureMethod,
  getQuery,
  handleOptions,
  parseNumber,
  readJsonBody,
  readRawBody,
  roundMoney,
};
