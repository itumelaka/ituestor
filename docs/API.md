# API ITU eSTOR

## Status

API pengeluaran ITU eSTOR kini **baca sahaja**. Hanya dua endpoint `GET` aktif. Frontend telah menggunakan Supabase Google Auth, tetapi Worker belum mengesahkan token atau menguatkuasakan pengguna dan peranan.

**Base URL**

```text
https://ituestor-api.itumelaka.workers.dev
```

## `GET /health`

Mengembalikan status asas Worker. Endpoint ini tidak membaca Google Sheets.

### Permintaan

```http
GET /health HTTP/1.1
Host: ituestor-api.itumelaka.workers.dev
```

### Respons berjaya

Status: `200 OK`

```json
{
  "service": "ITU eSTOR API",
  "status": "running",
  "environment": "production",
  "timestamp": "2026-07-29T06:30:00.000Z"
}
```

`timestamp` dijana semasa permintaan dan menggunakan format ISO 8601 UTC.

## `GET /api/items`

Mengesahkan akaun perkhidmatan Google, membaca julat `MASTER_ITEM!A:Z`, dan menukar setiap baris kepada objek inventori berstruktur.

Endpoint ini digunakan oleh frontend pengeluaran di <https://itumelaka.github.io/ituestor/>. CORS untuk origin `https://itumelaka.github.io` telah disahkan pada 29 Julai 2026.

### Permintaan

```http
GET /api/items HTTP/1.1
Host: ituestor-api.itumelaka.workers.dev
```

### Respons berjaya

Status: `200 OK`

Contoh ini menunjukkan satu item sahaja. Respons pengeluaran yang disahkan mengandungi `count: 130` dan 130 objek dalam `items`.

```json
{
  "success": true,
  "sheet": "MASTER_ITEM",
  "count": 130,
  "items": [
    {
      "itemId": "AT-0001",
      "kategori": "ALAT TULIS",
      "namaItem": "Contoh Item",
      "namaItemAsal": "CONTOH ITEM",
      "unit": "UNIT",
      "kosSeunit": 1.5,
      "stokAwal": 2,
      "stokMinimum": 0,
      "status": "AKTIF",
      "sumberTab": "ALAT TULIS",
      "sumberBaris": 2,
      "createdAt": "2026-07-29T00:00:00+08:00",
      "updatedAt": "2026-07-29T00:00:00+08:00"
    }
  ]
}
```

Item contoh di atas menerangkan bentuk respons sahaja dan bukan dakwaan bahawa nilai contoh tersebut ialah rekod tertentu dalam spreadsheet.

### Jenis medan item

| Medan | Jenis JSON | Catatan |
|---|---|---|
| `itemId` | string | ID item unik |
| `kategori` | string | Kategori inventori |
| `namaItem` | string | Nama dinormalisasi |
| `namaItemAsal` | string | Nama asal migrasi |
| `unit` | string | Unit atau kemasan |
| `kosSeunit` | number | Nilai RM tanpa simbol mata wang |
| `stokAwal` | number | Kuantiti awal migrasi |
| `stokMinimum` | number | Paras amaran; migrasi awal menggunakan 0 |
| `status` | string | Status item |
| `sumberTab` | string | Tab legasi asal |
| `sumberBaris` | number | Nombor baris fizikal sumber |
| `createdAt` | string | Timestamp migrasi/penciptaan |
| `updatedAt` | string | Timestamp kemas kini |

## Root `/` dan laluan tidak dikenali

Root tidak menyediakan laman atau metadata API. Ia mengembalikan `NOT_FOUND` secara reka bentuk.

### Respons

Status: `404 Not Found`

```json
{
  "error": "NOT_FOUND",
  "message": "Endpoint tidak ditemui."
}
```

Respons yang sama digunakan untuk kaedah atau laluan yang tidak sepadan dengan endpoint aktif.

## Ralat Google Sheets

Jika pengesahan Google atau bacaan spreadsheet gagal, `/api/items` mengembalikan:

Status: `500 Internal Server Error`

```json
{
  "success": false,
  "error": "GOOGLE_SHEETS_ERROR",
  "message": "Gagal membaca Google Sheet."
}
```

Medan `message` semasa boleh mengandungi butiran ralat dalaman yang dijana oleh Worker. Sebelum API dibuka lebih luas, respons pengeluaran disyorkan menggunakan mesej umum sahaja dan menyimpan butiran diagnostik dalam log Worker.

## Keselamatan dan batasan

- Endpoint `/api/items` belum memerlukan token atau sesi pengguna.
- Supabase Google Auth mengesahkan identiti pada frontend sahaja.
- Frontend belum menghantar bearer token Supabase kepada Worker.
- Worker belum mengesahkan token, membaca e-mel pengguna atau menyemaknya terhadap `USERS`.
- Kawalan akses berasaskan peranan belum aktif.
- API hanya membaca `MASTER_ITEM`; lima tab pengeluaran lain belum didedahkan.
- Tiada endpoint `POST`, `PUT`, `PATCH` atau `DELETE`.
- Tiada transaksi, permohonan, kelulusan atau perubahan stok boleh dilakukan melalui API.
- Akaun perkhidmatan Google menggunakan skop baca sahaja dan akses Viewer.
- Frontend GitHub Pages memanggil endpoint ini untuk statistik, carta kategori, status stok dan carian item.
- Nilai stok yang dipaparkan masih dikira daripada `stokAwal × kosSeunit`; lejar transaksi belum aktif.
- Modul permohonan dan transaksi dipaparkan sebagai `Belum aktif`.

## Milestone keselamatan API seterusnya

Sebelum mana-mana endpoint tulis diwujudkan:

1. frontend menghantar token akses Supabase sebagai bearer token;
2. Worker mengesahkan token dengan Supabase;
3. Worker mengambil e-mel daripada identiti yang telah disahkan;
4. Worker menyemak e-mel, status aktif dan peranan dalam tab `USERS`;
5. permintaan pengguna tidak tersenarai, tidak aktif atau tidak dibenarkan ditolak.

Barang Masuk, Barang Keluar, permohonan, kelulusan dan operasi tulis lain tidak boleh diaktifkan sebelum aliran ini lengkap serta diuji. Jangan hantar rahsia akaun perkhidmatan, kunci peribadi atau kandungan `.dev.vars` melalui mana-mana permintaan frontend.
