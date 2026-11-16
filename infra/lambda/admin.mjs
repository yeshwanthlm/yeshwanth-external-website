// Admin API, behind the Cognito JWT authorizer (valid token required) plus an admin-group check here:
//   GET    /admin/messages        newest first
//   PATCH  /admin/messages/{id}   body { sk, read }
//   DELETE /admin/messages/{id}   body { sk }
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE;
const ADMIN_GROUP = process.env.ADMIN_GROUP || "admin";
const SK = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z#[0-9a-f-]{36}$/;
const res = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) });

const isAdmin = (event) => {
  const c = event.requestContext?.authorizer?.jwt?.claims || {};
  const groups = String(c["cognito:groups"] || "").replace(/[\[\]"]/g, "").split(/[,\s]+/);
  return c.token_use === "access" && groups.includes(ADMIN_GROUP);
};

export const handler = async (event) => {
  if (!isAdmin(event)) return res(403, { error: { code: "forbidden", message: "Admins only." } });

  const route = event.routeKey;
  if (route === "GET /admin/messages") {
    const items = [];
    let ExclusiveStartKey;
    do {
      const r = await db.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "pk = :p",
        ExpressionAttributeValues: { ":p": "MSG" },
        ScanIndexForward: false,
        ExclusiveStartKey,
      }));
      items.push(...r.Items);
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey && items.length < 2000);
    return res(200, { items: items.map(({ pk, expiresAt, ...rest }) => rest) });
  }

  if ((event.body || "").length > 1024) return res(413, { error: { code: "too_large", message: "Body too large." } });
  const body = (() => { try { return JSON.parse(event.body || "{}"); } catch { return {}; } })();
  const id = event.pathParameters?.id;
  const sk = body.sk;
  if (!id || typeof sk !== "string" || !SK.test(sk) || !sk.endsWith(`#${id}`)) return res(400, { error: { code: "bad_key", message: "Missing or invalid message key." } });

  try {
    if (route === "PATCH /admin/messages/{id}") {
      await db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { pk: "MSG", sk },
        UpdateExpression: "SET #r = :r",
        ConditionExpression: "attribute_exists(sk)",
        ExpressionAttributeNames: { "#r": "read" },
        ExpressionAttributeValues: { ":r": body.read === true },
      }));
      return res(200, { ok: true });
    }
    if (route === "DELETE /admin/messages/{id}") {
      await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: "MSG", sk } }));
      return res(200, { ok: true });
    }
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") return res(404, { error: { code: "gone", message: "Message no longer exists." } });
    throw e;
  }
  return res(404, { error: { code: "not_found", message: "Unknown route." } });
};
