interface Env {
	APP_ENV: string;
	SPREADSHEET_ID: string;
	MASTER_ITEM_SHEET: string;
	USERS_SHEET: string;
	TRANSACTIONS_SHEET: string;
	AUDIT_LOG_SHEET: string;
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
const WRITE_ROLES = new Set(["SUPER_ADMIN", "ADMIN_STOR", "PEMBANTU_STOR"]);
const CREATE_ITEM_ROLES = new Set(["SUPER_ADMIN", "ADMIN_STOR"]);
const CATEGORY_PREFIXES = new Map([
	["ALAT TULIS", "AT"],
	["BAHAN KIMIA", "BK"],
	["HOUSE HOLD", "HH"],
	["LAIN-LAIN", "LL"],
]);
const POSITIVE_TRANSACTION_TYPES = new Set([
	"MASUK",
	"PELARASAN_TAMBAH",
	"PULANGAN",
]);
const NEGATIVE_TRANSACTION_TYPES = new Set([
	"KELUAR",
	"PELARASAN_TOLAK",
	"ROSAK_LUPUS",
]);
const MAX_JSON_BODY_BYTES = 16 * 1024;
const IDEMPOTENCY_KEY_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

interface IncomingTransactionPayload {
	itemId: string;
	kuantiti: number;
	kosSeunit: number;
	pihakTerlibat: string;
	bahagian: string;
	tujuan: string;
	catatan: string;
}

interface TransactionResult {
	transactionId: string;
	timestamp: string;
	itemId: string;
	jenis: "MASUK";
	kuantiti: number;
	kosSeunit: number;
	jumlahNilai: number;
	pihakTerlibat: string;
	bahagian: string;
	tujuan: string;
	catatan: string;
	createdByName: string;
	createdByEmail: string;
	status: "SAH";
}

interface CreateItemPayload {
	kategori: string;
	namaItem: string;
	unit: string;
	kosSeunit: number;
	stokMinimum: number;
}

interface CreatedItemResult extends CreateItemPayload {
	itemId: string;
	stokAwal: 0;
	status: "AKTIF";
	createdAt: string;
	updatedAt: string;
}

class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly details?: Record<string, unknown>,
	) {
		super(message);
	}
}

