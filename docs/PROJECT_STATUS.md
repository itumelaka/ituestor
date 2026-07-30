# Status Projek ITU eSTOR

**Tarikh status disahkan:** 30 Julai 2026

## Ringkasan

ITU eSTOR kini beroperasi sebagai aplikasi produksi baca sahaja dengan pengesahan identiti dan kebenaran backend. Frontend GitHub Pages menggunakan Supabase Google Auth, menghantar token sesi kepada Cloudflare Worker, dan hanya memuatkan inventori selepas Worker mengesahkan pengguna terhadap tab `USERS`.

PWA branding turut aktif menggunakan logo rasmi ITU eSTOR. Manifest, service worker, favicon dan semua ikon produksi telah disahkan boleh dicapai, manakala shell statik tersedia sebagai fallback luar talian.

## Infrastruktur pengeluaran

| Komponen | Nilai / status |
|---|---|
| Repositori | <https://github.com/itumelaka/ituestor> |
| Frontend | <https://itumelaka.github.io/ituestor/> |
| Worker API | <https://ituestor-api.itumelaka.workers.dev> |
| Version ID Worker | `e369d89f-6be3-46a0-a312-7a145aeb602f` |
| Supabase | `ITU eSTOR` / `tzsykhjfhmctasjscwch` |
| Persekitaran Worker | `production` |
| Spreadsheet | `STOK BARANG (10 JULAI 2026)` |
| Pengguna produksi disahkan | ITU Melaka / `itumelaka@gmail.com` / `SUPER_ADMIN` / `AKTIF` |

## Milestone produksi — 30 Julai 2026

### Kebenaran backend

Commit `fa49d9f` (`feat: enforce Supabase authorization in Worker`) melengkapkan aliran berikut:

1. pengguna log masuk dengan Google melalui Supabase Auth;
2. frontend mendapatkan sesi Supabase aktif;
3. frontend menghantar bearer token kepada Worker;
4. Worker mengesahkan token melalui endpoint rasmi Supabase `/auth/v1/user`;
5. Worker mengekstrak dan menormalkan e-mel yang telah disahkan;
6. Worker membaca `USERS!A:Z` melalui akaun perkhidmatan Google;
7. Worker membenarkan akses hanya apabila `EMAIL` sepadan, `STATUS = AKTIF`, dan `ROLE` sah.

Peranan baca yang dibenarkan:

- `SUPER_ADMIN`
- `ADMIN_STOR`
- `PEMBANTU_STOR`
- `VIEWER`

`GET /health` kekal awam. `GET /api/me` dan `GET /api/items` kini dilindungi dan mengembalikan `401 AUTH_REQUIRED` apabila token tiada.

### PWA branding

Commit `bbe111c` (`feat: add ITU eSTOR PWA branding`) menerbitkan:

- logo rasmi `assets/images/itu_estor_inventory_icon.png` pada skrin log masuk;
- `manifest.webmanifest`;
- `service-worker.js`;
- `assets/icons/icon-192.png`;
- `assets/icons/icon-512.png`;
- `assets/icons/icon-maskable-512.png`;
- `assets/icons/apple-touch-icon.png`;
- `assets/icons/favicon-32.png`.

Manifest, service worker, favicon dan ikon disahkan mengembalikan `200`. Service worker mencache aset shell tempatan yang stabil sahaja. Respons Supabase, Worker API, permintaan dengan bearer token dan data khusus pengguna tidak dicache.

## Status endpoint produksi

| Kaedah | Endpoint | Akses | Keputusan disahkan |
|---|---|---|---|
| `GET` | `/health` | Awam | `200`, perkhidmatan berjalan dalam `production` |
| `GET` | `/api/me` | Dilindungi | Tanpa token: `401 AUTH_REQUIRED` |
| `GET` | `/api/items` | Dilindungi | Tanpa token: `401 AUTH_REQUIRED` |

Lihat [API.md](API.md) untuk kontrak respons.

## Data produksi disahkan

