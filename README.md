# ITU eSTOR

ITU eSTOR ialah sistem pengurusan stok dan bekalan Institut Teknologi Unggas. Frontend PWA diterbitkan melalui GitHub Pages, identiti Google disahkan oleh Supabase Auth, Cloudflare Worker menguatkuasakan kebenaran aplikasi, dan Google Sheets Native menyimpan data operasi.

## Pautan produksi

- Frontend: <https://itumelaka.github.io/ituestor/>
- API Worker: <https://ituestor-api.itumelaka.workers.dev>
- Repositori: <https://github.com/itumelaka/ituestor>
- Version ID Worker semasa: `4465e0f1-4687-4e48-82a2-2e710e5b6dfc`

> **Status disahkan — 3 Ogos 2026:** Daftar Item Baharu, Barang Masuk, pengiraan stok semasa, pintasan Tambah Stok, sejarah transaksi dan pembatalan transaksi telah aktif di produksi. Jumlah item produksi ialah 130.

## Seni bina semasa

```text
GitHub Pages + PWA
        |
        | Google OAuth / sesi Supabase
        v
Cloudflare Worker
        |-- sahkan token melalui Supabase /auth/v1/user
        |-- semak EMAIL, STATUS dan ROLE dalam USERS
        |-- validasi, pengiraan, idempotensi dan audit
        v
Google Sheets API
        |-- MASTER_ITEM
        |-- TRANSACTIONS
        |-- USERS
        `-- AUDIT_LOG
```

Frontend tidak mengakses Google Sheets secara terus. `MASTER_ITEM.STOK_AWAL` kekal sebagai garis dasar migrasi; semua pergerakan stok direkodkan dalam `TRANSACTIONS`.

## Milestone produksi 3 Ogos 2026

| Commit | Milestone |
|---|---|
| `54640a7` | `feat: add Barang Masuk transaction flow` |
| `51debd2` | `feat: add new inventory item registration` |
| `6385007` | `feat: add current stock calculation and quick stock entry` |
| `d8b0d1d` | `refactor: simplify Barang Masuk form` |
| `4c74431` | `feat: add transaction history and cancellation` |

Fungsi produksi yang lengkap:

- Daftar Item Baharu dengan ID kategori yang dijana Worker, semakan pendua dan audit.
- Barang Masuk dengan medan Item, Kuantiti, Kos seunit dan Catatan pilihan.
- Pengiraan `stokSemasa`, nilai semasa dan status stok daripada transaksi `SAH`.
- Pintasan Tambah Stok daripada daftar serta modal item.
- Register dan butiran transaksi sebenar.
- Pembatalan tanpa pemadaman fizikal; hanya `STATUS` ditukar kepada `DIBATALKAN` dan audit `CANCEL` ditambah.
- Dashboard dan daftar item dimuat semula selepas transaksi atau pembatalan disahkan oleh Worker.

Ujian Worker terakhir: **82/82 lulus**. Suite Barang Masuk ringkas sebelumnya: **68/68 lulus**.

## Endpoint aktif

| Kaedah | Laluan | Akses |
|---|---|---|
| `GET` | `/health` | Awam |
| `GET` | `/api/me` | Semua pengguna `AKTIF` dengan peranan sah |
| `GET` | `/api/items` | Semua empat peranan sah |
| `POST` | `/api/items` | `SUPER_ADMIN`, `ADMIN_STOR` |
| `POST` | `/api/transactions/in` | `SUPER_ADMIN`, `ADMIN_STOR`, `PEMBANTU_STOR` |
| `GET` | `/api/transactions` | Semua empat peranan sah |
| `POST` | `/api/transactions/:transactionId/cancel` | `SUPER_ADMIN`, `ADMIN_STOR` |

Kontrak lengkap: [Dokumentasi API](docs/API.md).

## Pengiraan stok semasa

```text
STOK_SEMASA = STOK_AWAL + JUMLAH_MASUK - JUMLAH_KELUAR
```

Hanya transaksi `STATUS = SAH` dikira. `MASUK`, `PELARASAN_TAMBAH` dan `PULANGAN` menambah stok; `KELUAR`, `PELARASAN_TOLAK` dan `ROSAK_LUPUS` menolak stok. Transaksi `DIBATALKAN` kekal dalam sejarah tetapi tidak memberi kesan kepada stok.

## Peralihan operasi

ITU eSTOR belum dilepaskan secara rasmi kepada pegawai stor. Sehingga tarikh go-live ditetapkan, operasi kekal pada empat tab legasi: `BAHAN KIMIA`, `ALAT TULIS`, `HOUSE HOLD` dan `LAIN-LAIN`.

Sebelum go-live, kemas kini legasi perlu dihentikan sementara untuk rekonsiliasi akhir, penyegerakan item serta baki terkini, dan pengesahan jumlah serta nilai stok. Selepas go-live, ITU eSTOR menjadi sistem operasi tunggal dan tab legasi menjadi rujukan baca sahaja/arkib. Elakkan kemasukan berganda antara kedua-dua sistem.

## Batasan dan kerja seterusnya

- Google OAuth masih berstatus `Testing`.
- Barang Keluar belum aktif.
- Permohonan, kelulusan dan penyerahan belum aktif.
- Sunting metadata atau pengaktifan semula item belum aktif.
- UI pengurusan pengguna/peranan, paparan audit, tetapan dan laporan belum aktif.
- Penulisan status transaksi dan append audit di Google Sheets tidak atomik. Pemulihan retry telah dilaksanakan, tetapi penulisan pertama yang benar-benar serentak masih mempunyai tetingkap perlumbaan kecil; penguncian kuat pada masa hadapan mungkin memerlukan Durable Objects atau D1.
- Rekonsiliasi akhir dan prosedur go-live rasmi masih perlu dilengkapkan.

## Pembangunan setempat

```powershell
cd worker
npm ci
npm run cf-typegen
npm run dev
```

`worker/.dev.vars` diperlukan secara setempat dan tidak boleh dimasukkan ke Git. Jangan rekod token, kunci peribadi atau rahsia perkhidmatan dalam kod atau dokumentasi.

## Dokumentasi

- [Status projek](docs/PROJECT_STATUS.md)
- [Dokumentasi API](docs/API.md)
- [Model data](docs/DATA_MODEL.md)
- [Pemetaan spreadsheet dan migrasi](docs/SPREADSHEET_MAPPING.md)
