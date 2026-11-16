// POST /messages: the only public write path. Layers, cheapest first:
//   1 body size  2 origin  3 honeypot  4 field validation + link limit
//   5 Cloudflare Turnstile (bot check, server-side)  6 per-IP rate limit  7 store  8 email the owner
import { DynamoDBClient, ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { randomUUID, createHash } from "node:crypto";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});
const ses = new SESv2Client({});
const E = process.env;
const ORIGINS = new Set((E.ALLOWED_ORIGINS || "").split(",").filter(Boolean));
const HOSTS = new Set((E.ALLOWED_HOSTS || "").split(",").filter(Boolean));
const TOPICS = new Set(["Talk or workshop", "Question", "Collaboration", "Video feedback", "Just saying hi"]);
const EMAIL = /^[^\s@<>()",;]{1,64}@[^\s@<>()",;]{1,190}\.[a-z]{2,24}$/i;
const MAX_BODY = 16 * 1024;
const MAX_LINKS = 3;

const res = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) });
const fail = (statusCode, code, message) => res(statusCode, { error: { code, message } });
const clean = (v, max) => (typeof v === "string" ? v.normalize("NFC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim().slice(0, max) : "");
const oneLine = (v) => v.replace(/[\r\n]+/g, " ");

let secretCache;
async function turnstileSecret() {
  if (!secretCache) {
    const r = await ssm.send(new GetParameterCommand({ Name: E.TURNSTILE_PARAM, WithDecryption: true }));
    secretCache = r.Parameter?.Value;
  }
  return secretCache;
}

async function verifyTurnstile(token, ip) {
  if (typeof token !== "string" || token.length < 10 || token.length > 2048) return false;
  const secret = await turnstileSecret();
  if (!secret) return false; // fail closed
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip || "", idempotency_key: randomUUID() }),
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) return false;
  const v = await r.json();
  return v.success === true && v.action === "contact" && HOSTS.has(v.hostname);
}

async function underRateLimit(ip) {
  const ipHash = createHash("sha256").update(`${E.IP_SALT}:${ip || "unknown"}`).digest("hex").slice(0, 32);
  const windowStart = Math.floor(Date.now() / 600_000); // 10-minute window
  try {
    await db.send(new UpdateCommand({
      TableName: E.TABLE,
      Key: { pk: "RL", sk: `${ipHash}#${windowStart}` },
      UpdateExpression: "ADD n :one SET expiresAt = if_not_exists(expiresAt, :exp)",
      ConditionExpression: "attribute_not_exists(n) OR n < :max",
      ExpressionAttributeValues: { ":one": 1, ":max": Number(E.MAX_PER_IP || 3), ":exp": Math.floor(Date.now() / 1000) + 1800 },
    }));
    return true;
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException || e?.name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}

async function notifyOwner(item) {
  const lines = [
    `New ${item.topic} message on yeshwanthlm.in`, "",
    `From:  ${item.name || "(no name)"} ${item.email ? `<${item.email}>` : "(no email)"}`,
    `When:  ${item.createdAt}`, "", item.message, "",
    "Open the inbox: https://yeshwanthlm.in/admin/",
  ];
  await ses.send(new SendEmailCommand({
    FromEmailAddress: E.NOTIFY_EMAIL,
    Destination: { ToAddresses: [E.NOTIFY_EMAIL] },
    ReplyToAddresses: item.email ? [item.email] : undefined,
    Content: { Simple: { Subject: { Data: oneLine(`Ping (${item.topic}) from ${item.name || "someone"}`).slice(0, 150) }, Body: { Text: { Data: lines.join("\n") } } } },
  }));
}

export const handler = async (event) => {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString() : event.body || "";
  if (raw.length > MAX_BODY) return fail(413, "too_large", "Message is too large.");

  const origin = event.headers?.origin || event.headers?.Origin || "";
  if (!ORIGINS.has(origin)) return fail(403, "origin", "Not allowed.");

  let input;
  try { input = JSON.parse(raw || "{}"); } catch { return fail(400, "bad_json", "Body must be JSON."); }
  if (!input || typeof input !== "object") return fail(400, "bad_json", "Body must be JSON.");

  if (input._honey) return res(201, { ok: true }); // bot filled the hidden field: pretend success, store nothing

  const message = clean(input.message, 5000);
  const topic = TOPICS.has(input.topic) ? input.topic : "Question";
  const name = oneLine(clean(input.name, 100));
  const email = clean(input.email, 254).toLowerCase();

  if (!message) return fail(400, "empty", "Message is required.");
  if (email && !EMAIL.test(email)) return fail(400, "bad_email", "Email looks invalid.");
  if ((message.match(/https?:\/\/|www\./gi) || []).length > MAX_LINKS) return fail(400, "links", `Please include at most ${MAX_LINKS} links.`);

  const ip = event.requestContext?.http?.sourceIp;
  if (!(await verifyTurnstile(input.turnstileToken, ip))) return fail(403, "bot_check", "Couldn't verify you're human. Refresh and try again.");
  if (!(await underRateLimit(ip))) return fail(429, "rate_limited", "Too many messages. Try again in a few minutes.");

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const item = {
    pk: "MSG", sk: `${createdAt}#${id}`, id, createdAt, topic, message, name, email, read: false,
    expiresAt: Math.floor(Date.now() / 1000) + Number(E.RETENTION_DAYS || 365) * 86400,
  };
  await db.send(new PutCommand({ TableName: E.TABLE, Item: item, ConditionExpression: "attribute_not_exists(sk)" }));

  try { await notifyOwner(item); } catch (e) { console.error("notify failed", e?.name); } // message is already saved

  return res(201, { ok: true });
};