| Metrik | Nilai |
|---|---:|
| Jumlah item | 130 |
| Jumlah kuantiti awal | 274 |
| Nilai stok awal diketahui | RM2,334.40 |
| Stok rendah | 0 |
| Stok habis | 80 |
| `ALAT TULIS` | 63 |
| `BAHAN KIMIA` | 16 |
| `HOUSE HOLD` | 40 |
| `LAIN-LAIN` | 11 |

Permohonan dan transaksi kekal dipaparkan sebagai `Belum aktif`.

## Kawalan produksi yang selesai

### Identiti dan akses

- [x] Google OAuth melalui Supabase Auth.
- [x] Frontend dikunci apabila tiada sesi.
- [x] Pemulihan sesi, pemantauan auth dan log keluar.
- [x] Bearer token dihantar kepada `/api/me` dan `/api/items`.
- [x] Worker mengesahkan token dengan Supabase.
- [x] Worker menggunakan e-mel yang telah disahkan, bukan metadata Google sebagai bukti peranan.
- [x] `USERS` dipetakan berdasarkan header.
- [x] Hanya pengguna `AKTIF` dengan peranan sah dibenarkan.
- [x] Pengguna tidak tersenarai, tidak aktif dan peranan tidak sah ditolak.
- [x] `/api/items` dilindungi.

### Data dan API

- [x] `MASTER_ITEM` direkonsiliasi kepada 130 item.
- [x] Akaun perkhidmatan Google menggunakan akses Viewer dan skop baca sahaja.
- [x] Dashboard dan Daftar Item menggunakan data produksi.
- [x] CORS produksi berfungsi dengan header `Authorization`.
- [x] Tiada operasi tulis aktif.

### Ujian

- [x] 19 daripada 19 ujian Worker lulus.
- [x] Liputan merangkumi health awam, token tiada, token tidak sah, akses sah, pengguna tidak aktif, pengguna tidak berdaftar dan peranan tidak sah.
- [x] Ujian menggunakan mock Supabase dan Google Sheets tanpa panggilan rangkaian produksi.

### PWA

- [x] Logo rasmi dipaparkan secara responsif pada skrin log masuk.
- [x] Manifest dan ikon lengkap diterbitkan.
- [x] Service worker menyediakan cache shell statik.
- [x] Permintaan auth, API, token dan data pengguna dikecualikan daripada cache.
- [x] Shell statik disahkan boleh dimuatkan di luar talian.

## Commit pengeluaran disahkan

| Commit | Perubahan |
|---|---|
| `d567a6a` | `feat: connect dashboard to production inventory API` |
| `e1d3df5` | `feat: add Supabase Google authentication` |
| `fa49d9f` | `feat: enforce Supabase authorization in Worker` |
| `bbe111c` | `feat: add ITU eSTOR PWA branding` |

## Modul dan kawalan yang masih menunggu

- [ ] Google OAuth diterbitkan keluar daripada status `Testing`.
- [ ] Endpoint Barang Masuk dan Barang Keluar.
- [ ] Lejar `TRANSACTIONS` dan pengiraan stok semasa.
- [ ] Aliran `REQUESTS`, kelulusan dan penyerahan.
- [ ] Endpoint dan paparan `AUDIT_LOG`.
- [ ] Pengurusan pengguna dan perubahan peranan.
- [ ] Operasi tulis untuk item dan tetapan.
- [ ] Kawalan peranan khusus bagi setiap operasi tulis.

Barang Masuk, Barang Keluar, Permohonan, Kelulusan, Audit Log dan pengurusan pengguna tidak boleh diaktifkan sebelum endpoint tulis, validasi data, audit dan ujian kebenaran khusus operasi siap.

## Batasan semasa

1. Google OAuth masih `Testing`; hanya pengguna ujian yang dikonfigurasi boleh melengkapkan OAuth.
2. Nilai stok dashboard masih dikira daripada `STOK_AWAL`, bukan `TRANSACTIONS`.
3. API produksi hanya menyokong operasi baca.
4. Tab `TRANSACTIONS`, `REQUESTS`, `AUDIT_LOG` dan `SETTINGS` belum didedahkan sebagai modul aktif.
