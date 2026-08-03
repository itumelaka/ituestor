# Status Projek ITU eSTOR

**Tarikh status disahkan:** 3 Ogos 2026

## Ringkasan

ITU eSTOR kini mempunyai aliran produksi terlindung untuk pendaftaran item, Barang Masuk, pengiraan stok semasa, sejarah transaksi dan pembatalan transaksi. Frontend GitHub Pages menggunakan sesi Supabase; Worker mengesahkan identiti serta peranan melalui `USERS` sebelum membaca atau menulis Google Sheets.

Sistem belum dilepaskan secara rasmi kepada pegawai stor. Empat tab kategori legasi kekal sebagai sistem operasi sehingga rekonsiliasi akhir dan tarikh go-live dipersetujui.

## Infrastruktur produksi

| Komponen | Nilai / status |
|---|---|
| Repositori | <https://github.com/itumelaka/ituestor> |
| Frontend | <https://itumelaka.github.io/ituestor/> |
| Worker API | <https://ituestor-api.itumelaka.workers.dev> |
| Version ID Worker | `4465e0f1-4687-4e48-82a2-2e710e5b6dfc` |
| Supabase | `ITU eSTOR` / `tzsykhjfhmctasjscwch` |
| Persekitaran Worker | `production` |
| Jumlah item produksi | 130 |

## Milestone produksi 3 Ogos 2026

| Commit | Perubahan |
|---|---|
| `54640a7` | `feat: add Barang Masuk transaction flow` |
| `51debd2` | `feat: add new inventory item registration` |
| `6385007` | `feat: add current stock calculation and quick stock entry` |
| `d8b0d1d` | `refactor: simplify Barang Masuk form` |
| `4c74431` | `feat: add transaction history and cancellation` |

### Modul produksi lengkap

- [x] Daftar Item Baharu dengan ID kategori, semakan pendua, idempotensi dan audit.
- [x] Barang Masuk dengan Item, Kuantiti, Kos seunit dan Catatan pilihan.
- [x] Pengiraan stok semasa daripada `STOK_AWAL` dan transaksi `SAH`.
- [x] Nilai stok semasa serta status `HABIS`, `RENDAH` dan `TERSEDIA`.
- [x] Pintasan Tambah Stok daripada baris dan modal item.
- [x] Register transaksi, carian, penapis dan modal butiran.
- [x] Pembatalan transaksi tanpa pemadaman fizikal.
- [x] Dashboard, daftar item dan butiran item disegarkan selepas perubahan yang disahkan.

### Polisi peranan produksi

| Tindakan | SUPER_ADMIN | ADMIN_STOR | PEMBANTU_STOR | VIEWER |
|---|:---:|:---:|:---:|:---:|
| Lihat profil, item dan transaksi | Ya | Ya | Ya | Ya |
| Daftar item baharu | Ya | Ya | Tidak | Tidak |
| Rekod Barang Masuk | Ya | Ya | Ya | Tidak |
| Tambah Stok melalui pintasan | Ya | Ya | Ya | Tidak |
| Batalkan transaksi `SAH` | Ya | Ya | Tidak | Tidak |

Semua akses memerlukan token Supabase sah, e-mel sepadan dalam `USERS`, `STATUS = AKTIF` dan peranan yang dibenarkan.

## Tingkah laku data produksi

### Item baharu

Worker menjana awalan `AT-`, `BK-`, `HH-` atau `LL-` berdasarkan kategori. Rekod baharu menggunakan `STOK_AWAL = 0`, `STATUS = AKTIF`, `SUMBER_TAB = NEW_ITEM` dan `SUMBER_BARIS = 0`. Pendua dinilai menggunakan kategori, nama dan unit yang telah dinormalisasi.

### Barang Masuk dan stok semasa

