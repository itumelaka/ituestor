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
const TEST_ACCESS_TOKEN = "test-access-token";

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
		GOOGLE_SERVICE_ACCOUNT_EMAIL: TEST_SERVICE_ACCOUNT_EMAIL,
		GOOGLE_PRIVATE_KEY_ID: TEST_PRIVATE_KEY_ID,
		GOOGLE_PRIVATE_KEY: testPrivateKey,
	};
}

async function dispatch(path: string, method = "GET"): Promise<Response> {
	const request = new IncomingRequest(`https://ituestor.test${path}`, {
		method,
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

	it("transforms a Google Sheets row into a structured inventory item", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async (input) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.toString()
							: input.url;

				if (url === "https://oauth2.googleapis.com/token") {
					return Response.json({
						access_token: TEST_ACCESS_TOKEN,
						token_type: "Bearer",
						expires_in: 3600,
					});
				}

				if (url.startsWith("https://sheets.googleapis.com/v4/spreadsheets/")) {
					return Response.json({
						range: "MASTER_ITEM!A1:M2",
						majorDimension: "ROWS",
						values: [
							[
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
							],
							[
								"AT-0001",
								"ALAT TULIS",
								"Kertas A4 80gsm",
								"KERTAS A4 80GSM",
								"RIM",
								"RM 1,234.50",
								"12",
								"2",
								"AKTIF",
								"ALAT TULIS",
								"5",
								"2026-07-29T09:00:00+08:00",
								"2026-07-29T09:00:00+08:00",
							],
						],
					});
				}

				throw new Error(`Permintaan luar tidak dijangka: ${url}`);
			});

		const response = await dispatch("/api/items");
		const body = await response.json<{
			success: boolean;
			sheet: string;
			count: number;
			items: Array<Record<string, unknown>>;
		}>();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.sheet).toBe("MASTER_ITEM");
		expect(body.count).toBe(1);
		expect(body.items).toEqual([
			{
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
				sumberBaris: 5,
				createdAt: "2026-07-29T09:00:00+08:00",
				updatedAt: "2026-07-29T09:00:00+08:00",
			},
		]);
		expect(typeof body.items[0]?.kosSeunit).toBe("number");
		expect(typeof body.items[0]?.stokAwal).toBe("number");
		expect(typeof body.items[0]?.stokMinimum).toBe("number");
		expect(fetchMock).toHaveBeenCalledTimes(2);

		const sheetsCall = fetchMock.mock.calls[1];
		const sheetsInit = sheetsCall?.[1];
		const headers = new Headers(sheetsInit?.headers);
		expect(headers.get("Authorization")).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
	});

	it("returns a structured error without exposing test secrets when Google OAuth fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(
				Response.json(
					{ error: "invalid_grant" },
					{ status: 401 },
				),
			);

		const response = await dispatch("/api/items");
		const body = await response.json<{
			success: boolean;
			error: string;
			message: string;
		}>();
		const serializedBody = JSON.stringify(body);

		expect(response.status).toBe(500);
		expect(body.success).toBe(false);
		expect(body.error).toBe("GOOGLE_SHEETS_ERROR");
		expect(body.message).toContain("Google OAuth gagal: 401");
		expect(serializedBody).not.toContain(TEST_PRIVATE_KEY_ID);
		expect(serializedBody).not.toContain(TEST_SERVICE_ACCOUNT_EMAIL);
		expect(serializedBody).not.toContain(testPrivateKey);
		expect(fetchMock).toHaveBeenCalledTimes(1);
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
});
