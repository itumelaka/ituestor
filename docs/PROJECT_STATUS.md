# Status Projek ITU eSTOR

**Tarikh status disahkan:** 29 Julai 2026

## Ringkasan

ITU eSTOR telah mencapai fasa awal pengeluaran baca sahaja. Frontend statik dan Cloudflare Worker telah diterbitkan, enam tab pengeluaran Google Sheets telah diwujudkan, dan migrasi 130 item ke `MASTER_ITEM` telah selesai. Worker berjaya mengesahkan akaun perkhidmatan Google dan mengembalikan semua 130 item sebagai objek berstruktur.

Frontend **belum disambungkan** kepada API pengeluaran. Supabase Google Auth, kawalan akses berasaskan peranan dan semua operasi tulis masih belum dilaksanakan.

## Infrastruktur pengeluaran

| Komponen | Nilai / status |
|---|---|
| Repositori | <https://github.com/itumelaka/ituestor> |
| Frontend | <https://itumelaka.github.io/ituestor/> |
| Worker | `ituestor-api` |
| API | <https://ituestor-api.itumelaka.workers.dev> |
| Persekitaran Worker | `production` |
| Spreadsheet | `STOK BARANG (10 JULAI 2026)` |
| Spreadsheet ID | `1nihQ3IN9104uyIP3hqry6vd7jMcNpcnMfTTvPUsTpa4` |
| Pentadbir utama | ITU Melaka / `itumelaka@gmail.com` |

## Kerja selesai

### Frontend dan repositori

- [x] Repositori GitHub diwujudkan.
- [x] Dashboard statik 3D Clay diterbitkan melalui GitHub Pages.
- [x] Dokumentasi model data dan pemetaan migrasi diwujudkan.
- [ ] Frontend disambungkan kepada Worker API.
- [ ] Keadaan memuat, kosong dan ralat API dilaksanakan pada frontend.

### Google Sheets

- [x] Empat tab legasi dikekalkan tanpa perubahan:
  - `ALAT TULIS`
  - `BAHAN KIMIA`
  - `HOUSE HOLD`
  - `LAIN-LAIN`
- [x] Enam tab pengeluaran diwujudkan:
  - `MASTER_ITEM`
  - `TRANSACTIONS`
  - `USERS`
  - `REQUESTS`
  - `AUDIT_LOG`
  - `SETTINGS`
- [x] Migrasi `MASTER_ITEM` diselesaikan dan direkonsiliasi kepada 130 item.
- [x] Jumlah kuantiti awal disahkan sebagai 274.
- [x] Jumlah nilai awal disahkan sebagai RM2,334.40.
- [x] Spreadsheet dikongsi kepada akaun perkhidmatan sebagai Viewer.
- [ ] Lejar transaksi digunakan untuk mengira stok semasa.
- [ ] Operasi tulis ke tab pengeluaran diaktifkan.

### Pecahan migrasi

| Kategori | Item |
|---|---:|
| `ALAT TULIS` | 63 |
| `BAHAN KIMIA` | 16 |
| `HOUSE HOLD` | 40 |
| `LAIN-LAIN` | 11 |
| **Jumlah** | **130** |

### Cloudflare Worker

- [x] Worker TypeScript `ituestor-api` diterbitkan ke pengeluaran.
- [x] `GET /health` mengembalikan status perkhidmatan dan persekitaran pengeluaran.
- [x] `GET /api/items` mengesahkan akaun perkhidmatan melalui Google OAuth.
- [x] `GET /api/items` membaca `MASTER_ITEM` melalui Google Sheets API.
- [x] Respons item ditukar kepada 130 objek inventori berstruktur.
- [x] Root `/` mengembalikan `404 NOT_FOUND` secara reka bentuk.
- [x] API semasa dihadkan kepada operasi baca.
- [ ] Endpoint transaksi, permohonan, kelulusan dan operasi tulis dilaksanakan.
- [ ] Ujian Worker dikemas kini daripada contoh permulaan kepada endpoint sebenar.

