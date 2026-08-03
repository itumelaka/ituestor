import {
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import {
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const TEST_SERVICE_ACCOUNT_EMAIL = "worker-test@example.invalid";
const TEST_PRIVATE_KEY_ID = "test-key-id";
const TEST_GOOGLE_ACCESS_TOKEN = "test-google-access-token";
const TEST_SUPABASE_ACCESS_TOKEN = "test-supabase-access-token";
const TEST_SUPABASE_URL = "https://test-project.supabase.co";
const TEST_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_only";
const TEST_USER_EMAIL = "itumelaka@gmail.com";
const PRODUCTION_ORIGIN = "https://itumelaka.github.io";
const LOCAL_ORIGIN = "http://localhost:5173";
const DISALLOWED_ORIGIN = "https://example.com";

let testPrivateKey: string;

async function createTestPrivateKey(): Promise<string> {
	const keyPair = (await crypto.subtle.generateKey(
		{
			name: "RSASSA-PKCS1-v1_5",
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["sign", "verify"],
	)) as CryptoKeyPair;

	const privateKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
	const bytes = new Uint8Array(privateKey);
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	const base64 = btoa(binary);
	const lines = base64.match(/.{1,64}/g) ?? [];

	return [
		"-----BEGIN PRIVATE KEY-----",
		...lines,
		"-----END PRIVATE KEY-----",
	].join("\n");
}

function createTestEnv() {
	return {
		APP_ENV: "production",
		SPREADSHEET_ID: "test-spreadsheet-id",
		MASTER_ITEM_SHEET: "MASTER_ITEM",
		USERS_SHEET: "USERS",
		TRANSACTIONS_SHEET: "TRANSACTIONS",
		AUDIT_LOG_SHEET: "AUDIT_LOG",
		SUPABASE_URL: TEST_SUPABASE_URL,
		SUPABASE_PUBLISHABLE_KEY: TEST_SUPABASE_PUBLISHABLE_KEY,
		GOOGLE_SERVICE_ACCOUNT_EMAIL: TEST_SERVICE_ACCOUNT_EMAIL,
		GOOGLE_PRIVATE_KEY_ID: TEST_PRIVATE_KEY_ID,
		GOOGLE_PRIVATE_KEY: testPrivateKey,
	};
}

type TestUserRecord = {
	userId?: string;
	nama?: string;
	email?: string;
	role?: string;
	status?: string;
};

type AuthenticatedFetchOptions = {
	verifiedEmail?: string;
	user?: TestUserRecord | null;
	inventoryRows?: string[][];
	googleAuthFailure?: boolean;
	transactionRows?: string[][];
	auditRows?: string[][];
	failTransactionAppend?: boolean;
	failAuditAppend?: boolean;
	failAuditAppendOnce?: boolean;
	failItemAppend?: boolean;
	failItemAppendOnce?: boolean;
	itemHeaders?: string[];
};

const USERS_HEADERS = [
	"USER_ID",
	"NAMA",
	"EMAIL",
	"ROLE",
	"STATUS",
	"CREATED_AT",
	"UPDATED_AT",
];

const ITEM_HEADERS = [
	"ITEM_ID",
	"KATEGORI",
	"NAMA_ITEM",
	"NAMA_ITEM_ASAL",
	"UNIT",
	"KOS_SEUNIT",
	"STOK_AWAL",
	"STOK_MINIMUM",
	"STATUS",
	"SUMBER_TAB",
	"SUMBER_BARIS",
	"CREATED_AT",
	"UPDATED_AT",
];
const TRANSACTION_HEADERS = [
	"TRANSACTION_ID", "TIMESTAMP", "ITEM_ID", "JENIS", "KUANTITI",
	"KOS_SEUNIT", "JUMLAH_NILAI", "PIHAK_TERLIBAT", "BAHAGIAN", "TUJUAN",
	"CATATAN", "CREATED_BY_EMAIL", "CREATED_BY_NAME", "STATUS",
];
const AUDIT_HEADERS = [
	"AUDIT_ID", "TIMESTAMP", "USER_EMAIL", "USER_NAME", "ACTION", "MODULE",
	"RECORD_ID", "BEFORE_JSON", "AFTER_JSON", "DEVICE_ID", "IP_HASH", "CATATAN",
];
const VALID_IDEMPOTENCY_KEY = "123e4567-e89b-42d3-a456-426614174000";

function bearerHeaders(token = TEST_SUPABASE_ACCESS_TOKEN): HeadersInit {
	return { Authorization: `Bearer ${token}` };
}

function activeUser(overrides: TestUserRecord = {}): TestUserRecord {
	return {
		userId: "USR-0001",
		nama: "ITU Melaka",
		email: TEST_USER_EMAIL,
		role: "SUPER_ADMIN",
		status: "AKTIF",
		...overrides,
	};
}

function userSheetValues(user: TestUserRecord | null): string[][] {
	if (!user) return [USERS_HEADERS];

	return [
		USERS_HEADERS,
		[
			user.userId ?? "",
			user.nama ?? "",
			user.email ?? "",
			user.role ?? "",
			user.status ?? "",
			"2026-07-29T09:00:00+08:00",
			"2026-07-29T09:00:00+08:00",
		],
	];
}

function inventoryRows(count = 130): string[][] {
	return Array.from({ length: count }, (_, index) => {
		const itemNumber = index + 1;
		return [
			`AT-${String(itemNumber).padStart(4, "0")}`,
			"ALAT TULIS",
			index === 0 ? "Kertas A4 80gsm" : `Item Ujian ${itemNumber}`,
			index === 0 ? "KERTAS A4 80GSM" : `ITEM UJIAN ${itemNumber}`,
			"RIM",
			index === 0 ? "RM 1,234.50" : "1.00",
			index === 0 ? "12" : "1",
			index === 0 ? "2" : "0",
			"AKTIF",
			"ALAT TULIS",
			String(itemNumber + 1),
			"2026-07-29T09:00:00+08:00",
			"2026-07-29T09:00:00+08:00",
		];
	});
}

function mockAuthenticatedFetch(options: AuthenticatedFetchOptions = {}) {
	const verifiedEmail = options.verifiedEmail ?? TEST_USER_EMAIL;
	const user = options.user === undefined ? activeUser() : options.user;
	const itemHeaders = options.itemHeaders ?? ITEM_HEADERS;
	const sourceRows = options.inventoryRows ?? inventoryRows();
	const rows = options.itemHeaders
		? sourceRows.map((row) => itemHeaders.map(
			(header) => row[ITEM_HEADERS.indexOf(header)] ?? "",
		))
		: sourceRows;
	const transactions = options.transactionRows ?? [];
	const audits = options.auditRows ?? [];
	let auditAppendFailuresRemaining = options.failAuditAppendOnce ? 1 : 0;
	let itemAppendFailuresRemaining = options.failItemAppendOnce ? 1 : 0;

	return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: input.url;

		if (url === `${TEST_SUPABASE_URL}/auth/v1/user`) {
			const headers = new Headers(init?.headers);
			expect(headers.get("apikey")).toBe(TEST_SUPABASE_PUBLISHABLE_KEY);
			expect(headers.get("Authorization")).toBe(
				`Bearer ${TEST_SUPABASE_ACCESS_TOKEN}`,
			);
			return Response.json({
				id: "supabase-user-id",
				email: verifiedEmail,
				email_confirmed_at: "2026-07-29T08:00:00.000Z",
			});
		}

		if (url === "https://oauth2.googleapis.com/token") {
			if (options.googleAuthFailure) {
				return Response.json({ error: "invalid_grant" }, { status: 401 });
			}
			return Response.json({
				access_token: TEST_GOOGLE_ACCESS_TOKEN,
				token_type: "Bearer",
				expires_in: 3600,
			});
		}

		if (url.startsWith("https://sheets.googleapis.com/v4/spreadsheets/")) {
			const headers = new Headers(init?.headers);
			expect(headers.get("Authorization")).toBe(
				`Bearer ${TEST_GOOGLE_ACCESS_TOKEN}`,
			);
			const decodedUrl = decodeURIComponent(url);

			if (decodedUrl.includes("/values/USERS!A:Z")) {
				return Response.json({
					range: "USERS!A1:G2",
					majorDimension: "ROWS",
					values: userSheetValues(user),
				});
			}

			if (decodedUrl.includes("/values/MASTER_ITEM!A:Z:append")) {
				if (options.failItemAppend || itemAppendFailuresRemaining > 0) {
					itemAppendFailuresRemaining -= 1;
					return Response.json({ error: "write failed" }, { status: 500 });
				}
				const body = JSON.parse(String(init?.body)) as { values: string[][] };
				rows.push(body.values[0] ?? []);
				return Response.json({ updates: { updatedRows: 1 } });
			}

			if (decodedUrl.includes("/values/MASTER_ITEM!A:Z")) {
				return Response.json({
					range: `MASTER_ITEM!A1:M${rows.length + 1}`,
					majorDimension: "ROWS",
					values: [itemHeaders, ...rows],
				});
			}

			if (decodedUrl.includes("/values/TRANSACTIONS!A:Z:append")) {
				if (options.failTransactionAppend) {
					return Response.json({ error: "write failed" }, { status: 500 });
				}
				const body = JSON.parse(String(init?.body)) as { values: string[][] };
				transactions.push(body.values[0] ?? []);
				return Response.json({ updates: { updatedRows: 1 } });
			}

			if (decodedUrl.includes("/values/AUDIT_LOG!A:Z:append")) {
				if (options.failAuditAppend || auditAppendFailuresRemaining > 0) {
					auditAppendFailuresRemaining -= 1;
					return Response.json({ error: "write failed" }, { status: 500 });
				}
				const body = JSON.parse(String(init?.body)) as { values: string[][] };
				audits.push(body.values[0] ?? []);
				return Response.json({ updates: { updatedRows: 1 } });
			}

			if (decodedUrl.includes("/values/TRANSACTIONS!A:Z")) {
				return Response.json({
					range: `TRANSACTIONS!A1:N${transactions.length + 1}`,
					majorDimension: "ROWS",
					values: [TRANSACTION_HEADERS, ...transactions],
				});
			}

			if (decodedUrl.includes("/values/AUDIT_LOG!A:Z")) {
				return Response.json({
					range: `AUDIT_LOG!A1:J${audits.length + 1}`,
					majorDimension: "ROWS",
					values: [AUDIT_HEADERS, ...audits],
				});
			}
		}

		throw new Error(`Permintaan luar tidak dijangka: ${url}`);
	});
}

async function dispatch(
	path: string,
	method = "GET",
	headers?: HeadersInit,
	body?: string,
): Promise<Response> {
	const request = new IncomingRequest(`https://ituestor.test${path}`, {
		method,
		headers,
		body,
	});
	const context = createExecutionContext();
	const response = await worker.fetch(request, createTestEnv(), context);

	await waitOnExecutionContext(context);
	return response;
}

function incomingHeaders(
	key = VALID_IDEMPOTENCY_KEY,
	token = TEST_SUPABASE_ACCESS_TOKEN,
): HeadersInit {
	return {
		...bearerHeaders(token),
		"Content-Type": "application/json",
		"Idempotency-Key": key,
	};
}

function incomingBody(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		itemId: "AT-0001",
		kuantiti: 5,
		kosSeunit: 12.5,
		pihakTerlibat: "Pembekal Ujian",
		bahagian: "Stor",
		tujuan: "Bekalan operasi",
		catatan: "Dokumen DO-001",
		...overrides,
	});
}

