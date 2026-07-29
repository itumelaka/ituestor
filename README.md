# ITU eSTOR

ITU eSTOR ialah sistem pengurusan stok dan bekalan untuk **Institut Teknologi Unggas**. Projek ini menggunakan frontend statik di GitHub Pages, Cloudflare Worker sebagai API, dan Google Sheets Native sebagai storan data. Google Apps Script tidak digunakan.

## Pautan pengeluaran

- Frontend: <https://itumelaka.github.io/ituestor/>
- Backend API: <https://ituestor-api.itumelaka.workers.dev>
- Repositori: <https://github.com/itumelaka/ituestor>

> **Status semasa:** Frontend pengeluaran memaparkan data langsung daripada `MASTER_ITEM` dan menggunakan Supabase Google Auth. Pengesahan identiti telah aktif, tetapi kebenaran aplikasi melalui `USERS` dan peranan masih belum dikuatkuasakan oleh Worker.

## Seni bina

```text
GitHub Pages frontend
        ├── Supabase Google Auth (identiti)
        │
        │  GET /api/items (masih awam)
        ▼
Cloudflare Worker TypeScript
        │
        │  Google Sheets API (baca sahaja)
        ▼
Google Sheets Native / MASTER_ITEM
```

- **Frontend:** GitHub Pages, disambungkan kepada `GET /api/items` dengan CORS pengeluaran yang disahkan
- **Backend:** Cloudflare Worker `ituestor-api`
- **Storan:** Google Sheets Native dalam Google Drive
- **Akses Google:** Akaun perkhidmatan Google dengan skop baca sahaja
- **Pengesahan identiti:** Supabase Google Auth aktif pada frontend
- **Kebenaran aplikasi:** semakan e-mel aktif dan peranan melalui `USERS` masih belum dilaksanakan oleh Worker

## Status pengeluaran disahkan

Setakat **29 Julai 2026**:

- enam tab pengeluaran telah diwujudkan: `MASTER_ITEM`, `TRANSACTIONS`, `USERS`, `REQUESTS`, `AUDIT_LOG`, dan `SETTINGS`;
- migrasi `MASTER_ITEM` selesai dengan 130 item;
- jumlah kuantiti awal ialah 274;
- jumlah nilai awal ialah RM2,334.40;
- empat tab legasi kekal tidak berubah;
- Worker pengeluaran menyediakan API baca sahaja untuk `MASTER_ITEM`.
- frontend memaparkan 130 item langsung daripada API tanpa data dummy;
- dashboard mengira nilai stok diketahui sebanyak RM2,334.40 daripada stok awal, dengan 0 stok rendah dan 80 stok habis;
- carian item serta keadaan memuat, ralat, percubaan semula dan kosong telah diaktifkan.
- Google OAuth melalui projek Supabase `ITU eSTOR` (`tzsykhjfhmctasjscwch`) telah disahkan;
- pengguna tanpa sesi hanya melihat skrin log masuk, sesi dipulihkan selepas muat semula, dan log keluar mengunci semula aplikasi;
- frontend menggunakan publishable key yang selamat untuk pelayar; tiada nilai rahsia direkodkan dalam dokumentasi.

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

- Supabase mengesahkan identiti Google; ini belum memberikan peranan aplikasi.
- UI memaparkan `Pengesahan akses belum selesai` sehingga Worker mengesahkan pengguna melalui `USERS`.
- Rahsia setempat disimpan dalam `worker/.dev.vars`, yang diabaikan oleh Git.
- Rahsia pengeluaran disimpan sebagai Cloudflare Worker secrets:
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_PRIVATE_KEY_ID`
  - `GOOGLE_PRIVATE_KEY`
- Nilai rahsia tidak boleh diletakkan dalam dokumentasi, kod sumber atau `wrangler.jsonc`.
- Google Sheet dikongsi kepada akaun perkhidmatan sebagai **Viewer**.
- Worker menggunakan skop Google Sheets baca sahaja.

## Batasan semasa

- `/api/items` belum dilindungi dengan pengesahan atau kawalan peranan.
- Frontend belum menghantar bearer token Supabase kepada Worker.
- Worker belum mengesahkan token, membaca e-mel yang disahkan atau menyemak status/peranan dalam `USERS`.
- API transaksi, permohonan, kelulusan dan operasi tulis belum tersedia.
- Barang Masuk, Barang Keluar, permohonan, kelulusan dan operasi tulis lain tidak boleh diaktifkan sebelum kebenaran backend lengkap.
- Nilai stok pada dashboard masih berdasarkan `stokAwal`; pengiraan berasaskan lejar transaksi belum aktif.
- Kad permohonan dan transaksi dipaparkan sebagai `Belum aktif` sehingga endpoint berkaitan tersedia.
- Ujian Worker masih perlu dikemas kini supaya mencerminkan endpoint semasa.

## Dokumentasi

- [Status projek](docs/PROJECT_STATUS.md)
- [Dokumentasi API](docs/API.md)
- [Model data](docs/DATA_MODEL.md)
- [Pemetaan spreadsheet dan migrasi](docs/SPREADSHEET_MAPPING.md)

## Rekod pentadbir awal

- Nama paparan: **ITU Melaka**
- E-mel: **itumelaka@gmail.com**

Rekod ini tidak menjadikan sesi Google sebagai `SUPER_ADMIN` secara automatik; status aktif dan peranan mesti disahkan oleh Worker terhadap tab `USERS`.
