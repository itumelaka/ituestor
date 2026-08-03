# API ITU eSTOR

## Status produksi

**Base URL:** <https://ituestor-api.itumelaka.workers.dev>

**Version ID Worker — 3 Ogos 2026:**

```text
4465e0f1-4687-4e48-82a2-2e710e5b6dfc
```

Semua endpoint `/api/*` memerlukan token Supabase dan pengguna `USERS` yang aktif. `GET /health` sahaja bersifat awam.

## Pengesahan

```http
Authorization: Bearer <Supabase access token>
```

Worker mengesahkan token melalui Supabase `/auth/v1/user`, menormalkan e-mel, kemudian memadankannya dengan `EMAIL`, `STATUS = AKTIF` dan `ROLE` dalam `USERS!A:Z`. Metadata Google tidak digunakan sebagai bukti peranan.

## Matriks endpoint dan peranan

| Endpoint | SUPER_ADMIN | ADMIN_STOR | PEMBANTU_STOR | VIEWER |
|---|:---:|:---:|:---:|:---:|
| `GET /api/me` | Ya | Ya | Ya | Ya |
| `GET /api/items` | Ya | Ya | Ya | Ya |
| `POST /api/items` | Ya | Ya | Tidak | Tidak |
| `POST /api/transactions/in` | Ya | Ya | Ya | Tidak |
| `GET /api/transactions` | Ya | Ya | Ya | Ya |
| `POST /api/transactions/:transactionId/cancel` | Ya | Ya | Tidak | Tidak |

## `GET /health`

Endpoint awam untuk kesihatan Worker.

```json
{
  "service": "ITU eSTOR API",
  "status": "running",
  "environment": "production",
  "timestamp": "<ISO 8601 UTC>"
}
```

## `GET /api/me`

Mengembalikan identiti dan peranan aplikasi yang telah disahkan.

```json
{
  "success": true,
  "user": {
    "userId": "<USER_ID>",
    "nama": "<NAMA>",
    "email": "<EMAIL>",
    "role": "SUPER_ADMIN",
    "status": "AKTIF"
  }
}
```

## `GET /api/items`

Membaca `MASTER_ITEM` dan `TRANSACTIONS`. Hanya transaksi `STATUS = SAH` dikira.

Medan stok terhitung yang ditambah pada setiap item:

| Medan | Maksud |
|---|---|
| `jumlahMasuk` | Jumlah transaksi tambah yang sah |
| `jumlahKeluar` | Jumlah transaksi tolak yang sah |
| `stokSemasa` | `stokAwal + jumlahMasuk - jumlahKeluar` |
| `nilaiStokSemasa` | `stokSemasa × kosSeunit` |
| `statusStok` | `HABIS`, `RENDAH` atau `TERSEDIA` |

Status stok:

- `HABIS` apabila `stokSemasa <= 0`;
- `RENDAH` apabila `stokSemasa > 0` dan `stokSemasa <= stokMinimum`;
- `TERSEDIA` bagi keadaan lain.

Respons produksi semasa mempunyai `count: 130`. `MASTER_ITEM.STOK_AWAL` tidak diubah oleh transaksi.

## `POST /api/items`

Mendaftar item baharu. Hanya `SUPER_ADMIN` dan `ADMIN_STOR` dibenarkan.

Header tambahan:

```http
Idempotency-Key: <UUID>
Content-Type: application/json
```

Permintaan:

```json
{
  "kategori": "ALAT TULIS",
  "namaItem": "<nama item>",
  "unit": "UNIT",
  "kosSeunit": 0,
  "stokMinimum": 0
}
```

Worker:

- menjana `ITEM_ID` menggunakan `AT-`, `BK-`, `HH-` atau `LL-`;
- menetapkan `STOK_AWAL = 0`, `STATUS = AKTIF`, `SUMBER_TAB = NEW_ITEM` dan `SUMBER_BARIS = 0`;
- mengesan pendua berdasarkan kategori, nama dan unit yang dinormalisasi;
- menambah audit penciptaan;
- menggunakan kunci idempotensi untuk retry selamat.

Respons berjaya menggunakan status `201`, atau `200` bagi replay yang disahkan:

```json
{
  "success": true,
  "replayed": false,
  "item": {
    "itemId": "<ITEM_ID>",
    "kategori": "ALAT TULIS",
    "namaItem": "<nama item>",
    "unit": "UNIT",
    "kosSeunit": 0,
    "stokAwal": 0,
    "stokMinimum": 0,
    "status": "AKTIF"
  }
}
```

## `POST /api/transactions/in`

Merekod Barang Masuk. `SUPER_ADMIN`, `ADMIN_STOR` dan `PEMBANTU_STOR` dibenarkan; `VIEWER` ditolak.

Header `Idempotency-Key` UUID diperlukan. Permintaan frontend semasa:

```json
{
  "itemId": "<ITEM_ID>",
  "kuantiti": 1,
  "kosSeunit": 0,
  "catatan": ""
}
```

`catatan` ialah pilihan. Medan lama `pihakTerlibat`, `bahagian` dan `tujuan` masih diterima untuk keserasian klien lama tetapi tidak diwajibkan. Jika diabaikan, `PIHAK_TERLIBAT`, `BAHAGIAN` dan `TUJUAN` disimpan sebagai rentetan kosong; skema `TRANSACTIONS` tidak berubah.

Worker menetapkan `JENIS = MASUK`, `STATUS = SAH`, cap masa dan identiti pencipta, serta mengira `JUMLAH_NILAI`. Baris `TRANSACTIONS` dan `AUDIT_LOG` ditambah tanpa mengubah `MASTER_ITEM.STOK_AWAL`.

