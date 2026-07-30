interface Env {
	APP_ENV: string;
	SPREADSHEET_ID: string;
	MASTER_ITEM_SHEET: string;
	USERS_SHEET: string;
	SUPABASE_URL: string;
	SUPABASE_PUBLISHABLE_KEY: string;
	GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
	GOOGLE_PRIVATE_KEY_ID: string;
	GOOGLE_PRIVATE_KEY: string;
}

const ALLOWED_ORIGINS = new Set([
	"https://itumelaka.github.io",
	"http://localhost:3000",
	"http://localhost:5173",
	"http://127.0.0.1:3000",
	"http://127.0.0.1:5173",
]);

const ALLOWED_ROLES = new Set([
	"SUPER_ADMIN",
	"ADMIN_STOR",
	"PEMBANTU_STOR",
	"VIEWER",
]);

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

interface SupabaseUser {
	id?: string;
	email?: string;
	email_confirmed_at?: string | null;
}

interface AuthorizedUser {
	userId: string;
	nama: string;
	email: string;
	role: string;
	status: string;
}

class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

function getCorsHeaders(origin: string): Headers {
	return new Headers({
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	});
}

function addCorsHeaders(response: Response, origin: string | null): Response {
	if (!origin || !ALLOWED_ORIGINS.has(origin)) {
		return response;
	}

	const headers = new Headers(response.headers);
	getCorsHeaders(origin).forEach((value, key) => headers.set(key, value));

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function errorResponse(error: ApiError): Response {
	return Response.json(
		{
			success: false,
			error: error.code,
			message: error.message,
		},
		{ status: error.status },
	);
}

function normalizeEmail(value: unknown): string {
	return String(value ?? "").trim().toLowerCase();
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
	const encodedHeader = base64UrlEncode(JSON.stringify({
		alg: "RS256",
		typ: "JWT",
		kid: env.GOOGLE_PRIVATE_KEY_ID,
	}));
	const encodedClaims = base64UrlEncode(JSON.stringify({
		iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
		scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
		aud: "https://oauth2.googleapis.com/token",
		iat: now,
		exp: now + 3600,
	}));
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
		throw new ApiError(
			500,
			"GOOGLE_AUTH_ERROR",
			"Perkhidmatan data tidak dapat disahkan.",
		);
	}

	const tokenData = await tokenResponse.json<GoogleTokenResponse>();
	if (!tokenData.access_token) {
		throw new ApiError(
			500,
			"GOOGLE_AUTH_ERROR",
			"Perkhidmatan data tidak dapat disahkan.",
		);
	}
	return tokenData.access_token;
}

async function getSheetValues(
	env: Env,
	sheetName: string,
	googleAccessToken: string,
): Promise<SheetsValuesResponse> {
	const range = encodeURIComponent(`${sheetName}!A:Z`);
	const sheetsResponse = await fetch(
		`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${range}`,
		{
			headers: {
				Authorization: `Bearer ${googleAccessToken}`,
			},
		},
	);

	if (!sheetsResponse.ok) {
		throw new ApiError(
			500,
			"GOOGLE_SHEETS_ERROR",
			"Data aplikasi tidak dapat dibaca.",
		);
	}

	return sheetsResponse.json<SheetsValuesResponse>();
}

function rowsToRecords(sheetData: SheetsValuesResponse): Array<Record<string, string>> {
	const rows = sheetData.values ?? [];
	const headers = (rows[0] ?? []).map((header) => String(header).trim());

	return rows.slice(1).map((row) => Object.fromEntries(
		headers.map((header, index) => [header, String(row[index] ?? "").trim()]),
	));
}

function bearerToken(request: Request): string {
	const authorization = request.headers.get("Authorization");
	if (!authorization) {
		throw new ApiError(401, "AUTH_REQUIRED", "Log masuk diperlukan.");
	}

	const match = authorization.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1]?.trim();
	if (!token) {
		throw new ApiError(401, "INVALID_TOKEN", "Sesi tidak sah atau telah tamat.");
	}
	return token;
}

