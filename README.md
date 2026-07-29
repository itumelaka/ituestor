# ITU eSTOR

ITU eSTOR ialah sistem pengurusan stok dan bekalan untuk **Institut Teknologi Unggas**. Projek ini menggunakan frontend statik di GitHub Pages, Cloudflare Worker sebagai API, dan Google Sheets Native sebagai storan data. Google Apps Script tidak digunakan.

## Pautan pengeluaran

- Frontend: <https://itumelaka.github.io/ituestor/>
- Backend API: <https://ituestor-api.itumelaka.workers.dev>
- Repositori: <https://github.com/itumelaka/ituestor>

> **Status semasa:** API pengeluaran boleh membaca 130 item berstruktur daripada `MASTER_ITEM`, tetapi frontend masih belum disambungkan kepada API tersebut. Data dashboard yang dipaparkan pada frontend belum merupakan data langsung.

## Seni bina

```text
GitHub Pages frontend
        │
        │  Belum disambungkan
        ▼
Cloudflare Worker TypeScript
        │
        │  Google Sheets API (baca sahaja)
        ▼
Google Sheets Native / MASTER_ITEM
```

- **Frontend:** GitHub Pages
- **Backend:** Cloudflare Worker `ituestor-api`
- **Storan:** Google Sheets Native dalam Google Drive
- **Akses Google:** Akaun perkhidmatan Google dengan skop baca sahaja
- **Pengesahan pengguna:** Supabase Google Auth dirancang, tetapi belum diintegrasikan dalam aliran frontend/backend yang aktif

## Status pengeluaran disahkan

Setakat **29 Julai 2026**:

- enam tab pengeluaran telah diwujudkan: `MASTER_ITEM`, `TRANSACTIONS`, `USERS`, `REQUESTS`, `AUDIT_LOG`, dan `SETTINGS`;
- migrasi `MASTER_ITEM` selesai dengan 130 item;
- jumlah kuantiti awal ialah 274;
- jumlah nilai awal ialah RM2,334.40;
- empat tab legasi kekal tidak berubah;
- Worker pengeluaran menyediakan API baca sahaja untuk `MASTER_ITEM`.

Butiran lanjut: [Status Projek](docs/PROJECT_STATUS.md).

## Endpoint API aktif

| Kaedah | Laluan | Status |
|---|---|---|
| `GET` | `/health` | Status perkhidmatan dan persekitaran pengeluaran |
| `GET` | `/api/items` | Mengembalikan 130 item berstruktur daripada `MASTER_ITEM` |
| Semua | `/` atau laluan lain | `404 NOT_FOUND` secara reka bentuk |

Dokumentasi respons dan ralat: [API](docs/API.md).

## Pembangunan setempat

Keperluan: Node.js dan npm yang serasi dengan kebergantungan dalam `worker/package-lock.json`.

```powershell
cd worker
npm ci
npm run cf-typegen
npm run dev
```

Semakan endpoint setempat:

```powershell
Invoke-RestMethod http://localhost:8787/health
Invoke-RestMethod http://localhost:8787/api/items
```

Arahan Worker yang tersedia:

```powershell
npm run dev
npm run test
npm run cf-typegen
npm run deploy
```

`worker/.dev.vars` diperlukan untuk rahsia pembangunan setempat dan tidak boleh dimasukkan ke Git. Jangan jalankan deployment sebelum rahsia pengeluaran, konfigurasi dan respons endpoint disahkan.

## Keselamatan

- Rahsia setempat disimpan dalam `worker/.dev.vars`, yang diabaikan oleh Git.
- Rahsia pengeluaran disimpan sebagai Cloudflare Worker secrets:
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_PRIVATE_KEY_ID`
  - `GOOGLE_PRIVATE_KEY`
- Nilai rahsia tidak boleh diletakkan dalam dokumentasi, kod sumber atau `wrangler.jsonc`.
- Google Sheet dikongsi kepada akaun perkhidmatan sebagai **Viewer**.
- Worker menggunakan skop Google Sheets baca sahaja.

## Batasan semasa

- Frontend belum menggunakan data daripada `/api/items`.
- `/api/items` belum dilindungi dengan pengesahan atau kawalan peranan.
- Supabase Google Auth belum diintegrasikan.
- API transaksi, permohonan, kelulusan dan operasi tulis belum tersedia.
- Pengiraan stok berasaskan transaksi belum aktif.
- Ujian Worker masih perlu dikemas kini supaya mencerminkan endpoint semasa.

## Dokumentasi

- [Status projek](docs/PROJECT_STATUS.md)
- [Dokumentasi API](docs/API.md)
- [Model data](docs/DATA_MODEL.md)
- [Pemetaan spreadsheet dan migrasi](docs/SPREADSHEET_MAPPING.md)

## Pentadbir utama

- Nama paparan: **ITU Melaka**
- E-mel: **itumelaka@gmail.com**