## Endpoint aktif

| Kaedah | Endpoint | Akses semasa |
|---|---|---|
| `GET` | `/health` | Awam |
| `GET` | `/api/items` | Awam, baca sahaja, belum dilindungi auth |

Lihat [API.md](API.md) untuk kontrak respons.

## Kawalan keselamatan disahkan

- [x] `worker/.dev.vars` digunakan untuk rahsia setempat.
- [x] `worker/.dev.vars` diabaikan oleh Git melalui `worker/.gitignore`.
- [x] Rahsia pengeluaran disimpan sebagai Cloudflare Worker secrets.
- [x] Nama rahsia yang digunakan:
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_PRIVATE_KEY_ID`
  - `GOOGLE_PRIVATE_KEY`
- [x] Akaun perkhidmatan menggunakan skop `spreadsheets.readonly`.
- [x] Akaun perkhidmatan hanya diberi akses Viewer kepada Google Sheet.
- [x] Respons `/health` tidak mendedahkan metadata sensitif.
- [ ] Pengesahan Supabase Google Auth diaktifkan.
- [ ] Token frontend disahkan oleh Worker.
- [ ] Peranan `SUPER_ADMIN`, `ADMIN_STOR`, `PEMBANTU_STOR` dan `VIEWER` dikuatkuasakan.
- [ ] `/api/items` dihadkan kepada pengguna yang sah.

Nilai rahsia tidak direkodkan dalam dokumentasi atau repositori.

## Commit pengeluaran disahkan

| Commit | Perubahan |
|---|---|
| `c843682` | `feat: add Cloudflare Worker Google Sheets API` |
| `7196a4d` | `feat: return structured inventory items` |
| `6a7be35` | `chore: harden production health response` |

## Batasan semasa

1. Dashboard frontend masih memaparkan data prototaip, bukan data langsung.
2. `/api/items` boleh dicapai tanpa pengesahan pengguna.
3. Supabase Google Auth hanya dirancang dan belum berada dalam aliran aktif.
4. `TRANSACTIONS`, `USERS`, `REQUESTS`, `AUDIT_LOG` dan `SETTINGS` telah wujud sebagai tab, tetapi belum didedahkan melalui Worker pengeluaran.
5. API tidak menyokong ciptaan, perubahan, kelulusan atau pemadaman rekod.
6. Stok semasa belum dikira daripada lejar transaksi.
7. Ujian automatik Worker masih mengandungi jangkaan contoh “Hello World” dan belum sepadan dengan pelaksanaan pengeluaran.
8. Kod menggunakan `GOOGLE_PRIVATE_KEY_ID`, tetapi nama ini belum disenaraikan dalam `secrets.required` di `wrangler.jsonc` atau jenis Worker yang dijana. Konfigurasi dan type generation perlu diselaraskan sebelum pembangunan setempat seterusnya.

## Kerja seterusnya yang dirancang

- [ ] Sambungkan frontend kepada `GET /api/items`.
- [ ] Gantikan statistik dan senarai prototaip dengan data sebenar.
- [ ] Tambah keadaan memuat, ralat, tiada data dan percubaan semula.
- [ ] Integrasikan Supabase Google Auth pada frontend.
- [ ] Sahkan token pengguna di Cloudflare Worker.
- [ ] Aktifkan kawalan akses berasaskan peranan.
- [ ] Lindungi `/api/items`.
- [ ] Laksanakan endpoint transaksi dan pengiraan stok semasa.
- [ ] Laksanakan aliran permohonan, kelulusan dan penyerahan.
- [ ] Rekodkan tindakan sensitif dalam `AUDIT_LOG`.
- [ ] Kemas kini ujian automatik untuk endpoint sebenar.
- [ ] Selaraskan `GOOGLE_PRIVATE_KEY_ID` dalam deklarasi rahsia dan jana semula jenis Worker.
- [ ] Jalankan semakan keselamatan sebelum API tulis diaktifkan.
