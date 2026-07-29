interface Env {
APP_ENV: string;
SPREADSHEET_ID: string;
MASTER_ITEM_SHEET: string;
GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
GOOGLE_PRIVATE_KEY_ID: string;
GOOGLE_PRIVATE_KEY: string;
}
interface GoogleTokenResponse {
access_token: string;
token_type: string;
expires_in: number;
}

interface SheetsValuesResponse {
range: string;
majorDimension: string;
values?: string[][];
}

function base64UrlEncode(input: string | ArrayBuffer): string {
let binary: string;

if (typeof input === "string") {
binary = unescape(encodeURIComponent(input));
} else {
const bytes = new Uint8Array(input);
binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

return btoa(binary)
.replace(/\+/g, "-")
.replace(/\//g, "_")
.replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
const normalizedPem = pem.replace(/\\n/g, "\n");
const base64 = normalizedPem
.replace("-----BEGIN PRIVATE KEY-----", "")
.replace("-----END PRIVATE KEY-----", "")
.replace(/\s/g, "");

const binary = atob(base64);
const bytes = new Uint8Array(binary.length);

for (let index = 0; index < binary.length; index += 1) {
bytes[index] = binary.charCodeAt(index);
}

return bytes.buffer;
}

async function getGoogleAccessToken(env: Env): Promise<string> {
const now = Math.floor(Date.now() / 1000);

const header = {
alg: "RS256",
typ: "JWT",
kid: env.GOOGLE_PRIVATE_KEY_ID,
};

const claims = {
iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
aud: "https://oauth2.googleapis.com/token",
iat: now,
exp: now + 3600,
};

const encodedHeader = base64UrlEncode(JSON.stringify(header));
const encodedClaims = base64UrlEncode(JSON.stringify(claims));
const unsignedJwt = `${encodedHeader}.${encodedClaims}`;

const privateKey = await crypto.subtle.importKey(
"pkcs8",
pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY),
{
name: "RSASSA-PKCS1-v1_5",
hash: "SHA-256",
},
false,
["sign"],
);

const signature = await crypto.subtle.sign(
"RSASSA-PKCS1-v1_5",
privateKey,
new TextEncoder().encode(unsignedJwt),
);

const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
method: "POST",
headers: {
"Content-Type": "application/x-www-form-urlencoded",
},
body: new URLSearchParams({
grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
assertion,
}),
});

if (!tokenResponse.ok) {
const details = await tokenResponse.text();
throw new Error(`Google OAuth gagal: ${tokenResponse.status} ${details}`);
}

const tokenData = await tokenResponse.json<GoogleTokenResponse>();
return tokenData.access_token;
}

async function getMasterItems(env: Env): Promise<SheetsValuesResponse> {
const accessToken = await getGoogleAccessToken(env);
const range = encodeURIComponent(`${env.MASTER_ITEM_SHEET}!A:Z`);

const sheetsResponse = await fetch(
`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${range}`,
{
headers: {
Authorization: `Bearer ${accessToken}`,
},
},
);

if (!sheetsResponse.ok) {
const details = await sheetsResponse.text();
throw new Error(`Google Sheets gagal: ${sheetsResponse.status} ${details}`);
}

return sheetsResponse.json<SheetsValuesResponse>();
}

export default {
async fetch(request, env): Promise<Response> {
const url = new URL(request.url);

if (request.method === "GET" && url.pathname === "/health") {
return Response.json({
service: "ITU eSTOR API",
status: "running",
environment: env.APP_ENV,
timestamp: new Date().toISOString(),
credentials: {
emailLoaded: typeof env.GOOGLE_SERVICE_ACCOUNT_EMAIL === "string",
emailLength: env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.length ?? 0,
privateKeyLoaded: typeof env.GOOGLE_PRIVATE_KEY === "string",
privateKeyLength: env.GOOGLE_PRIVATE_KEY?.length ?? 0,
},
});
}

if (request.method === "GET" && url.pathname === "/api/items") {
try {
const sheetData = await getMasterItems(env);

const rows = sheetData.values ?? [];
const headers = rows[0] ?? [];

const items = rows.slice(1).map((row) => {
const record = Object.fromEntries(
headers.map((header, index) => [header, row[index] ?? ""]),
);

return {
itemId: record.ITEM_ID,
kategori: record.KATEGORI,
namaItem: record.NAMA_ITEM,
namaItemAsal: record.NAMA_ITEM_ASAL,
unit: record.UNIT,
kosSeunit: Number(
String(record.KOS_SEUNIT)
.replace("RM", "")
.replace(/,/g, "")
.trim(),
),
stokAwal: Number(record.STOK_AWAL || 0),
stokMinimum: Number(record.STOK_MINIMUM || 0),
status: record.STATUS,
sumberTab: record.SUMBER_TAB,
sumberBaris: Number(record.SUMBER_BARIS || 0),
createdAt: record.CREATED_AT,
updatedAt: record.UPDATED_AT,
};
});

return Response.json({
success: true,
sheet: env.MASTER_ITEM_SHEET,
count: items.length,
items,
});
} catch (error) {
console.error(error);

return Response.json(
{
success: false,
error: "GOOGLE_SHEETS_ERROR",
message:
error instanceof Error
? error.message
: "Gagal membaca Google Sheet.",
},
{ status: 500 },
);
}
}

return Response.json(
{
error: "NOT_FOUND",
message: "Endpoint tidak ditemui.",
},
{ status: 404 },
);
},
} satisfies ExportedHandler<Env>;