Worker menetapkan `JENIS = MASUK`, `STATUS = SAH`, cap masa, identiti pencipta dan `JUMLAH_NILAI`. Apabila medan legasi tidak dihantar, `PIHAK_TERLIBAT`, `BAHAGIAN` dan `TUJUAN` disimpan sebagai rentetan kosong tanpa mengubah skema `TRANSACTIONS`.

```text
STOK_SEMASA = STOK_AWAL + JUMLAH_MASUK - JUMLAH_KELUAR
```

Hanya transaksi `SAH` dikira. `MASTER_ITEM.STOK_AWAL` tidak dikemas kini oleh pergerakan stok.

### Pembatalan

Pembatalan tidak memadam transaksi. Worker mengubah sel `STATUS` sahaja daripada `SAH` kepada `DIBATALKAN` dan menambah audit `CANCEL / TRANSACTION`. ID audit deterministik membolehkan retry memulihkan keadaan status sudah berubah tetapi audit belum berjaya ditambah. Transaksi yang dibatalkan tidak lagi mempengaruhi stok.

## Rekod ujian produksi terkawal

Transaksi berikut ialah **rekod ujian pengesahan produksi**, bukan stok operasi biasa:

| Medan | Nilai |
|---|---|
| Transaction ID | `TXN-2B7808B76CBEA4CA9FEF3E1A` |
| Item | `LL-0006` — Bateri D |
| Jenis | `MASUK` |
| Kuantiti | 10 |
| Kos seunit | RM3.00 |
| Jumlah nilai | RM30.00 |
| Status asal | `SAH` |
| Status akhir | `DIBATALKAN` |

Selepas pembatalan, stok Bateri D kembali kepada 0, nilai kembali kepada RM0.00, status stok kembali kepada `HABIS`, dan audit pembatalan telah disahkan.

## Ujian disahkan

- Suite Barang Masuk ringkas: **68/68 lulus**.
- Suite akhir sejarah/pembatalan transaksi: **82/82 lulus**.
- Semakan TypeScript, sintaks JavaScript, Wrangler dry-run dan `git diff --check` lulus.
- Ujian automatik menggunakan mock Supabase dan Google Sheets; tiada penulisan produksi dilakukan oleh suite.

## Peralihan go-live

### Sebelum go-live

1. Pegawai stor terus menggunakan `BAHAN KIMIA`, `ALAT TULIS`, `HOUSE HOLD` dan `LAIN-LAIN`.
2. Hentikan kemas kini legasi buat sementara pada masa rekonsiliasi akhir.
3. Selaras item baharu serta baki terkini ke eSTOR.
4. Sahkan jumlah item, baki dan nilai stok.
5. Tetapkan dan maklumkan tarikh go-live rasmi.

### Selepas go-live

1. ITU eSTOR menjadi sistem operasi tunggal.
2. Tab legasi menjadi rujukan baca sahaja/arkib.
3. Kemasukan berganda antara tab legasi dan eSTOR tidak dibenarkan.

## Modul masih menunggu

- [ ] Barang Keluar.
- [ ] Permohonan, kelulusan dan penyerahan.
- [ ] Sunting metadata item.
- [ ] Nyahaktif/aktif semula item.
- [ ] UI pengurusan pengguna dan peranan.
- [ ] UI paparan audit.
- [ ] Tetapan.
- [ ] Laporan.
- [ ] Rekonsiliasi akhir dan prosedur go-live.
- [ ] Google OAuth keluar daripada status `Testing`.

## Batasan teknikal

Google Sheets tidak menyediakan transaksi atomik merentas kemas kini `TRANSACTIONS` dan append `AUDIT_LOG`. Strategi semasa tidak melaporkan kejayaan apabila audit gagal dan membenarkan pemulihan melalui retry. Walau bagaimanapun, dua penulisan pertama yang benar-benar serentak masih mempunyai tetingkap perlumbaan kecil. Penguncian kuat pada masa hadapan mungkin memerlukan Cloudflare Durable Objects atau D1.

Kontrak endpoint: [API.md](API.md). Peraturan data: [DATA_MODEL.md](DATA_MODEL.md).