async function verifySupabaseUser(
	request: Request,
	env: Env,
): Promise<{ email: string }> {
	const token = bearerToken(request);
	if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
		throw new ApiError(
			500,
			"AUTH_CONFIG_ERROR",
			"Konfigurasi pengesahan tidak lengkap.",
		);
	}

	let response: Response;
	try {
		response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/user`, {
			headers: {
				apikey: env.SUPABASE_PUBLISHABLE_KEY,
				Authorization: `Bearer ${token}`,
			},
		});
	} catch {
		throw new ApiError(
			500,
			"AUTH_SERVICE_ERROR",
			"Perkhidmatan pengesahan tidak dapat dihubungi.",
		);
	}

	if (!response.ok) {
		if (response.status >= 500) {
			throw new ApiError(
				500,
				"AUTH_SERVICE_ERROR",
				"Perkhidmatan pengesahan tidak tersedia.",
			);
		}
		throw new ApiError(401, "INVALID_TOKEN", "Sesi tidak sah atau telah tamat.");
	}

	const user = await response.json<SupabaseUser>();
	const email = normalizeEmail(user.email);
	if (!email || !user.email_confirmed_at) {
		throw new ApiError(
			403,
			"EMAIL_REQUIRED",
			"Akaun Google tidak mempunyai e-mel yang disahkan.",
		);
	}

	return { email };
}

async function authorizeRequest(
	request: Request,
	env: Env,
): Promise<{ user: AuthorizedUser; googleAccessToken: string }> {
	const identity = await verifySupabaseUser(request, env);
	const googleAccessToken = await getGoogleAccessToken(env);
	const usersData = await getSheetValues(
		env,
		env.USERS_SHEET,
		googleAccessToken,
	);
	const record = rowsToRecords(usersData).find(
		(candidate) => normalizeEmail(candidate.EMAIL) === identity.email,
	);

	if (!record) {
		throw new ApiError(
			403,
			"USER_NOT_REGISTERED",
			"Pengguna belum didaftarkan untuk ITU eSTOR.",
		);
	}

	const status = String(record.STATUS ?? "").trim().toUpperCase();
	if (status !== "AKTIF") {
		throw new ApiError(
			403,
			"USER_INACTIVE",
			"Akses pengguna tidak aktif.",
		);
	}

	const role = String(record.ROLE ?? "").trim().toUpperCase();
	if (!ALLOWED_ROLES.has(role)) {
		throw new ApiError(
			403,
			"ROLE_NOT_ALLOWED",
			"Peranan pengguna tidak dibenarkan.",
		);
	}

	return {
		user: {
			userId: record.USER_ID,
			nama: record.NAMA,
			email: identity.email,
			role,
			status,
		},
		googleAccessToken,
	};
}

function mapInventoryItems(sheetData: SheetsValuesResponse) {
	return rowsToRecords(sheetData).map((record) => ({
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
	}));
}

async function protectedRoute(
	request: Request,
	env: Env,
	pathname: string,
): Promise<Response> {
	const authorization = await authorizeRequest(request, env);

	if (pathname === "/api/me") {
		return Response.json({
			success: true,
			user: authorization.user,
		});
	}

	const sheetData = await getSheetValues(
		env,
		env.MASTER_ITEM_SHEET,
		authorization.googleAccessToken,
	);
	const items = mapInventoryItems(sheetData);

	return Response.json({
		success: true,
		sheet: env.MASTER_ITEM_SHEET,
		count: items.length,
		items,
	});
}

export default {
	async fetch(request, env): Promise<Response> {
		const origin = request.headers.get("Origin");

		if (request.method === "OPTIONS") {
			if (!origin || !ALLOWED_ORIGINS.has(origin)) {
				return Response.json(
					{
						error: "CORS_ORIGIN_DENIED",
						message: "Origin tidak dibenarkan.",
					},
					{
						status: 403,
						headers: {
							Vary: "Origin",
						},
					},
				);
			}

			return new Response(null, {
				status: 204,
				headers: getCorsHeaders(origin),
			});
		}

		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/health") {
			return addCorsHeaders(Response.json({
				service: "ITU eSTOR API",
				status: "running",
				environment: env.APP_ENV,
				timestamp: new Date().toISOString(),
			}), origin);
		}

		if (
			request.method === "GET" &&
			(url.pathname === "/api/me" || url.pathname === "/api/items")
		) {
			try {
				return addCorsHeaders(
					await protectedRoute(request, env, url.pathname),
					origin,
				);
			} catch (error) {
				const apiError = error instanceof ApiError
					? error
					: new ApiError(
						500,
						"INTERNAL_ERROR",
						"Ralat dalaman berlaku.",
					);

				if (apiError.status >= 500) {
					console.error(JSON.stringify({
						message: "protected route failed",
						code: apiError.code,
						path: url.pathname,
						status: apiError.status,
					}));
				}
				return addCorsHeaders(errorResponse(apiError), origin);
			}
		}

		return addCorsHeaders(Response.json(
			{
				error: "NOT_FOUND",
				message: "Endpoint tidak ditemui.",
			},
			{ status: 404 },
		), origin);
	},
} satisfies ExportedHandler<Env>;