function createItemBody(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		kategori: "BAHAN KIMIA",
		namaItem: "Pencuci Makmal",
		unit: "BOTOL",
		kosSeunit: 12.5,
		stokMinimum: 3,
		...overrides,
	});
}

beforeAll(async () => {
	testPrivateKey = await createTestPrivateKey();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("ITU eSTOR Worker", () => {
	it("returns a safe production health response", async () => {
		const response = await dispatch("/health");
		const body = await response.json<{
			service: string;
			status: string;
			environment: string;
			timestamp: string;
		}>();
		const serializedBody = JSON.stringify(body);

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			service: "ITU eSTOR API",
			status: "running",
			environment: "production",
		});
		expect(body.timestamp).toBeTypeOf("string");
		expect(serializedBody).not.toContain("credentials");
		expect(serializedBody).not.toContain("PRIVATE KEY");
		expect(serializedBody).not.toContain(TEST_PRIVATE_KEY_ID);
		expect(serializedBody).not.toContain(TEST_SERVICE_ACCOUNT_EMAIL);
	});

	it("returns structured NOT_FOUND for the root route", async () => {
		const response = await dispatch("/");
		const body = await response.json<{
			error: string;
			message: string;
		}>();

		expect(response.status).toBe(404);
		expect(body).toEqual({
			error: "NOT_FOUND",
			message: "Endpoint tidak ditemui.",
		});
	});

	it("returns structured NOT_FOUND for an unknown route", async () => {
		const response = await dispatch("/api/tidak-wujud");
		const body = await response.json<{
			error: string;
			message: string;
		}>();

		expect(response.status).toBe(404);
		expect(body).toEqual({
			error: "NOT_FOUND",
			message: "Endpoint tidak ditemui.",
		});
	});

	it("requires authentication for GET /api/me", async () => {
		const response = await dispatch("/api/me");
		const body = await response.json<{
			success: boolean;
			error: string;
			message: string;
		}>();

		expect(response.status).toBe(401);
		expect(body).toEqual({
			success: false,
			error: "AUTH_REQUIRED",
			message: "Log masuk diperlukan.",
		});
	});

	it("requires authentication for GET /api/items", async () => {
		const response = await dispatch("/api/items");
		const body = await response.json<{
			success: boolean;
			error: string;
			message: string;
		}>();

		expect(response.status).toBe(401);
		expect(body).toEqual({
			success: false,
			error: "AUTH_REQUIRED",
			message: "Log masuk diperlukan.",
		});
	});

	it("rejects an invalid Supabase bearer token", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ message: "Invalid JWT" }, { status: 401 }),
		);

		const response = await dispatch(
			"/api/me",
			"GET",
			bearerHeaders("invalid-test-token"),
		);
		const body = await response.json<{
			success: boolean;
			error: string;
			message: string;
		}>();

		expect(response.status).toBe(401);
		expect(body.error).toBe("INVALID_TOKEN");
		expect(body.message).toBe("Sesi tidak sah atau telah tamat.");
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const supabaseCall = fetchMock.mock.calls[0];
		const headers = new Headers(supabaseCall?.[1]?.headers);
		expect(headers.get("Authorization")).toBe("Bearer invalid-test-token");
	});

	it("allows an authorized active user to access GET /api/me", async () => {
		const fetchMock = mockAuthenticatedFetch();

		const response = await dispatch("/api/me", "GET", bearerHeaders());
		const body = await response.json<{
			success: boolean;
			user: Record<string, string>;
		}>();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			success: true,
			user: {
				userId: "USR-0001",
				nama: "ITU Melaka",
				email: TEST_USER_EMAIL,
				role: "SUPER_ADMIN",
				status: "AKTIF",
			},
		});
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("allows an authorized active user to access 130 inventory items", async () => {
		const fetchMock = mockAuthenticatedFetch();

		const response = await dispatch("/api/items", "GET", bearerHeaders());
		const body = await response.json<{
			success: boolean;
			sheet: string;
			count: number;
			items: Array<Record<string, unknown>>;
		}>();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.sheet).toBe("MASTER_ITEM");
		expect(body.count).toBe(130);
		expect(body.items).toHaveLength(130);
		expect(body.items[0]).toEqual({
			itemId: "AT-0001",
			kategori: "ALAT TULIS",
			namaItem: "Kertas A4 80gsm",
			namaItemAsal: "KERTAS A4 80GSM",
			unit: "RIM",
			kosSeunit: 1234.5,
			stokAwal: 12,
			stokMinimum: 2,
			status: "AKTIF",
			sumberTab: "ALAT TULIS",
			sumberBaris: 2,
			createdAt: "2026-07-29T09:00:00+08:00",
			updatedAt: "2026-07-29T09:00:00+08:00",
		});
		expect(typeof body.items[0]?.kosSeunit).toBe("number");
		expect(typeof body.items[0]?.stokAwal).toBe("number");
		expect(typeof body.items[0]?.stokMinimum).toBe("number");
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	it("rejects an inactive registered user", async () => {
		mockAuthenticatedFetch({
			user: activeUser({ status: "TIDAK_AKTIF" }),
		});

		const response = await dispatch("/api/me", "GET", bearerHeaders());
		const body = await response.json<{ error: string }>();

		expect(response.status).toBe(403);
		expect(body.error).toBe("USER_INACTIVE");
	});

	it("rejects an unregistered user", async () => {
		mockAuthenticatedFetch({ user: null });

		const response = await dispatch("/api/me", "GET", bearerHeaders());
		const body = await response.json<{ error: string }>();

		expect(response.status).toBe(403);
		expect(body.error).toBe("USER_NOT_REGISTERED");
	});

	it("rejects a registered user with an invalid role", async () => {
		mockAuthenticatedFetch({
			user: activeUser({ role: "ROLE_UJIAN_TIDAK_SAH" }),
		});

		const response = await dispatch("/api/me", "GET", bearerHeaders());
		const body = await response.json<{ error: string }>();

		expect(response.status).toBe(403);
		expect(body.error).toBe("ROLE_NOT_ALLOWED");
	});

	it("returns a safe structured error when Google OAuth fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const fetchMock = mockAuthenticatedFetch({ googleAuthFailure: true });

		const response = await dispatch("/api/items", "GET", bearerHeaders());
		const body = await response.json<{
			success: boolean;
			error: string;
			message: string;
		}>();
		const serializedBody = JSON.stringify(body);

		expect(response.status).toBe(500);
		expect(body).toEqual({
			success: false,
			error: "GOOGLE_AUTH_ERROR",
			message: "Perkhidmatan data tidak dapat disahkan.",
		});
		expect(serializedBody).not.toContain(TEST_PRIVATE_KEY_ID);
		expect(serializedBody).not.toContain(TEST_SERVICE_ACCOUNT_EMAIL);
		expect(serializedBody).not.toContain(testPrivateKey);
		expect(serializedBody).not.toContain(TEST_SUPABASE_ACCESS_TOKEN);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("returns structured NOT_FOUND for an unsupported HTTP method", async () => {
		const response = await dispatch("/api/items", "PATCH");
		const body = await response.json<{
			error: string;
			message: string;
		}>();

		expect(response.status).toBe(404);
		expect(body).toEqual({
			error: "NOT_FOUND",
			message: "Endpoint tidak ditemui.",
		});
	});

	it("requires authentication for POST /api/items", async () => {
		const response = await dispatch(
			"/api/items",
			"POST",
			{
				"Content-Type": "application/json",
				"Idempotency-Key": VALID_IDEMPOTENCY_KEY,
			},
			createItemBody(),
		);
		expect(response.status).toBe(401);
		expect((await response.json<{ error: string }>()).error).toBe("AUTH_REQUIRED");
	});

	it("allows item creation only for SUPER_ADMIN and ADMIN_STOR", async () => {
		for (const role of ["SUPER_ADMIN", "ADMIN_STOR"]) {
			mockAuthenticatedFetch({ user: activeUser({ role }) });
			const response = await dispatch(
				"/api/items",
				"POST",
				incomingHeaders(crypto.randomUUID()),
				createItemBody({ namaItem: `Item ${role}` }),
			);
			expect(response.status).toBe(201);
			vi.restoreAllMocks();
		}

		for (const role of ["PEMBANTU_STOR", "VIEWER"]) {
			mockAuthenticatedFetch({ user: activeUser({ role }) });
			const response = await dispatch(
				"/api/items",
				"POST",
				incomingHeaders(crypto.randomUUID()),
				createItemBody(),
			);
			expect(response.status).toBe(403);
			expect((await response.json<{ error: string }>()).error).toBe("ROLE_NOT_ALLOWED");
			vi.restoreAllMocks();
		}
	});

	it("creates a protected item row and audit using dynamic headers", async () => {
		const shuffledHeaders = [
			"STATUS", "ITEM_ID", "NAMA_ITEM", "KATEGORI", "UNIT", "KOS_SEUNIT",
			"STOK_MINIMUM", "STOK_AWAL", "NAMA_ITEM_ASAL", "CREATED_AT",
			"SUMBER_TAB", "UPDATED_AT", "SUMBER_BARIS",
		];
		const audits: string[][] = [];
		const fetchMock = mockAuthenticatedFetch({
			auditRows: audits,
			itemHeaders: shuffledHeaders,
		});
		const response = await dispatch(
			"/api/items",
			"POST",
			incomingHeaders(),
			createItemBody({
				itemId: "ATTACKER-9999",
				status: "DIARKIBKAN",
				stokAwal: 999,
				sumberTab: "ALAT TULIS",
				sumberBaris: 88,
				createdAt: "1900-01-01",
				updatedAt: "1900-01-01",
				userEmail: "attacker@example.invalid",
			}),
		);
		const body = await response.json<{
			success: boolean;
			replayed: boolean;
			item: Record<string, unknown>;
		}>();

		expect(response.status).toBe(201);
		expect(body.success).toBe(true);
		expect(body.replayed).toBe(false);
		expect(body.item).toMatchObject({
			itemId: "BK-0001",
			kategori: "BAHAN KIMIA",
			namaItem: "Pencuci Makmal",
			unit: "BOTOL",
			kosSeunit: 12.5,
			stokAwal: 0,
			stokMinimum: 3,
			status: "AKTIF",
		});
		expect(String(body.item.createdAt)).toMatch(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/,
		);
		expect(body.item.updatedAt).toBe(body.item.createdAt);

		const itemAppend = fetchMock.mock.calls.find(([input]) =>
			decodeURIComponent(String(input)).includes("MASTER_ITEM!A:Z:append")
		);
		const itemValues = (JSON.parse(String(itemAppend?.[1]?.body)) as {
			values: Array<Array<string | number>>;
		}).values[0] ?? [];
		const storedItem = Object.fromEntries(
			shuffledHeaders.map((header, index) => [header, itemValues[index]]),
		);
		expect(storedItem).toMatchObject({
			ITEM_ID: "BK-0001",
			KATEGORI: "BAHAN KIMIA",
			NAMA_ITEM: "Pencuci Makmal",
			NAMA_ITEM_ASAL: "Pencuci Makmal",
			UNIT: "BOTOL",
			KOS_SEUNIT: 12.5,
			STOK_AWAL: 0,
			STOK_MINIMUM: 3,
			STATUS: "AKTIF",
			SUMBER_TAB: "NEW_ITEM",
			SUMBER_BARIS: 0,
		});
		expect(storedItem.CREATED_AT).toBe(body.item.createdAt);
		expect(storedItem.UPDATED_AT).toBe(body.item.updatedAt);

		expect(audits).toHaveLength(1);
		const storedAudit = Object.fromEntries(
			AUDIT_HEADERS.map((header, index) => [header, audits[0]?.[index]]),
		);
		expect(storedAudit).toMatchObject({
			USER_EMAIL: TEST_USER_EMAIL,
			USER_NAME: "ITU Melaka",
			ACTION: "CREATE",
			MODULE: "ITEM",
			RECORD_ID: "BK-0001",
		});
		const after = JSON.parse(String(storedAudit.AFTER_JSON));
		expect(after).toMatchObject({
			itemId: "BK-0001",
			stokAwal: 0,
			status: "AKTIF",
		});
		expect(String(storedAudit.AFTER_JSON)).not.toContain(TEST_SUPABASE_ACCESS_TOKEN);
	});

	it.each([
		["ALAT TULIS", "AT-0131"],
		["BAHAN KIMIA", "BK-0001"],
		["HOUSE HOLD", "HH-0001"],
		["LAIN-LAIN", "LL-0001"],
	])("maps category %s to generated prefix", async (kategori, expectedId) => {
		mockAuthenticatedFetch();
		const response = await dispatch(
			"/api/items",
			"POST",
			incomingHeaders(),
			createItemBody({ kategori, namaItem: `Item ${kategori}` }),
		);
		expect(response.status).toBe(201);
		expect((await response.json<{ item: { itemId: string } }>()).item.itemId).toBe(expectedId);
	});

	it("chooses the next safe numeric sequence rather than row count", async () => {
		const rows = inventoryRows(2);
		rows.push([
			"BK-0016", "BAHAN KIMIA", "Item Lama", "ITEM LAMA", "BOTOL",
			"1", "0", "0", "AKTIF", "BAHAN KIMIA", "20",
			"2026-07-29T09:00:00+08:00", "2026-07-29T09:00:00+08:00",
		]);
		rows.push([
			"BK-0099", "BAHAN KIMIA", "Item Terkini", "ITEM TERKINI", "BOTOL",
			"1", "0", "0", "AKTIF", "BAHAN KIMIA", "21",
			"2026-07-29T09:00:00+08:00", "2026-07-29T09:00:00+08:00",
		]);
		rows.push([
			"BK-TIDAK-SAH", "BAHAN KIMIA", "Item Aneh", "ITEM ANEH", "BOTOL",
			"1", "0", "0", "AKTIF", "BAHAN KIMIA", "22",
			"2026-07-29T09:00:00+08:00", "2026-07-29T09:00:00+08:00",
		]);
		mockAuthenticatedFetch({ inventoryRows: rows });
		const response = await dispatch(
			"/api/items", "POST", incomingHeaders(), createItemBody(),
		);
		expect(response.status).toBe(201);
		expect((await response.json<{ item: { itemId: string } }>()).item.itemId)
			.toBe("BK-0100");
	});

	it.each([
		["invalid JSON", "{", "INVALID_JSON"],
		["invalid category", createItemBody({ kategori: "MAKANAN" }), "VALIDATION_ERROR"],
		["blank name", createItemBody({ namaItem: "   " }), "VALIDATION_ERROR"],
		["excessive name", createItemBody({ namaItem: "A".repeat(161) }), "VALIDATION_ERROR"],
		["blank unit", createItemBody({ unit: "  " }), "VALIDATION_ERROR"],
		["excessive unit", createItemBody({ unit: "U".repeat(41) }), "VALIDATION_ERROR"],
		["negative cost", createItemBody({ kosSeunit: -1 }), "VALIDATION_ERROR"],
		["mixed-format cost", createItemBody({ kosSeunit: "RM 12.50" }), "VALIDATION_ERROR"],
		["excess cost decimals", createItemBody({ kosSeunit: 1.234 }), "VALIDATION_ERROR"],
		["negative minimum", createItemBody({ stokMinimum: -1 }), "VALIDATION_ERROR"],
		["mixed-format minimum", createItemBody({ stokMinimum: "1 unit" }), "VALIDATION_ERROR"],
	])("rejects create-item %s", async (_label, requestBody, expectedError) => {
		mockAuthenticatedFetch();
		const response = await dispatch(
			"/api/items", "POST", incomingHeaders(), requestBody,
		);
		expect(response.status).toBe(400);
		expect((await response.json<{ error: string }>()).error).toBe(expectedError);
	});

	it("requires a valid create-item Idempotency-Key", async () => {
		mockAuthenticatedFetch();
		const missing = await dispatch(
			"/api/items",
			"POST",
			{ ...bearerHeaders(), "Content-Type": "application/json" },
			createItemBody(),
		);
		expect(missing.status).toBe(400);
		expect((await missing.json<{ error: string }>()).error)
			.toBe("INVALID_IDEMPOTENCY_KEY");
		vi.restoreAllMocks();

		mockAuthenticatedFetch();
		const malformed = await dispatch(
			"/api/items", "POST", incomingHeaders("not-a-uuid"), createItemBody(),
		);
		expect(malformed.status).toBe(400);
		expect((await malformed.json<{ error: string }>()).error)
			.toBe("INVALID_IDEMPOTENCY_KEY");
	});

	it("rejects a normalized duplicate and returns its safe summary", async () => {
		const rows = inventoryRows();
		mockAuthenticatedFetch({ inventoryRows: rows });
		const response = await dispatch(
			"/api/items",
			"POST",
			incomingHeaders(),
			createItemBody({
				kategori: "  alat   tulis ",
				namaItem: "  KERTAS   a4 80GSM ",
				unit: " rim ",
			}),
		);
		const body = await response.json<{
			error: string;
			existingItem: Record<string, unknown>;
		}>();
		expect(response.status).toBe(409);
		expect(body.error).toBe("ITEM_ALREADY_EXISTS");
		expect(body.existingItem).toMatchObject({
			itemId: "AT-0001",
			kategori: "ALAT TULIS",
			unit: "RIM",
		});
		expect(rows).toHaveLength(130);
	});

	it("allows the same normalized name in a materially different unit", async () => {
		mockAuthenticatedFetch();
		const response = await dispatch(
			"/api/items",
			"POST",
			incomingHeaders(),
			createItemBody({
				kategori: "ALAT TULIS",
				namaItem: "Kertas A4 80gsm",
				unit: "KOTAK",
			}),
		);
		expect(response.status).toBe(201);
		expect((await response.json<{ item: { itemId: string } }>()).item.itemId)
			.toBe("AT-0131");
	});

	it("replays create-item idempotently without duplicate item or audit", async () => {
		const rows = inventoryRows();
		const audits: string[][] = [];
		mockAuthenticatedFetch({ inventoryRows: rows, auditRows: audits });
		const first = await dispatch(
			"/api/items", "POST", incomingHeaders(), createItemBody(),
		);
		const second = await dispatch(
			"/api/items", "POST", incomingHeaders(), createItemBody(),
		);
		expect(first.status).toBe(201);
		expect(second.status).toBe(200);
		expect((await second.json<{ replayed: boolean }>()).replayed).toBe(true);
		expect(rows).toHaveLength(131);
		expect(audits).toHaveLength(1);
	});

	it("rejects create-item idempotency key reuse with different payload", async () => {
		const rows = inventoryRows();
		const audits: string[][] = [];
		mockAuthenticatedFetch({ inventoryRows: rows, auditRows: audits });
		await dispatch("/api/items", "POST", incomingHeaders(), createItemBody());
		const conflict = await dispatch(
			"/api/items",
			"POST",
			incomingHeaders(),
			createItemBody({ kosSeunit: 13 }),
		);
		expect(conflict.status).toBe(409);
		expect((await conflict.json<{ error: string }>()).error)
			.toBe("IDEMPOTENCY_CONFLICT");
		expect(rows).toHaveLength(131);
		expect(audits).toHaveLength(1);
	});

	it("recovers an item append failure from the audit reservation", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const rows = inventoryRows();
		const audits: string[][] = [];
		mockAuthenticatedFetch({
			inventoryRows: rows,
			auditRows: audits,
			failItemAppendOnce: true,
		});
		const first = await dispatch(
			"/api/items", "POST", incomingHeaders(), createItemBody(),
		);
		expect(first.status).toBe(500);
		expect((await first.json<{ error: string }>()).error).toBe("WRITE_FAILED");
		expect(rows).toHaveLength(130);
		expect(audits).toHaveLength(1);

		const retry = await dispatch(
			"/api/items", "POST", incomingHeaders(), createItemBody(),
		);
		expect(retry.status).toBe(200);
		expect((await retry.json<{ replayed: boolean }>()).replayed).toBe(true);
		expect(rows).toHaveLength(131);
		expect(audits).toHaveLength(1);
	});

	it("retries an audit failure without creating a duplicate item", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const rows = inventoryRows();
		const audits: string[][] = [];
		mockAuthenticatedFetch({
			inventoryRows: rows,
			auditRows: audits,
			failAuditAppendOnce: true,
		});
		const first = await dispatch(
			"/api/items", "POST", incomingHeaders(), createItemBody(),
		);
		expect(first.status).toBe(500);
		expect(rows).toHaveLength(130);
		expect(audits).toHaveLength(0);

		const retry = await dispatch(
			"/api/items", "POST", incomingHeaders(), createItemBody(),
		);
		expect(retry.status).toBe(201);
		expect(rows).toHaveLength(131);
		expect(audits).toHaveLength(1);
	});

	it("requires authentication for POST /api/transactions/in", async () => {
		const response = await dispatch(
			"/api/transactions/in",
			"POST",
			{ "Content-Type": "application/json", "Idempotency-Key": VALID_IDEMPOTENCY_KEY },
			incomingBody(),
		);
		const body = await response.json<{ error: string }>();

		expect(response.status).toBe(401);
		expect(body.error).toBe("AUTH_REQUIRED");
	});

	it("allows every write role and rejects VIEWER", async () => {
		for (const role of ["SUPER_ADMIN", "ADMIN_STOR", "PEMBANTU_STOR"]) {
			mockAuthenticatedFetch({ user: activeUser({ role }) });
			const response = await dispatch(
				"/api/transactions/in",
				"POST",
				incomingHeaders(crypto.randomUUID()),
				incomingBody(),
			);
			expect(response.status).toBe(201);
			vi.restoreAllMocks();
		}

		mockAuthenticatedFetch({ user: activeUser({ role: "VIEWER" }) });
		const viewerResponse = await dispatch(
			"/api/transactions/in",
			"POST",
			incomingHeaders(),
			incomingBody(),
		);
		expect(viewerResponse.status).toBe(403);
		expect((await viewerResponse.json<{ error: string }>()).error).toBe("ROLE_NOT_ALLOWED");
	});

	it("creates a validated MASUK transaction and matching audit record", async () => {
		const transactions: string[][] = [];
		const audits: string[][] = [];
		const fetchMock = mockAuthenticatedFetch({ transactionRows: transactions, auditRows: audits });

		const response = await dispatch(
			"/api/transactions/in",
			"POST",
			incomingHeaders(),
			incomingBody({
				createdBy: "Penyamar",
				createdByName: "Penyamar",
				createdByEmail: "attacker@example.invalid",
				status: "BATAL",
				jenis: "KELUAR",
				jumlahNilai: 999999,
			}),
		);
		const body = await response.json<{
			success: boolean;
			replayed: boolean;
			transaction: Record<string, unknown>;
		}>();

		expect(response.status).toBe(201);
		expect(body.success).toBe(true);
		expect(body.replayed).toBe(false);
		expect(body.transaction).toMatchObject({
			itemId: "AT-0001",
			jenis: "MASUK",
			kuantiti: 5,
			kosSeunit: 12.5,
			jumlahNilai: 62.5,
			createdByEmail: TEST_USER_EMAIL,
			createdByName: "ITU Melaka",
			status: "SAH",
		});
		expect(String(body.transaction.transactionId)).toMatch(/^TXN-[A-F0-9]{24}$/);
		expect(String(body.transaction.timestamp)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
		expect(transactions).toHaveLength(1);
		expect(audits).toHaveLength(1);
		const storedTransaction = Object.fromEntries(
			TRANSACTION_HEADERS.map((header, index) => [header, transactions[0]?.[index]]),
		);
		expect(storedTransaction).toMatchObject({
			ITEM_ID: "AT-0001",
			JENIS: "MASUK",
			KUANTITI: 5,
			KOS_SEUNIT: 12.5,
			JUMLAH_NILAI: 62.5,
			CREATED_BY_EMAIL: TEST_USER_EMAIL,
			CREATED_BY_NAME: "ITU Melaka",
			STATUS: "SAH",
		});
		expect(audits[0]?.[AUDIT_HEADERS.indexOf("AUDIT_ID")]).toMatch(/^AUD-[A-F0-9]{24}$/);
		expect(audits[0]?.[AUDIT_HEADERS.indexOf("RECORD_ID")]).toBe(body.transaction.transactionId);
		expect(audits[0]?.[AUDIT_HEADERS.indexOf("USER_EMAIL")]).toBe(TEST_USER_EMAIL);
		expect(audits[0]?.[AUDIT_HEADERS.indexOf("USER_NAME")]).toBe("ITU Melaka");
		expect(fetchMock.mock.calls.some(([input]) => decodeURIComponent(String(input)).includes("TRANSACTIONS!A:Z:append"))).toBe(true);

		const oauthCall = fetchMock.mock.calls.find(([input]) => String(input) === "https://oauth2.googleapis.com/token");
		const assertion = new URLSearchParams(String(oauthCall?.[1]?.body)).get("assertion") ?? "";
		const claimSegment = assertion.split(".")[1] ?? "";
		const claims = JSON.parse(atob(claimSegment.replace(/-/g, "+").replace(/_/g, "/")));
		expect(claims.scope).toBe("https://www.googleapis.com/auth/spreadsheets");
	});

	it.each([
		["invalid JSON", "{", "INVALID_JSON"],
		["missing required field", incomingBody({ itemId: "" }), "VALIDATION_ERROR"],
		["zero quantity", incomingBody({ kuantiti: 0 }), "VALIDATION_ERROR"],
		["negative cost", incomingBody({ kosSeunit: -1 }), "VALIDATION_ERROR"],
		["excess cost decimals", incomingBody({ kosSeunit: 1.234 }), "VALIDATION_ERROR"],
	])("rejects %s", async (_label, requestBody, expectedError) => {
		mockAuthenticatedFetch();
		const response = await dispatch(
			"/api/transactions/in",
			"POST",
			incomingHeaders(),
			requestBody,
		);
		expect(response.status).toBe(400);
		expect((await response.json<{ error: string }>()).error).toBe(expectedError);
	});

	it("requires a valid UUID Idempotency-Key", async () => {
		mockAuthenticatedFetch();
		const missing = await dispatch(
			"/api/transactions/in",
			"POST",
			{ ...bearerHeaders(), "Content-Type": "application/json" },
			incomingBody(),
		);
		expect(missing.status).toBe(400);
		expect((await missing.json<{ error: string }>()).error).toBe("INVALID_IDEMPOTENCY_KEY");
		vi.restoreAllMocks();

		mockAuthenticatedFetch();
		const malformed = await dispatch(
			"/api/transactions/in",
			"POST",
			incomingHeaders("not-a-uuid"),
			incomingBody(),
		);
		expect(malformed.status).toBe(400);
		expect((await malformed.json<{ error: string }>()).error).toBe("INVALID_IDEMPOTENCY_KEY");
	});

	it("rejects missing and inactive inventory items", async () => {
		mockAuthenticatedFetch();
		const missing = await dispatch(
			"/api/transactions/in", "POST", incomingHeaders(), incomingBody({ itemId: "TIADA" }),
		);
		expect(missing.status).toBe(404);
		expect((await missing.json<{ error: string }>()).error).toBe("ITEM_NOT_FOUND");
		vi.restoreAllMocks();

		const inactiveRows = inventoryRows(1);
		inactiveRows[0]![8] = "TIDAK_AKTIF";
		mockAuthenticatedFetch({ inventoryRows: inactiveRows });
		const inactive = await dispatch(
			"/api/transactions/in", "POST", incomingHeaders(), incomingBody(),
		);
		expect(inactive.status).toBe(409);
		expect((await inactive.json<{ error: string }>()).error).toBe("ITEM_INACTIVE");
	});

	it("replays the same key and payload without duplicate rows", async () => {
		const transactions: string[][] = [];
		const audits: string[][] = [];
		mockAuthenticatedFetch({ transactionRows: transactions, auditRows: audits });

		const first = await dispatch(
			"/api/transactions/in", "POST", incomingHeaders(), incomingBody(),
		);
		const second = await dispatch(
			"/api/transactions/in", "POST", incomingHeaders(), incomingBody(),
		);
		expect(first.status).toBe(201);
		expect(second.status).toBe(200);
		expect((await second.json<{ replayed: boolean }>()).replayed).toBe(true);
		expect(transactions).toHaveLength(1);
		expect(audits).toHaveLength(1);
	});

	it("rejects a conflicting payload that reuses an idempotency key", async () => {
		const transactions: string[][] = [];
		const audits: string[][] = [];
		mockAuthenticatedFetch({ transactionRows: transactions, auditRows: audits });
		await dispatch("/api/transactions/in", "POST", incomingHeaders(), incomingBody());

		const conflict = await dispatch(
			"/api/transactions/in",
			"POST",
			incomingHeaders(),
			incomingBody({ kuantiti: 6 }),
		);
		expect(conflict.status).toBe(409);
		expect((await conflict.json<{ error: string }>()).error).toBe("IDEMPOTENCY_CONFLICT");
		expect(transactions).toHaveLength(1);
		expect(audits).toHaveLength(1);
	});

	it("recovers an audit append failure without duplicating the transaction", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const transactions: string[][] = [];
		const audits: string[][] = [];
		mockAuthenticatedFetch({
			transactionRows: transactions,
			auditRows: audits,
			failAuditAppendOnce: true,
		});

		const first = await dispatch(
			"/api/transactions/in", "POST", incomingHeaders(), incomingBody(),
		);
		expect(first.status).toBe(500);
		expect((await first.json<{ error: string }>()).error).toBe("WRITE_FAILED");
		expect(transactions).toHaveLength(1);
		expect(audits).toHaveLength(0);

		const retry = await dispatch(
			"/api/transactions/in", "POST", incomingHeaders(), incomingBody(),
		);
		expect(retry.status).toBe(200);
		expect(transactions).toHaveLength(1);
		expect(audits).toHaveLength(1);
	});

	it("returns WRITE_FAILED safely when the transaction append fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const transactions: string[][] = [];
		const audits: string[][] = [];
		mockAuthenticatedFetch({
			transactionRows: transactions,
			auditRows: audits,
			failTransactionAppend: true,
		});
		const response = await dispatch(
			"/api/transactions/in", "POST", incomingHeaders(), incomingBody(),
		);
		const serialized = await response.text();
		expect(response.status).toBe(500);
		expect(JSON.parse(serialized).error).toBe("WRITE_FAILED");
		expect(transactions).toHaveLength(0);
		expect(audits).toHaveLength(0);
		expect(serialized).not.toContain(TEST_SUPABASE_ACCESS_TOKEN);
		expect(serialized).not.toContain(testPrivateKey);
	});

	it("adds CORS headers for the production frontend on GET /health", async () => {
		const response = await dispatch("/health", "GET", {
			Origin: PRODUCTION_ORIGIN,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			PRODUCTION_ORIGIN,
		);
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
			"GET, POST, OPTIONS",
		);
		expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
			"Content-Type, Authorization, Idempotency-Key",
		);
		expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
	});

	it("allows a configured localhost origin", async () => {
		const response = await dispatch("/health", "GET", {
			Origin: LOCAL_ORIGIN,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			LOCAL_ORIGIN,
		);
	});

	it("does not add an allow-origin header for a disallowed origin", async () => {
		const response = await dispatch("/health", "GET", {
			Origin: DISALLOWED_ORIGIN,
		});

		expect(response.status).toBe(200);
		expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
	});

	it("handles a Daftar Item POST preflight with Idempotency-Key", async () => {
		const response = await dispatch("/api/items", "OPTIONS", {
			Origin: PRODUCTION_ORIGIN,
			"Access-Control-Request-Method": "POST",
			"Access-Control-Request-Headers": "Content-Type, Authorization, Idempotency-Key",
		});

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			PRODUCTION_ORIGIN,
		);
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
			"GET, POST, OPTIONS",
		);
		expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
			"Content-Type, Authorization, Idempotency-Key",
		);
		expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
	});

	it("rejects a disallowed OPTIONS preflight safely", async () => {
		const response = await dispatch("/api/items", "OPTIONS", {
			Origin: DISALLOWED_ORIGIN,
			"Access-Control-Request-Method": "GET",
		});
		const body = await response.json<{
			error: string;
			message: string;
		}>();
		const serializedBody = JSON.stringify(body);

		expect(response.status).toBe(403);
		expect(body).toEqual({
			error: "CORS_ORIGIN_DENIED",
			message: "Origin tidak dibenarkan.",
		});
		expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
		expect(serializedBody).not.toContain("PRIVATE KEY");
		expect(serializedBody).not.toContain(TEST_SERVICE_ACCOUNT_EMAIL);
	});

	it("sets Vary: Origin for allowed cross-origin responses", async () => {
		const response = await dispatch("/health", "GET", {
			Origin: PRODUCTION_ORIGIN,
		});

		expect(response.headers.get("Vary")).toBe("Origin");
	});
});
