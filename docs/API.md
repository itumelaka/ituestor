# API ITU eSTOR

## Status produksi

API produksi ITU eSTOR ialah API baca sahaja yang dilindungi oleh Supabase Auth dan rekod kebenaran dalam Google Sheets `USERS`.

**Base URL**

```text
https://ituestor-api.itumelaka.workers.dev
```

**Version ID produksi — 30 Julai 2026**

```text
e369d89f-6be3-46a0-a312-7a145aeb602f
```

## Pengesahan dan kebenaran

Endpoint dilindungi memerlukan header:

```http
Authorization: Bearer <Supabase access token>
```

Aliran server:

1. Worker menghantar token ke endpoint rasmi Supabase `/auth/v1/user`.
2. Worker hanya menggunakan identiti yang berjaya disahkan.
3. E-mel pengguna ditrim dan ditukar kepada huruf kecil.
4. Worker membaca `USERS!A:Z` melalui aliran akaun perkhidmatan Google sedia ada.
5. Baris `USERS` dipetakan menggunakan nama header, bukan kedudukan lajur.
6. Akses diberikan hanya jika e-mel sepadan tepat, `STATUS = AKTIF`, dan `ROLE` dibenarkan.

Peranan yang dibenarkan membaca endpoint semasa:

- `SUPER_ADMIN`
- `ADMIN_STOR`
- `PEMBANTU_STOR`
- `VIEWER`

Token atau metadata profil Google tidak memberikan peranan secara automatik.

## `GET /health`

Endpoint awam untuk status asas Worker. Ia tidak memerlukan token dan tidak membaca Google Sheets.

### Respons produksi disahkan

Status: `200 OK`

```json
{
  "service": "ITU eSTOR API",
  "status": "running",
  "environment": "production",
  "timestamp": "<ISO 8601 UTC>"
}
```

## `GET /api/me`

Endpoint dilindungi yang mengembalikan identiti aplikasi selepas token Supabase dan rekod `USERS` berjaya disahkan. Frontend memanggil endpoint ini sebelum memuatkan inventori.

### Permintaan

```http
GET /api/me HTTP/1.1
Host: ituestor-api.itumelaka.workers.dev
Authorization: Bearer <Supabase access token>
```

### Respons berjaya

Status: `200 OK`

```json
{
  "success": true,
  "user": {
    "userId": "<ID pengguna>",
    "nama": "ITU Melaka",
    "email": "itumelaka@gmail.com",
    "role": "SUPER_ADMIN",
    "status": "AKTIF"
  }
}
```

Respons ini digunakan untuk nama paparan rasmi dan peranan aplikasi. Ia tidak mengembalikan token atau rahsia.

## `GET /api/items`

Endpoint dilindungi yang membaca `MASTER_ITEM!A:Z` selepas kebenaran pengguna berjaya. Semua empat peranan sah boleh membaca item.

### Permintaan

```http
GET /api/items HTTP/1.1
Host: ituestor-api.itumelaka.workers.dev
Authorization: Bearer <Supabase access token>
```

### Respons berjaya

Status: `200 OK`

Respons produksi disahkan mengandungi `count: 130` dan 130 objek dalam `items`.

```json
{
  "success": true,
  "sheet": "MASTER_ITEM",
  "count": 130,
  "items": [
    {
      "itemId": "<ITEM_ID>",
      "kategori": "<KATEGORI>",
      "namaItem": "<NAMA_ITEM>",
      "namaItemAsal": "<NAMA_ITEM_ASAL>",
      "unit": "<UNIT>",
      "kosSeunit": 0,
      "stokAwal": 0,
      "stokMinimum": 0,
      "status": "AKTIF",
      "sumberTab": "<SUMBER_TAB>",
      "sumberBaris": 0,
      "createdAt": "<CREATED_AT>",
      "updatedAt": "<UPDATED_AT>"
    }
  ]
}
```

Nilai contoh menerangkan bentuk respons sahaja dan bukan rekod inventori tertentu.

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
| `stokMinimum` | number | Paras amaran |
| `status` | string | Status rekod item |
| `sumberTab` | string | Tab legasi asal |
| `sumberBaris` | number | Nombor baris fizikal sumber |
| `createdAt` | string | Cap masa penciptaan |
| `updatedAt` | string | Cap masa kemas kini |

## Respons ralat pengesahan

### Token tiada

Respons produksi disahkan untuk `/api/me` dan `/api/items`:

Status: `401 Unauthorized`

```json
{
  "success": false,
  "error": "AUTH_REQUIRED",
  "message": "Log masuk diperlukan."
}
```

### Token tidak sah atau tamat

Status: `401 Unauthorized`

```json
{
  "success": false,
  "error": "INVALID_TOKEN",
  "message": "Sesi tidak sah atau telah tamat."
}
```

### Kebenaran pengguna ditolak

| Status | Kod | Keadaan |
|---:|---|---|
| `403` | `EMAIL_REQUIRED` | Identiti yang disahkan tiada e-mel yang boleh digunakan |
| `403` | `USER_NOT_REGISTERED` | E-mel tiada dalam `USERS` |
| `403` | `USER_INACTIVE` | `STATUS` bukan `AKTIF` |
| `403` | `ROLE_NOT_ALLOWED` | `ROLE` bukan salah satu peranan yang dibenarkan |

Respons tidak mendedahkan token, respons mentah pembekal atau stack trace.

## CORS

Origin frontend produksi `https://itumelaka.github.io` dibenarkan. Kaedah semasa ialah `GET` dan `OPTIONS`, dan `Access-Control-Allow-Headers` merangkumi `Authorization`.

## Ujian Worker

Pada 30 Julai 2026, **19 daripada 19** ujian lulus. Liputan merangkumi:

- health awam;
- token tiada dan token tidak sah;
- akses sah ke `/api/me` dan `/api/items`;
- pengguna tidak aktif;
- pengguna tidak berdaftar;
- peranan tidak sah;
- transformasi 130 item;
- CORS dan respons ralat selamat.

Semua panggilan Supabase dan Google Sheets dalam ujian menggunakan mock; tiada token sebenar atau rangkaian produksi digunakan.

## Laluan lain dan batasan

Laluan atau kaedah yang tidak disokong mengembalikan `404 NOT_FOUND`.

Tiada endpoint `POST`, `PUT`, `PATCH` atau `DELETE`. Barang Masuk, Barang Keluar, Permohonan, Kelulusan, Audit Log, pengurusan pengguna dan operasi tulis belum tersedia. Nilai stok dashboard masih berdasarkan `STOK_AWAL × KOS_SEUNIT`; pengiraan daripada `TRANSACTIONS` belum aktif.
