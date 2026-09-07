const ALLOWED_ROLES = new Set([
  "SUPER_ADMIN",
  "ADMIN_STOR",
  "PEMBANTU_STOR",
  "VIEWER",
]);
const MAX_CLOCK_SKEW_SECONDS = 300;
const REPLAY_TTL_SECONDS = 600;

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function requiredString(payload, key, maxLength) {
  const value = payload && typeof payload[key] === "string" ? payload[key].trim() : "";
  if (!value || value.length > maxLength) throw new Error("INVALID_REQUEST");
  return value;
}

function webhookMessage(values) {
  return values.map((value) => `${value.length}:${value}`).join("|");
}

function base64Url(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}

function constantTimeEqual(left, right) {
  const leftBytes = Utilities.newBlob(left).getBytes();
  const rightBytes = Utilities.newBlob(right).getBytes();
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

function doGet() {
  return jsonResponse({ ok: true, service: "ITU eSTOR email" });
}

function doPost(event) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const secret = properties.getProperty("ESTOR_EMAIL_WEBHOOK_SECRET");
    if (!secret || secret.length < 32) throw new Error("NOT_CONFIGURED");

    const payload = JSON.parse(event && event.postData ? event.postData.contents : "{}");
    const version = requiredString(payload, "version", 4);
    const sentAt = requiredString(payload, "sentAt", 16);
    const nonce = requiredString(payload, "nonce", 64);
    const to = requiredString(payload, "to", 254).toLowerCase();
    const name = requiredString(payload, "name", 160);
    const role = requiredString(payload, "role", 32).toUpperCase();
    const appUrl = requiredString(payload, "appUrl", 500);
    const signature = requiredString(payload, "signature", 128);

    if (version !== "1" || !/^\d+$/.test(sentAt) || !/^[0-9a-f-]{36}$/i.test(nonce)) {
      throw new Error("INVALID_REQUEST");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !ALLOWED_ROLES.has(role)) {
      throw new Error("INVALID_REQUEST");
    }
    if (!/^https:\/\/itumelaka\.github\.io\/ituestor\/$/.test(appUrl)) {
      throw new Error("INVALID_REQUEST");
    }

    const timestamp = Number(sentAt);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
      throw new Error("EXPIRED_REQUEST");
    }

    const message = webhookMessage([version, sentAt, nonce, to, name, role, appUrl]);
    const expected = base64Url(Utilities.computeHmacSha256Signature(
      message,
      secret,
      Utilities.Charset.UTF_8,
    ));
    if (!constantTimeEqual(signature, expected)) throw new Error("INVALID_SIGNATURE");

    const cache = CacheService.getScriptCache();
    if (cache.get(`nonce:${nonce}`)) throw new Error("REPLAYED_REQUEST");
    cache.put(`nonce:${nonce}`, "1", REPLAY_TTL_SECONDS);

    if (MailApp.getRemainingDailyQuota() < 1) throw new Error("EMAIL_QUOTA_EXHAUSTED");
    const subject = "Akses ITU eSTOR anda telah diluluskan";
    const body = [
      `Salam ${name},`,
      "",
      `Permohonan akses ITU eSTOR anda telah diluluskan dengan peranan ${role}.`,
      `Log masuk menggunakan akaun Google yang sama: ${appUrl}`,
      "",
      "ITU eSTOR",
    ].join("\n");
    const htmlBody = [
      `<p>Salam ${escapeHtml(name)},</p>`,
      `<p>Permohonan akses ITU eSTOR anda telah diluluskan dengan peranan <strong>${escapeHtml(role)}</strong>.</p>`,
      `<p><a href="${escapeHtml(appUrl)}">Log masuk ke ITU eSTOR</a> menggunakan akaun Google yang sama.</p>`,
      "<p>ITU eSTOR</p>",
    ].join("");

    MailApp.sendEmail({
      to,
      subject,
      body,
      htmlBody,
      name: "ITU eSTOR",
      replyTo: "itumelaka@gmail.com",
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({
      message: "ITU eSTOR email request failed",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    }));
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "UNKNOWN_ERROR" });
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