```json
{
  "success": true,
  "replayed": false,
  "transaction": {
    "transactionId": "<TRANSACTION_ID>",
    "itemId": "<ITEM_ID>",
    "jenis": "MASUK",
    "kuantiti": 1,
    "kosSeunit": 0,
    "jumlahNilai": 0,
    "pihakTerlibat": "",
    "bahagian": "",
    "tujuan": "",
    "catatan": "",
    "status": "SAH"
  }
}
```

## `GET /api/transactions`

Semua empat peranan sah boleh membaca sejarah transaksi. Respons disusun terbaru dahulu dan diperkaya dengan nama item, kategori serta unit daripada `MASTER_ITEM`. Rujukan item yang tidak lagi diketahui kekal dipaparkan dengan fallback selamat.

Parameter pilihan:

| Parameter | Fungsi |
|---|---|
| `search` | Carian ID transaksi, item, pencipta atau catatan |
| `status` | Penapis status tepat |
| `jenis` | Penapis jenis transaksi tepat |
| `itemId` | Penapis item tepat |
| `limit` | Had hasil; maksimum selamat 500 |

```json
{
  "success": true,
  "count": 1,
  "total": 1,
  "matched": 1,
  "limit": 200,
  "summary": {
    "todaySah": 1
  },
  "transactions": [
    {
      "transactionId": "<TRANSACTION_ID>",
      "timestamp": "<ISO 8601>",
      "itemId": "<ITEM_ID>",
      "itemName": "<nama item>",
      "kategori": "<kategori>",
      "unit": "<unit>",
      "jenis": "MASUK",
      "kuantiti": 1,
      "jumlahNilai": 0,
      "createdByName": "<nama>",
      "createdByEmail": "<e-mel>",
      "status": "SAH"
    }
  ]
}
```

`summary.todaySah` menggunakan zon `Asia/Kuala_Lumpur` dan mengecualikan transaksi `DIBATALKAN`.

## `POST /api/transactions/:transactionId/cancel`

Hanya `SUPER_ADMIN` dan `ADMIN_STOR` boleh membatalkan transaksi `SAH`.

```json
{
  "sebab": "Sebab pembatalan sekurang-kurangnya 5 aksara"
}
```

Worker tidak memadam baris. Hanya sel `STATUS` ditukar kepada `DIBATALKAN`; medan transaksi lain dikekalkan. Audit `ACTION = CANCEL`, `MODULE = TRANSACTION` menyimpan ringkasan sebelum/selepas dan sebab pembatalan.

```json
{
  "success": true,
  "replayed": false,
  "transaction": {
    "transactionId": "<TRANSACTION_ID>",
    "itemId": "<ITEM_ID>",
    "jenis": "MASUK",
    "kuantiti": 1,
    "kosSeunit": 0,
    "jumlahNilai": 0,
    "status": "DIBATALKAN",
    "cancelledByEmail": "<e-mel>",
    "cancelledByName": "<nama>",
    "sebab": "<sebab>"
  }
}
```

Retry dengan sebab yang sama boleh mengembalikan `replayed: true`. Jika status telah berubah tetapi audit belum berjaya ditambah, retry memulihkan audit sebelum melaporkan kejayaan. Sebab berbeza selepas pembatalan lengkap tidak menghasilkan audit kedua.

## Respons ralat utama

| Status | Kod | Keadaan |
|---:|---|---|
| `400` | `INVALID_JSON` | Badan JSON tidak sah |
| `400` | `VALIDATION_ERROR` | Input tidak memenuhi peraturan |
| `400` | `INVALID_IDEMPOTENCY_KEY` | UUID idempotensi tiada/tidak sah |
| `401` | `AUTH_REQUIRED` | Header bearer tiada |
| `401` | `INVALID_TOKEN` | Token tidak sah atau tamat |
| `403` | `USER_NOT_REGISTERED` | E-mel tiada dalam `USERS` |
| `403` | `USER_INACTIVE` | Pengguna bukan `AKTIF` |
| `403` | `ROLE_NOT_ALLOWED` | Peranan tidak dibenarkan untuk operasi |
| `404` | `ITEM_NOT_FOUND` | Item tidak ditemui |
| `404` | `TRANSACTION_NOT_FOUND` | Transaksi tidak ditemui |
| `409` | `ITEM_ALREADY_EXISTS` | Item ternormalisasi telah wujud |
| `409` | `IDEMPOTENCY_CONFLICT` | Kunci digunakan bagi payload berbeza |
| `409` | `TRANSACTION_ALREADY_CANCELLED` | Transaksi telah dibatalkan |
| `409` | `TRANSACTION_NOT_CANCELLABLE` | Status bukan `SAH` |
| `409` | `CANCELLATION_CONFLICT` | Perubahan serentak dikesan |
| `500` | `WRITE_FAILED` | Penulisan atau audit tidak dapat disahkan |

Respons tidak mendedahkan token, respons mentah pembekal atau stack trace.

## Konsistensi dan idempotensi

Google Sheets tidak menyediakan transaksi atomik merentas kemas kini status dan append audit. Worker tidak melaporkan kejayaan apabila audit gagal dan menyediakan pemulihan retry dengan ID audit deterministik. Tetingkap perlumbaan kecil masih wujud bagi penulisan pertama yang benar-benar serentak; penguncian kuat pada masa hadapan mungkin menggunakan Durable Objects atau D1.

Tiada endpoint pemadaman fizikal transaksi. Kaedah atau laluan lain yang tidak disokong mengembalikan `404 NOT_FOUND`.

## Ujian

- Suite Barang Masuk ringkas: **68/68 lulus**.
- Suite akhir sejarah dan pembatalan transaksi: **82/82 lulus**.
- Semua panggilan Supabase dan Google Sheets dalam ujian menggunakan mock; tiada rangkaian atau penulisan produksi.