function getCorsHeaders(origin: string): Headers {
	return new Headers({
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
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
			...(error.details ?? {}),
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
		scope: "https://www.googleapis.com/auth/spreadsheets",
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

function sheetHeaders(sheetData: SheetsValuesResponse): string[] {
	return (sheetData.values?.[0] ?? []).map((header) => String(header).trim());
}

async function appendSheetRecord(
	env: Env,
	sheetName: string,
	googleAccessToken: string,
	headers: string[],
	record: Record<string, string | number>,
): Promise<void> {
	if (headers.length === 0) {
		throw new ApiError(500, "WRITE_FAILED", "Rekod tidak dapat disimpan.");
	}

	const range = encodeURIComponent(`${sheetName}!A:Z`);
	let response: Response;
	try {
		response = await fetch(
			`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${googleAccessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					majorDimension: "ROWS",
					values: [headers.map((header) => record[header] ?? "")],
				}),
			},
		);
	} catch {
		throw new ApiError(500, "WRITE_FAILED", "Rekod tidak dapat disimpan.");
	}

	if (!response.ok) {
		throw new ApiError(500, "WRITE_FAILED", "Rekod tidak dapat disimpan.");
	}
}

async function readJsonBody(request: Request): Promise<unknown> {
	const contentType = request.headers.get("Content-Type") ?? "";
	if (!contentType.toLowerCase().includes("application/json")) {
		throw new ApiError(400, "INVALID_JSON", "Badan permintaan mesti JSON yang sah.");
	}

	const contentLength = Number(request.headers.get("Content-Length") ?? 0);
	if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
		throw new ApiError(400, "VALIDATION_ERROR", "Badan permintaan terlalu besar.");
	}

	const reader = request.body?.getReader();
	if (!reader) {
		throw new ApiError(400, "INVALID_JSON", "Badan permintaan mesti JSON yang sah.");
	}

	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_JSON_BODY_BYTES) {
			await reader.cancel();
			throw new ApiError(400, "VALIDATION_ERROR", "Badan permintaan terlalu besar.");
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	try {
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new ApiError(400, "INVALID_JSON", "Badan permintaan mesti JSON yang sah.");
	}
}

function requiredText(
	value: unknown,
	fieldName: string,
	maxLength: number,
	optional = false,
): string {
	if (typeof value !== "string") {
		if (optional && (value === undefined || value === null)) return "";
		throw new ApiError(400, "VALIDATION_ERROR", `${fieldName} tidak sah.`);
	}
	const normalized = value.trim();
	if ((!optional && !normalized) || normalized.length > maxLength) {
		throw new ApiError(400, "VALIDATION_ERROR", `${fieldName} tidak sah.`);
	}
	return normalized;
}

function requiredNumber(
	value: unknown,
	fieldName: string,
	allowZero: boolean,
	maximum: number,
	requireTwoDecimals = false,
): number {
	if (
		(typeof value !== "number" && typeof value !== "string") ||
		(typeof value === "string" && !value.trim())
	) {
		throw new ApiError(400, "VALIDATION_ERROR", `${fieldName} tidak sah.`);
	}
	const number = Number(value);
	if (
		!Number.isFinite(number) ||
		(allowZero ? number < 0 : number <= 0) ||
		number > maximum ||
		(requireTwoDecimals && Math.abs(number * 100 - Math.round(number * 100)) > 1e-8)
	) {
		throw new ApiError(400, "VALIDATION_ERROR", `${fieldName} tidak sah.`);
	}
	return number;
}

function validateIncomingTransaction(value: unknown): IncomingTransactionPayload {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new ApiError(400, "VALIDATION_ERROR", "Maklumat transaksi tidak sah.");
	}
	const body = value as Record<string, unknown>;
	return {
		itemId: requiredText(body.itemId, "Item", 80),
		kuantiti: requiredNumber(body.kuantiti, "Kuantiti", false, 1_000_000_000),
		kosSeunit: requiredNumber(body.kosSeunit, "Kos seunit", true, 1_000_000_000, true),
		pihakTerlibat: requiredText(body.pihakTerlibat, "Pihak terlibat", 160),
		bahagian: requiredText(body.bahagian, "Bahagian", 120),
		tujuan: requiredText(body.tujuan, "Tujuan", 300),
		catatan: requiredText(body.catatan, "Catatan", 1000, true),
	};
}

function normalizeSpaces(value: string): string {
	return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizedLookupText(value: unknown): string {
	return normalizeSpaces(String(value ?? "")).toLocaleLowerCase("ms");
}

function strictNonNegativeNumber(
	value: unknown,
	fieldName: string,
	maximum: number,
	requireTwoDecimals = false,
): number {
	if (
		(typeof value !== "number" && typeof value !== "string") ||
		(typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim()))
	) {
		throw new ApiError(400, "VALIDATION_ERROR", `${fieldName} tidak sah.`);
	}
	const number = Number(value);
	if (
		!Number.isFinite(number) ||
		number < 0 ||
		number > maximum ||
		(requireTwoDecimals && Math.abs(number * 100 - Math.round(number * 100)) > 1e-8)
	) {
		throw new ApiError(400, "VALIDATION_ERROR", `${fieldName} tidak sah.`);
	}
	return number;
}

function validateCreateItem(value: unknown): CreateItemPayload {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new ApiError(400, "VALIDATION_ERROR", "Maklumat item tidak sah.");
	}
	const body = value as Record<string, unknown>;
	const categoryInput = requiredText(body.kategori, "Kategori", 40);
	const kategori = normalizeSpaces(categoryInput).toLocaleUpperCase("ms");
	if (!CATEGORY_PREFIXES.has(kategori)) {
		throw new ApiError(400, "VALIDATION_ERROR", "Kategori tidak sah.");
	}

	const namaItem = normalizeSpaces(requiredText(body.namaItem, "Nama item", 160));
	const unit = normalizeSpaces(requiredText(body.unit, "Unit", 40))
		.toLocaleUpperCase("ms");
	if (/[\u0000-\u001F\u007F]/.test(namaItem) || /[\u0000-\u001F\u007F]/.test(unit)) {
		throw new ApiError(400, "VALIDATION_ERROR", "Maklumat teks tidak sah.");
	}

	return {
		kategori,
		namaItem,
		unit,
		kosSeunit: strictNonNegativeNumber(
			body.kosSeunit,
			"Kos seunit",
			1_000_000_000,
			true,
		),
		stokMinimum: strictNonNegativeNumber(
			body.stokMinimum,
			"Stok minimum",
			1_000_000_000,
		),
	};
}

function idempotencyKey(request: Request): string {
	const key = request.headers.get("Idempotency-Key")?.trim() ?? "";
	if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
		throw new ApiError(
			400,
			"INVALID_IDEMPOTENCY_KEY",
			"Kunci idempotensi UUID yang sah diperlukan.",
		);
	}
	return key.toLowerCase();
}

async function stableId(prefix: "TXN" | "AUD", key: string): Promise<string> {
	// ID deterministik menjadikan helaian pengeluaran sebagai stor idempotensi
	// kekal tanpa bergantung pada memori Worker.
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`${prefix}:${key}`),
	);
	const suffix = Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
		byte.toString(16).padStart(2, "0")
	).join("").toUpperCase();
	return `${prefix}-${suffix}`;
}

function itemRecord(result: CreatedItemResult): Record<string, string | number> {
	// Rekod ciptaan aplikasi menggunakan konvensyen sumber NEW_ITEM / 0;
	// tab dan baris legasi tidak disentuh.
	return {
		ITEM_ID: result.itemId,
		KATEGORI: result.kategori,
		NAMA_ITEM: result.namaItem,
		NAMA_ITEM_ASAL: result.namaItem,
		UNIT: result.unit,
		KOS_SEUNIT: result.kosSeunit,
		STOK_AWAL: 0,
		STOK_MINIMUM: result.stokMinimum,
		STATUS: "AKTIF",
		SUMBER_TAB: "NEW_ITEM",
		SUMBER_BARIS: 0,
		CREATED_AT: result.createdAt,
		UPDATED_AT: result.updatedAt,
	};
}

function publicItemResult(result: CreatedItemResult) {
	return {
		itemId: result.itemId,
		kategori: result.kategori,
		namaItem: result.namaItem,
		unit: result.unit,
		kosSeunit: result.kosSeunit,
		stokAwal: result.stokAwal,
		stokMinimum: result.stokMinimum,
		status: result.status,
		createdAt: result.createdAt,
		updatedAt: result.updatedAt,
	};
}

function itemMatchesPayload(
	record: Record<string, string>,
	payload: CreateItemPayload,
): boolean {
	return normalizedLookupText(record.NAMA_ITEM) === normalizedLookupText(payload.namaItem) &&
		normalizeSpaces(record.KATEGORI).toLocaleUpperCase("ms") === payload.kategori &&
		normalizeSpaces(record.UNIT).toLocaleUpperCase("ms") === payload.unit;
}

function createdItemMatches(
	record: Record<string, string>,
	result: CreatedItemResult,
): boolean {
	return record.ITEM_ID === result.itemId &&
		itemMatchesPayload(record, result) &&
		Number(record.KOS_SEUNIT) === result.kosSeunit &&
		Number(record.STOK_AWAL) === 0 &&
		Number(record.STOK_MINIMUM) === result.stokMinimum &&
		String(record.STATUS ?? "").trim().toUpperCase() === "AKTIF";
}

function existingItemSummary(record: Record<string, string>) {
	return {
		itemId: record.ITEM_ID,
		kategori: record.KATEGORI,
		namaItem: record.NAMA_ITEM,
		unit: record.UNIT,
		status: record.STATUS,
	};
}

function nextItemId(records: Array<Record<string, string>>, prefix: string): string {
	const pattern = new RegExp(`^${prefix}-(\\d+)$`);
	let maximum = 0;
	const existingIds = new Set(records.map((record) => record.ITEM_ID));
	for (const record of records) {
		const match = String(record.ITEM_ID ?? "").trim().match(pattern);
		if (!match) continue;
		const sequence = Number(match[1]);
		if (Number.isSafeInteger(sequence)) maximum = Math.max(maximum, sequence);
	}

	let next = maximum + 1;
	while (next <= 9999) {
		const candidate = `${prefix}-${String(next).padStart(4, "0")}`;
		if (!existingIds.has(candidate)) return candidate;
		next += 1;
	}
	throw new ApiError(500, "WRITE_FAILED", "ID item baharu tidak dapat dijana.");
}

function parseCreatedItemAudit(record: Record<string, string>): CreatedItemResult | null {
	try {
		const value = JSON.parse(record.AFTER_JSON);
		if (
			!value ||
			typeof value !== "object" ||
			typeof value.itemId !== "string" ||
			typeof value.kategori !== "string" ||
			typeof value.namaItem !== "string" ||
			typeof value.unit !== "string" ||
			typeof value.createdAt !== "string" ||
			typeof value.updatedAt !== "string"
		) {
			return null;
		}
		const kosSeunit = Number(value.kosSeunit);
		const stokMinimum = Number(value.stokMinimum);
		if (!Number.isFinite(kosSeunit) || !Number.isFinite(stokMinimum)) return null;
		return {
			itemId: value.itemId,
			kategori: value.kategori,
			namaItem: value.namaItem,
			unit: value.unit,
			kosSeunit,
			stokAwal: 0,
			stokMinimum,
			status: "AKTIF",
			createdAt: value.createdAt,
			updatedAt: value.updatedAt,
		};
	} catch {
		return null;
	}
}

function malaysiaTimestamp(date = new Date()): string {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Kuala_Lumpur",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		}).formatToParts(date).map(({ type, value }) => [type, value]),
	);
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function transactionRecord(result: TransactionResult): Record<string, string | number> {
	return {
		TRANSACTION_ID: result.transactionId,
		TIMESTAMP: result.timestamp,
		ITEM_ID: result.itemId,
		JENIS: result.jenis,
		KUANTITI: result.kuantiti,
		KOS_SEUNIT: result.kosSeunit,
		JUMLAH_NILAI: result.jumlahNilai,
		PIHAK_TERLIBAT: result.pihakTerlibat,
		BAHAGIAN: result.bahagian,
		TUJUAN: result.tujuan,
		CATATAN: result.catatan,
		CREATED_BY_EMAIL: result.createdByEmail,
		CREATED_BY_NAME: result.createdByName,
		STATUS: result.status,
	};
}

function matchesExistingTransaction(
	record: Record<string, string>,
	result: TransactionResult,
): boolean {
	const expected = transactionRecord(result);
	return Object.entries(expected).every(([header, value]) => {
		if (header === "TIMESTAMP") return true;
		if (typeof value === "number") return Number(record[header]) === value;
		return String(record[header] ?? "").trim() === String(value);
	});
}

function createItemPayloadMatches(
	result: CreatedItemResult,
	payload: CreateItemPayload,
): boolean {
	return result.kategori === payload.kategori &&
		normalizedLookupText(result.namaItem) === normalizedLookupText(payload.namaItem) &&
		result.unit === payload.unit &&
		result.kosSeunit === payload.kosSeunit &&
		result.stokMinimum === payload.stokMinimum;
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

function roundDecimal(value: number, decimalPlaces = 10): number {
	const multiplier = 10 ** decimalPlaces;
	return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

interface StockMovement {
	jumlahMasuk: number;
	jumlahKeluar: number;
}

function aggregateStockMovements(
	transactionsData: SheetsValuesResponse,
	knownItemIds: Set<string>,
): Map<string, StockMovement> {
	const movements = new Map<string, StockMovement>();

	for (const record of rowsToRecords(transactionsData)) {
		if (String(record.STATUS ?? "").trim().toUpperCase() !== "SAH") continue;

		const itemId = String(record.ITEM_ID ?? "").trim();
		if (!itemId || !knownItemIds.has(itemId)) continue;

		const quantity = Number(String(record.KUANTITI ?? "").trim());
		if (!Number.isFinite(quantity) || quantity <= 0) continue;

		const type = String(record.JENIS ?? "").trim().toUpperCase();
		const positive = POSITIVE_TRANSACTION_TYPES.has(type);
		const negative = NEGATIVE_TRANSACTION_TYPES.has(type);
		if (!positive && !negative) continue;

		const current = movements.get(itemId) ?? {
			jumlahMasuk: 0,
			jumlahKeluar: 0,
		};
		if (positive) current.jumlahMasuk = roundDecimal(current.jumlahMasuk + quantity);
		if (negative) current.jumlahKeluar = roundDecimal(current.jumlahKeluar + quantity);
		movements.set(itemId, current);
	}

	return movements;
}

function mapInventoryItems(
	sheetData: SheetsValuesResponse,
	transactionsData: SheetsValuesResponse,
) {
	const records = rowsToRecords(sheetData);
	const itemIds = new Set(records.map((record) => String(record.ITEM_ID ?? "").trim()));
	const movements = aggregateStockMovements(transactionsData, itemIds);

	return records.map((record) => {
		const itemId = record.ITEM_ID;
		const kosSeunit = Number(
			String(record.KOS_SEUNIT)
				.replace("RM", "")
				.replace(/,/g, "")
				.trim(),
		);
		const stokAwal = Number(record.STOK_AWAL || 0);
		const stokMinimum = Number(record.STOK_MINIMUM || 0);
		const movement = movements.get(itemId) ?? { jumlahMasuk: 0, jumlahKeluar: 0 };
		const stokSemasa = roundDecimal(stokAwal + movement.jumlahMasuk - movement.jumlahKeluar);
		const nilaiStokSemasa = roundMoney(stokSemasa * kosSeunit);
		const statusStok = stokSemasa <= 0
			? "HABIS"
			: stokSemasa <= stokMinimum
				? "RENDAH"
				: "TERSEDIA";

		return {
			itemId: record.ITEM_ID,
			kategori: record.KATEGORI,
			namaItem: record.NAMA_ITEM,
			namaItemAsal: record.NAMA_ITEM_ASAL,
			unit: record.UNIT,
			kosSeunit,
			stokAwal,
			stokMinimum,
			status: record.STATUS,
			sumberTab: record.SUMBER_TAB,
			sumberBaris: Number(record.SUMBER_BARIS || 0),
			createdAt: record.CREATED_AT,
			updatedAt: record.UPDATED_AT,
			jumlahMasuk: movement.jumlahMasuk,
			jumlahKeluar: movement.jumlahKeluar,
			stokSemasa,
			nilaiStokSemasa,
			statusStok,
		};
	});
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

	const [sheetData, transactionsData] = await Promise.all([
		getSheetValues(
			env,
			env.MASTER_ITEM_SHEET,
			authorization.googleAccessToken,
		),
		getSheetValues(
			env,
			env.TRANSACTIONS_SHEET,
			authorization.googleAccessToken,
		),
	]);
	const items = mapInventoryItems(sheetData, transactionsData);

	return Response.json({
		success: true,
		sheet: env.MASTER_ITEM_SHEET,
		count: items.length,
		items,
	});
}

async function createItemRoute(
	request: Request,
	env: Env,
): Promise<Response> {
	const authorization = await authorizeRequest(request, env);
	if (!CREATE_ITEM_ROLES.has(authorization.user.role)) {
		throw new ApiError(
			403,
			"ROLE_NOT_ALLOWED",
			"Peranan pengguna tidak dibenarkan mendaftar item.",
		);
	}

	const key = idempotencyKey(request);
	const payload = validateCreateItem(await readJsonBody(request));
	const [itemsData, auditData] = await Promise.all([
		getSheetValues(env, env.MASTER_ITEM_SHEET, authorization.googleAccessToken),
		getSheetValues(env, env.AUDIT_LOG_SHEET, authorization.googleAccessToken),
	]);
	const itemRecords = rowsToRecords(itemsData);
	const auditRecords = rowsToRecords(auditData);
	const auditId = await stableId("AUD", `ITEM:${key}`);
	const existingAudit = auditRecords.find((record) =>
		record.AUDIT_ID === auditId &&
		record.ACTION === "CREATE" &&
		record.MODULE === "ITEM"
	);

	if (existingAudit) {
		const storedResult = parseCreatedItemAudit(existingAudit);
		if (!storedResult || !createItemPayloadMatches(storedResult, payload)) {
			throw new ApiError(
				409,
				"IDEMPOTENCY_CONFLICT",
				"Kunci idempotensi telah digunakan untuk permintaan lain.",
			);
		}

		const existingItem = itemRecords.find(
			(record) => record.ITEM_ID === storedResult.itemId,
		);
		if (existingItem) {
			if (!createdItemMatches(existingItem, storedResult)) {
				throw new ApiError(
					409,
					"IDEMPOTENCY_CONFLICT",
					"Rekod idempotensi bercanggah dengan item sedia ada.",
				);
			}
		} else {
			const duplicate = itemRecords.find((record) =>
				itemMatchesPayload(record, payload)
			);
			if (duplicate) {
				throw new ApiError(
					409,
					"ITEM_ALREADY_EXISTS",
					"Item yang sepadan telah wujud.",
					{ existingItem: existingItemSummary(duplicate) },
				);
			}
			await appendSheetRecord(
				env,
				env.MASTER_ITEM_SHEET,
				authorization.googleAccessToken,
				sheetHeaders(itemsData),
				itemRecord(storedResult),
			);
		}

		return Response.json({
			success: true,
			replayed: true,
			item: publicItemResult(storedResult),
		});
	}

	const duplicate = itemRecords.find((record) => itemMatchesPayload(record, payload));
	if (duplicate) {
		throw new ApiError(
			409,
			"ITEM_ALREADY_EXISTS",
			"Item yang sepadan telah wujud.",
			{ existingItem: existingItemSummary(duplicate) },
		);
	}

	const prefix = CATEGORY_PREFIXES.get(payload.kategori);
	if (!prefix) {
		throw new ApiError(400, "VALIDATION_ERROR", "Kategori tidak sah.");
	}
	const timestamp = malaysiaTimestamp();
	const result: CreatedItemResult = {
		...payload,
		itemId: nextItemId(itemRecords, prefix),
		stokAwal: 0,
		status: "AKTIF",
		createdAt: timestamp,
		updatedAt: timestamp,
	};
	const auditRecord: Record<string, string | number> = {
		AUDIT_ID: auditId,
		TIMESTAMP: timestamp,
		USER_EMAIL: authorization.user.email,
		USER_NAME: authorization.user.nama || authorization.user.email,
		ACTION: "CREATE",
		MODULE: "ITEM",
		RECORD_ID: result.itemId,
		BEFORE_JSON: "",
		AFTER_JSON: JSON.stringify(publicItemResult(result)),
		DEVICE_ID: "",
		IP_HASH: "",
		CATATAN: `Pendaftaran item baharu ${result.itemId}`,
	};

	// AUDIT_LOG menjadi reservasi idempotensi kekal sebelum item ditambah.
	// Jika append item gagal, retry membaca audit ini dan menambah item sahaja.
	// Susunan ini mengelakkan keadaan item berjaya tetapi audit tiada.
	await appendSheetRecord(
		env,
		env.AUDIT_LOG_SHEET,
		authorization.googleAccessToken,
		sheetHeaders(auditData),
		auditRecord,
	);
	await appendSheetRecord(
		env,
		env.MASTER_ITEM_SHEET,
		authorization.googleAccessToken,
		sheetHeaders(itemsData),
		itemRecord(result),
	);

	return Response.json(
		{
			success: true,
			replayed: false,
			item: publicItemResult(result),
		},
		{ status: 201 },
	);
}

async function incomingTransactionRoute(
	request: Request,
	env: Env,
): Promise<Response> {
	const authorization = await authorizeRequest(request, env);
	if (!WRITE_ROLES.has(authorization.user.role)) {
		throw new ApiError(
			403,
			"ROLE_NOT_ALLOWED",
			"Peranan pengguna tidak dibenarkan merekod Barang Masuk.",
		);
	}

	const key = idempotencyKey(request);
	const payload = validateIncomingTransaction(await readJsonBody(request));
	const [itemsData, transactionsData, auditData] = await Promise.all([
		getSheetValues(env, env.MASTER_ITEM_SHEET, authorization.googleAccessToken),
		getSheetValues(env, env.TRANSACTIONS_SHEET, authorization.googleAccessToken),
		getSheetValues(env, env.AUDIT_LOG_SHEET, authorization.googleAccessToken),
	]);
	const item = rowsToRecords(itemsData).find(
		(candidate) => String(candidate.ITEM_ID ?? "").trim() === payload.itemId,
	);
	if (!item) {
		throw new ApiError(404, "ITEM_NOT_FOUND", "Item tidak ditemui.");
	}
	if (String(item.STATUS ?? "").trim().toUpperCase() !== "AKTIF") {
		throw new ApiError(409, "ITEM_INACTIVE", "Item tidak aktif.");
	}

	const transactionId = await stableId("TXN", key);
	const auditId = await stableId("AUD", key);
	const jumlahNilai = Math.round(payload.kuantiti * payload.kosSeunit * 100) / 100;
	if (!Number.isFinite(jumlahNilai) || jumlahNilai > 1_000_000_000_000) {
		throw new ApiError(400, "VALIDATION_ERROR", "Jumlah nilai tidak sah.");
	}

	const existingTransaction = rowsToRecords(transactionsData).find(
		(record) => record.TRANSACTION_ID === transactionId,
	);
	const result: TransactionResult = {
		transactionId,
		timestamp: existingTransaction?.TIMESTAMP || malaysiaTimestamp(),
		itemId: payload.itemId,
		jenis: "MASUK",
		kuantiti: payload.kuantiti,
		kosSeunit: payload.kosSeunit,
		jumlahNilai,
		pihakTerlibat: payload.pihakTerlibat,
		bahagian: payload.bahagian,
		tujuan: payload.tujuan,
		catatan: payload.catatan,
		createdByName: authorization.user.nama || authorization.user.email,
		createdByEmail: authorization.user.email,
		status: "SAH",
	};

	if (existingTransaction && !matchesExistingTransaction(existingTransaction, result)) {
		throw new ApiError(
			409,
			"IDEMPOTENCY_CONFLICT",
			"Kunci idempotensi telah digunakan untuk permintaan lain.",
		);
	}

	const auditRecords = rowsToRecords(auditData);
	const existingAudit = auditRecords.find((record) => record.AUDIT_ID === auditId);
	const auditRecord: Record<string, string | number> = {
		AUDIT_ID: auditId,
		TIMESTAMP: result.timestamp,
		USER_EMAIL: authorization.user.email,
		USER_NAME: authorization.user.nama || authorization.user.email,
		ACTION: "CREATE",
		MODULE: "TRANSACTION",
		RECORD_ID: transactionId,
		BEFORE_JSON: "",
		AFTER_JSON: JSON.stringify(transactionRecord(result)),
		CATATAN: `Rekod Barang Masuk ${transactionId}`,
	};

	if (!existingTransaction) {
		await appendSheetRecord(
			env,
			env.TRANSACTIONS_SHEET,
			authorization.googleAccessToken,
			sheetHeaders(transactionsData),
			transactionRecord(result),
		);
	}

	if (!existingAudit) {
		await appendSheetRecord(
			env,
			env.AUDIT_LOG_SHEET,
			authorization.googleAccessToken,
			sheetHeaders(auditData),
			auditRecord,
		);
	}

	return Response.json(
		{
			success: true,
			replayed: Boolean(existingTransaction),
			transaction: result,
		},
		{ status: existingTransaction ? 200 : 201 },
	);
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

		if (
			request.method === "POST" &&
			url.pathname === "/api/items"
		) {
			try {
				return addCorsHeaders(
					await createItemRoute(request, env),
					origin,
				);
			} catch (error) {
				const apiError = error instanceof ApiError
					? error
					: new ApiError(
						500,
						"WRITE_FAILED",
						"Item tidak dapat disimpan.",
					);
				const safeError = apiError.status >= 500 &&
						!["AUTH_CONFIG_ERROR", "AUTH_SERVICE_ERROR"].includes(apiError.code)
					? new ApiError(500, "WRITE_FAILED", "Item tidak dapat disimpan.")
					: apiError;

				if (safeError.status >= 500) {
					console.error(JSON.stringify({
						message: "create item route failed",
						code: safeError.code,
						path: url.pathname,
						status: safeError.status,
					}));
				}
				return addCorsHeaders(errorResponse(safeError), origin);
			}
		}

		if (
			request.method === "POST" &&
			url.pathname === "/api/transactions/in"
		) {
			try {
				return addCorsHeaders(
					await incomingTransactionRoute(request, env),
					origin,
				);
			} catch (error) {
				const apiError = error instanceof ApiError
					? error
					: new ApiError(
						500,
						"WRITE_FAILED",
						"Transaksi tidak dapat disimpan.",
					);
				const safeError = apiError.status >= 500 &&
						!["AUTH_CONFIG_ERROR", "AUTH_SERVICE_ERROR"].includes(apiError.code)
					? new ApiError(500, "WRITE_FAILED", "Transaksi tidak dapat disimpan.")
					: apiError;

				if (safeError.status >= 500) {
					console.error(JSON.stringify({
						message: "incoming transaction route failed",
						code: safeError.code,
						path: url.pathname,
						status: safeError.status,
					}));
				}
				return addCorsHeaders(errorResponse(safeError), origin);
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
