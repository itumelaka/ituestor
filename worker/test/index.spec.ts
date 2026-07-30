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
	const rows = options.inventoryRows ?? inventoryRows();

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

			if (decodedUrl.includes("/values/MASTER_ITEM!A:Z")) {
				return Response.json({
					range: `MASTER_ITEM!A1:M${rows.length + 1}`,
					majorDimension: "ROWS",
					values: [ITEM_HEADERS, ...rows],
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
): Promise<Response> {
	const request = new IncomingRequest(`https://ituestor.test${path}`, {
		method,
		headers,
	});
	const context = createExecutionContext();
	const response = await worker.fetch(request, createTestEnv(), context);

	await waitOnExecutionContext(context);
	return response;
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
		const response = await dispatch("/api/items", "POST");
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

	it("adds CORS headers for the production frontend on GET /health", async () => {
		const response = await dispatch("/health", "GET", {
			Origin: PRODUCTION_ORIGIN,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			PRODUCTION_ORIGIN,
		);
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
			"GET, OPTIONS",
		);
		expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
			"Content-Type, Authorization",
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

	it("handles a successful production OPTIONS preflight", async () => {
		const response = await dispatch("/api/items", "OPTIONS", {
			Origin: PRODUCTION_ORIGIN,
			"Access-Control-Request-Method": "GET",
			"Access-Control-Request-Headers": "Content-Type, Authorization",
		});

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			PRODUCTION_ORIGIN,
		);
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
			"GET, OPTIONS",
		);
		expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
			"Content-Type, Authorization",
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
