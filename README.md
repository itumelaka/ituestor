# ITU eSTOR

ITU eSTOR ialah sistem pengurusan stok dan bekalan untuk **Institut Teknologi Unggas**. Frontend statik diterbitkan melalui GitHub Pages, Cloudflare Worker menyediakan API baca sahaja yang dilindungi, Supabase mengesahkan identiti Google, dan Google Sheets Native menyimpan data aplikasi.

## Pautan pengeluaran

- Frontend: <https://itumelaka.github.io/ituestor/>
- Backend API: <https://ituestor-api.itumelaka.workers.dev>
- Repositori: <https://github.com/itumelaka/ituestor>

> **Status semasa — 30 Julai 2026:** Pengesahan dan kebenaran backend telah aktif di produksi. `/api/me` dan `/api/items` memerlukan token sesi Supabase yang sah serta rekod `USERS` berstatus `AKTIF` dengan peranan yang dibenarkan.

## Seni bina semasa

```text
GitHub Pages + PWA shell
        |
        | Google OAuth / sesi
        v
Supabase Auth
        |
        | Authorization: Bearer <token sesi>
        v
Cloudflare Worker
        |-- sahkan token melalui Supabase /auth/v1/user
        |-- semak EMAIL, STATUS dan ROLE dalam USERS
        |
        v
Google Sheets API (baca sahaja)
        |-- USERS
        `-- MASTER_ITEM
```

- **Identiti:** Google OAuth melalui Supabase Auth.
- **Kebenaran aplikasi:** Worker memadankan e-mel yang disahkan dengan `USERS`.
- **Peranan baca yang sah:** `SUPER_ADMIN`, `ADMIN_STOR`, `PEMBANTU_STOR`, `VIEWER`.
- **Status wajib:** hanya `AKTIF` dibenarkan.
- **Akses Google Sheets:** akaun perkhidmatan dengan skop baca sahaja.

## Milestone pengeluaran 30 Julai 2026

- Commit `fa49d9f` — `feat: enforce Supabase authorization in Worker`.
- Commit `bbe111c` — `feat: add ITU eSTOR PWA branding`.
- Version ID Worker: `e369d89f-6be3-46a0-a312-7a145aeb602f`.
- `GET /health` kekal awam dan mengembalikan `200`.
- `GET /api/me` dan `GET /api/items` tanpa token mengembalikan `401 AUTH_REQUIRED`.
- Pengguna produksi `itumelaka@gmail.com` disahkan sebagai `ITU Melaka`, `SUPER_ADMIN`, `AKTIF`.
- Kesemua **19/19** ujian Worker lulus.
- Logo rasmi, manifest, service worker, favicon dan ikon PWA telah diterbitkan.
- Shell statik boleh dimuatkan di luar talian; respons auth, API, bearer token dan data pengguna tidak dicache.

## Data produksi disahkan

| Metrik | Nilai |
|---|---:|
| Jumlah item | 130 |
| Nilai stok awal diketahui | RM2,334.40 |
| Stok rendah | 0 |
| Stok habis | 80 |
| `ALAT TULIS` | 63 |
| `BAHAN KIMIA` | 16 |
| `HOUSE HOLD` | 40 |
| `LAIN-LAIN` | 11 |

Kad permohonan dan transaksi kekal memaparkan `Belum aktif`.

## Endpoint aktif

| Kaedah | Laluan | Akses |
|---|---|---|
| `GET` | `/health` | Awam |
| `GET` | `/api/me` | Token Supabase dan pengguna `USERS` yang dibenarkan |
| `GET` | `/api/items` | Token Supabase dan pengguna `USERS` yang dibenarkan |

Kontrak respons lengkap: [Dokumentasi API](docs/API.md).

## Pembangunan setempat

Keperluan: Node.js dan npm yang serasi dengan `worker/package-lock.json`.

```powershell
cd worker
npm ci
npm run cf-typegen
npm run dev
```

`worker/.dev.vars` diperlukan untuk pembangunan setempat dan tidak boleh dimasukkan ke Git. Jangan merekodkan token, kunci peribadi atau rahsia perkhidmatan dalam kod atau dokumentasi.

## Kawalan yang siap

- Frontend dikunci tanpa sesi Supabase.
- Token disahkan oleh Worker melalui endpoint rasmi Supabase.
- E-mel dinormalkan dan disemak terhadap `USERS!A:Z`.
- Pengguna tidak berdaftar, tidak aktif atau mempunyai peranan tidak sah ditolak.
- `/api/items` bukan lagi endpoint awam.
- CORS pengeluaran dan header `Authorization` disokong.
- API Google Sheets kekal baca sahaja.
- Ujian keselamatan dan akses Worker: 19/19 lulus.

## Batasan semasa

- Google OAuth masih berstatus `Testing`; hanya pengguna ujian yang dikonfigurasi boleh melengkapkan OAuth.
- Tiada endpoint tulis aktif.
- Barang Masuk, Barang Keluar, Permohonan, Kelulusan, Audit Log dan pengurusan pengguna belum dilaksanakan.
- Nilai stok dashboard masih berdasarkan `STOK_AWAL × KOS_SEUNIT`.
- Pengiraan stok semasa daripada `TRANSACTIONS` belum aktif.

## Dokumentasi

- [Status projek](docs/PROJECT_STATUS.md)
- [Dokumentasi API](docs/API.md)
- [Model data](docs/DATA_MODEL.md)
- [Pemetaan spreadsheet dan migrasi](docs/SPREADSHEET_MAPPING.md)
