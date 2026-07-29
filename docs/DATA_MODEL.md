# Model Data Pengeluaran ITU eSTOR

## 1. Tujuan dan skop

Dokumen ini mentakrifkan model data pengeluaran untuk ITU eSTOR, sistem pengurusan stok dan bekalan Institut Teknologi Unggas. Data disimpan sebagai tab Google Sheets Native dalam spreadsheet yang sama dengan empat tab legasi:

- `ALAT TULIS`
- `BAHAN KIMIA`
- `HOUSE HOLD`
- `LAIN-LAIN`

Empat tab tersebut ialah sumber migrasi sejarah dan **tidak boleh dipadam, dinamakan semula atau ditulis ganti**. Tab pengeluaran akan ditambah kemudian dan diakses melalui Cloudflare Worker. GitHub Pages tidak boleh membaca atau mengubah Google Sheet secara terus. Supabase Google Auth mengesahkan identiti pengguna, manakala Cloudflare Worker menguatkuasakan peranan dan peraturan data.

Semua cap masa menggunakan zon `Asia/Kuala_Lumpur`, mata wang ialah Ringgit Malaysia (RM), dan alamat e-mel disimpan dalam huruf kecil.

## 2. Prinsip teras

1. `MASTER_ITEM` menyimpan definisi item, bukan baki stok yang boleh diedit.
2. Stok semasa dikira daripada `STOK_AWAL` dan transaksi berstatus sah.
3. Baris transaksi yang telah dimuktamadkan tidak boleh diubah atau dipadam.
4. Pembetulan transaksi dibuat melalui transaksi pelarasan baharu.
5. Rekod operasi menggunakan *soft deletion* melalui `STATUS`, bukan pemadaman fizikal.
6. Semua tindakan penting mesti boleh dijejaki melalui `AUDIT_LOG`.
7. Nilai asal migrasi mesti kekal boleh dirujuk melalui medan sumber.

Formula konseptual stok semasa:

```text
STOK_SEMASA =
  STOK_AWAL
  + MASUK
  + PELARASAN_TAMBAH
  + PULANGAN
  - KELUAR
  - PELARASAN_TOLAK
  - ROSAK_LUPUS
```

Hanya transaksi dengan `STATUS = SAH` diambil kira. Kuantiti disimpan sebagai nombor positif; kesan tambah atau tolak ditentukan oleh `JENIS`.

## 3. Ringkasan hubungan

```text
MASTER_ITEM 1 ─── * TRANSACTIONS
MASTER_ITEM 1 ─── * REQUESTS
USERS       1 ─── * TRANSACTIONS
USERS       1 ─── * REQUESTS
USERS       1 ─── * AUDIT_LOG
USERS       1 ─── * SETTINGS (kemas kini)
REQUESTS    1 ─── 0..* TRANSACTIONS
```

Hubungan dilaksanakan secara logik menggunakan ID dan e-mel kerana Google Sheets tidak menyediakan kekangan *foreign key* asli. Cloudflare Worker wajib mengesahkan rujukan sebelum menulis data.

---

## 4. `MASTER_ITEM`

### Tujuan

Menyimpan rekod induk bagi setiap item yang unik, termasuk nilai asal migrasi dan rujukan kembali kepada tab legasi.

| Lajur | Jenis / nilai | Wajib | Peraturan dan catatan |
|---|---|---:|---|
| `ITEM_ID` | Teks | Ya | ID unik dan kekal, contoh `AT-0001`. Tidak boleh digunakan semula. |
| `KATEGORI` | Enum | Ya | `ALAT TULIS`, `BAHAN KIMIA`, `HOUSE HOLD`, `LAIN-LAIN`. |
| `NAMA_ITEM` | Teks | Ya | Nama dinormalisasi; tidak boleh kosong. |
| `NAMA_ITEM_ASAL` | Teks | Ya bagi migrasi | Nilai `ITEM` legasi tanpa pembetulan makna; untuk audit. |
| `UNIT` | Teks | Ya | Unit atau kemasan, contoh `KOTAK`, `BOTOL`, `UNIT`. |
| `KOS_SEUNIT` | Decimal | Ya | Nilai RM, minimum `0.00`, maksimum dua tempat perpuluhan. |
| `STOK_AWAL` | Decimal | Ya | Baki pada masa migrasi, minimum `0`; ketepatan mengikut unit. |
| `STOK_MINIMUM` | Decimal | Ya | Lalai `0`; minimum `0`. |
| `STATUS` | Enum | Ya | `AKTIF`, `TIDAK_AKTIF`, `DIARKIBKAN`. Migrasi awal menggunakan `AKTIF`. |
| `SUMBER_TAB` | Teks | Ya bagi migrasi | Nama tab legasi asal. |
| `SUMBER_BARIS` | Integer | Ya bagi migrasi | Nombor baris fizikal dalam tab sumber, bukan nilai `BIL`. |
| `CREATED_AT` | Timestamp | Ya | Masa migrasi/penciptaan dalam format ISO 8601. |
| `UPDATED_AT` | Timestamp | Ya | Masa kemas kini terakhir; sama dengan `CREATED_AT` semasa migrasi. |

### Awalan kategori

| Kategori | Awalan | Contoh |
|---|---|---|
| `ALAT TULIS` | `AT` | `AT-0001` |
| `BAHAN KIMIA` | `BK` | `BK-0001` |
| `HOUSE HOLD` | `HH` | `HH-0001` |
| `LAIN-LAIN` | `LL` | `LL-0001` |

### Validasi dan hubungan

- `ITEM_ID` mesti unik secara global.
- Gabungan `SUMBER_TAB` + `SUMBER_BARIS` mesti unik bagi rekod migrasi.
- `KATEGORI` mesti sepadan dengan awalan `ITEM_ID`.
- `KOS_SEUNIT`, `STOK_AWAL` dan `STOK_MINIMUM` mesti bernombor dan bukan negatif.
- Item yang pernah digunakan oleh transaksi atau permohonan tidak boleh dipadam; tukar `STATUS`.
- Dirujuk oleh `TRANSACTIONS.ITEM_ID` dan `REQUESTS.ITEM_ID`.

---

## 5. `TRANSACTIONS`

### Tujuan

Menyimpan setiap pergerakan stok sebagai lejar yang tidak boleh diubah selepas dimuktamadkan.

| Lajur | Jenis / nilai | Wajib | Peraturan dan catatan |
|---|---|---:|---|
| `TRANSACTION_ID` | Teks | Ya | ID unik, contoh `TXN-20260729-000001`. |
| `TIMESTAMP` | Timestamp | Ya | Masa transaksi dalam `Asia/Kuala_Lumpur`. |
| `ITEM_ID` | Teks | Ya | Mesti wujud dan aktif dalam `MASTER_ITEM`. |
| `JENIS` | Enum | Ya | Lihat senarai jenis di bawah. |
| `KUANTITI` | Decimal | Ya | Mesti lebih besar daripada `0`; sentiasa positif. |
| `KOS_SEUNIT` | Decimal | Ya | Kos seunit semasa transaksi, minimum `0.00`. |
| `JUMLAH_NILAI` | Decimal | Ya | `KUANTITI × KOS_SEUNIT`, maksimum dua tempat perpuluhan. |
| `PIHAK_TERLIBAT` | Teks | Tidak | Pembekal, penerima atau pihak berkaitan. |
| `BAHAGIAN` | Teks | Tidak | Bahagian/unit organisasi berkaitan. |
| `TUJUAN` | Teks | Tidak | Tujuan penggunaan atau penerimaan. |
| `CATATAN` | Teks | Tidak | Maklumat tambahan; tidak menggantikan data berstruktur. |
| `CREATED_BY_EMAIL` | E-mel | Ya | E-mel pengguna dalam huruf kecil; mesti dibenarkan. |
| `CREATED_BY_NAME` | Teks | Ya | Nama paparan ketika transaksi dibuat. |
| `STATUS` | Enum | Ya | `DRAF`, `SAH`, `DIBATALKAN`. Hanya `SAH` mengubah stok. |

Jenis transaksi yang dibenarkan:

- `MASUK`
- `KELUAR`
- `PELARASAN_TAMBAH`
- `PELARASAN_TOLAK`
- `PULANGAN`
- `ROSAK_LUPUS`

### Validasi dan hubungan

- Baris berstatus `SAH` bersifat *immutable*.
- Pembatalan tidak memadam baris; tandakan `DIBATALKAN` dan rekodkan sebab dalam audit.
- `KELUAR`, `PELARASAN_TOLAK` dan `ROSAK_LUPUS` tidak boleh menyebabkan stok negatif.
- `JUMLAH_NILAI` dikira oleh backend, bukan dipercayai daripada input klien.
- `ITEM_ID` merujuk `MASTER_ITEM`; `CREATED_BY_EMAIL` merujuk pengguna aktif.
- Jika transaksi memenuhi permohonan, ID permohonan boleh direkodkan pada versi lanjutan sebagai `REQUEST_ID`.

---

## 6. `USERS`

### Tujuan

Menyimpan profil dan peranan pengguna yang dibenarkan mengakses ITU eSTOR.

| Lajur | Jenis / nilai | Wajib | Peraturan dan catatan |
|---|---|---:|---|
| `USER_ID` | Teks | Ya | ID unik dalaman, contoh `USR-000001`; boleh dipautkan kepada ID Supabase. |
| `NAMA` | Teks | Ya | Nama paparan rasmi. |
| `EMAIL` | E-mel | Ya | Unik, ditrim dan ditukar kepada huruf kecil. |
| `ROLE` | Enum | Ya | `SUPER_ADMIN`, `ADMIN_STOR`, `PEMBANTU_STOR`, `VIEWER`. |
| `STATUS` | Enum | Ya | `AKTIF`, `DIGANTUNG`, `TIDAK_AKTIF`. |
| `CREATED_AT` | Timestamp | Ya | Masa pengguna didaftarkan. |
| `UPDATED_AT` | Timestamp | Ya | Masa perubahan terakhir. |

Rekod pentadbir awal:

```text
NAMA: ITU Melaka
EMAIL: itumelaka@gmail.com
ROLE: SUPER_ADMIN
STATUS: AKTIF
```

### Validasi dan hubungan

- Pengesahan Google melalui Supabase tidak secara automatik memberi akses aplikasi.
- E-mel mesti wujud dalam `USERS` dan berstatus `AKTIF`.
- Hanya `SUPER_ADMIN` boleh mengubah peranan dan tetapan kritikal.
- E-mel pengguna dirujuk oleh transaksi, permohonan, audit dan tetapan.

---

## 7. `REQUESTS`

### Tujuan

Menyimpan permohonan pengeluaran item dan kitaran kelulusan sehingga penyerahan.

| Lajur | Jenis / nilai | Wajib | Peraturan dan catatan |
|---|---|---:|---|
| `REQUEST_ID` | Teks | Ya | ID unik, contoh `REQ-20260729-000001`. |
| `TIMESTAMP` | Timestamp | Ya | Masa permohonan dihantar. |
| `PEMOHON_EMAIL` | E-mel | Ya | Huruf kecil; pemohon yang sah. |
| `PEMOHON_NAMA` | Teks | Ya | Nama pemohon ketika rekod dibuat. |
| `BAHAGIAN` | Teks | Ya | Bahagian/unit pemohon. |
| `ITEM_ID` | Teks | Ya | Item aktif dalam `MASTER_ITEM`. |
| `KUANTITI` | Decimal | Ya | Lebih besar daripada `0`. |
| `TUJUAN` | Teks | Ya | Tujuan permohonan. |
| `STATUS` | Enum | Ya | Lihat senarai status di bawah. |
| `APPROVED_BY` | E-mel | Bersyarat | Wajib apabila diluluskan atau ditolak. |
| `APPROVED_AT` | Timestamp | Bersyarat | Wajib apabila diluluskan atau ditolak. |
| `FULFILLED_AT` | Timestamp | Bersyarat | Wajib apabila `DISERAHKAN`. |
| `CATATAN` | Teks | Tidak | Sebab penolakan, pembatalan atau catatan penyerahan. |

Status yang dibenarkan:

- `MENUNGGU`
- `DILULUSKAN`
- `DITOLAK`
- `DISERAHKAN`
- `DIBATALKAN`

### Validasi dan hubungan

- Aliran biasa: `MENUNGGU` → `DILULUSKAN` → `DISERAHKAN`.
- `MENUNGGU` boleh menjadi `DITOLAK` atau `DIBATALKAN`.
- Penyerahan mesti menghasilkan transaksi `KELUAR` yang berasingan.
- Kelulusan tidak mengurangkan stok; hanya transaksi berstatus `SAH` berbuat demikian.
- `ITEM_ID` merujuk `MASTER_ITEM`; identiti pemohon dan pelulus berkaitan `USERS`.

---

## 8. `AUDIT_LOG`

### Tujuan

Merekodkan tindakan keselamatan dan perubahan data penting secara tambah sahaja (*append-only*).

| Lajur | Jenis / nilai | Wajib | Peraturan dan catatan |
|---|---|---:|---|
| `AUDIT_ID` | Teks | Ya | ID unik, contoh `AUD-20260729-000001`. |
| `TIMESTAMP` | Timestamp | Ya | Masa tindakan berlaku. |
| `USER_EMAIL` | E-mel | Ya | Pengguna yang melakukan tindakan. |
| `USER_NAME` | Teks | Ya | Nama paparan ketika tindakan berlaku. |
| `ACTION` | Teks/Enum | Ya | Contoh `CREATE`, `UPDATE`, `APPROVE`, `CANCEL`, `LOGIN_DENIED`. |
| `MODULE` | Teks/Enum | Ya | Contoh `ITEM`, `TRANSACTION`, `USER`, `REQUEST`, `SETTING`. |
| `RECORD_ID` | Teks | Bersyarat | ID rekod terlibat; boleh kosong untuk peristiwa sistem. |
| `BEFORE_JSON` | JSON sebagai teks | Tidak | Keadaan sebelum perubahan; tapis rahsia dan data sensitif. |
| `AFTER_JSON` | JSON sebagai teks | Tidak | Keadaan selepas perubahan; tapis rahsia dan data sensitif. |
| `DEVICE_ID` | Teks | Tidak | Pengecam peranti yang tidak mendedahkan data peribadi mentah. |
| `IP_HASH` | Teks | Tidak | Hash IP; jangan simpan alamat IP mentah. |
| `CATATAN` | Teks | Tidak | Sebab atau konteks tambahan. |

### Validasi dan hubungan

- Log tidak boleh dikemas kini atau dipadam melalui API biasa.
- Semua ciptaan, kemas kini, perubahan status, kelulusan, pelarasan dan perubahan peranan mesti dilog.
- `BEFORE_JSON` dan `AFTER_JSON` mestilah JSON yang sah jika diisi.
- Jangan log token, kata laluan, rahsia, *session cookie* atau data OAuth.

---

## 9. `SETTINGS`

### Tujuan

Menyimpan konfigurasi ringkas aplikasi dalam bentuk pasangan kunci-nilai.

| Lajur | Jenis / nilai | Wajib | Peraturan dan catatan |
|---|---|---:|---|
| `SETTING_KEY` | Teks | Ya | Kunci unik huruf besar dan garis bawah, contoh `ORGANISATION_NAME`. |
| `SETTING_VALUE` | Teks/JSON | Ya | Nilai konfigurasi; tafsiran jenis dibuat oleh backend. |
| `DESCRIPTION` | Teks | Ya | Tujuan dan format nilai. |
| `UPDATED_AT` | Timestamp | Ya | Masa perubahan terakhir. |
| `UPDATED_BY` | E-mel | Ya | Pentadbir yang membuat perubahan. |

### Validasi dan hubungan

- Hanya kunci dalam senarai yang dibenarkan boleh ditulis.
- Tetapan keselamatan, token dan rahsia tidak boleh disimpan di Google Sheets.
- Perubahan mesti direkodkan dalam `AUDIT_LOG`.
- Kemas kini tetapan kritikal dihadkan kepada `SUPER_ADMIN`.

---

## 10. Piawaian merentas tab

### ID unik

- Jana ID pada Cloudflare Worker, bukan dalam pelayar.
- Gunakan format yang mudah dibaca dan tidak bercanggah ketika permintaan serentak.
- ID tidak berubah walaupun nama, kategori atau status rekod berubah.
- Simpan kaunter/strategi penjanaan secara atomik di backend; jangan bergantung pada nombor baris semasa.

### Cap masa

- Format disyorkan: ISO 8601 dengan ofset Malaysia, contoh `2026-07-29T14:35:12+08:00`.
- Semua paparan dan pengiraan tarikh menggunakan `Asia/Kuala_Lumpur`.
- Backend menjana cap masa; input klien tidak dipercayai sebagai masa rasmi.

### Nombor dan mata wang

- Simpan nombor sebagai nilai numerik Google Sheets, bukan teks berformat `RM`.
- `KOS_SEUNIT` dan `JUMLAH_NILAI` menggunakan maksimum dua tempat perpuluhan.
- Kuantiti boleh mempunyai perpuluhan hanya jika unit item membenarkannya.
- Tolak nilai `NaN`, kosong, negatif atau format bercampur yang tidak dapat ditafsirkan.

### Akses berasaskan peranan

| Tindakan | SUPER_ADMIN | ADMIN_STOR | PEMBANTU_STOR | VIEWER |
|---|:---:|:---:|:---:|:---:|
| Lihat stok/laporan | Ya | Ya | Ya | Ya |
| Daftar/kemas kini item | Ya | Ya | Terhad | Tidak |
| Cipta transaksi | Ya | Ya | Ya | Tidak |
| Sahkan/pelarasan transaksi | Ya | Ya | Terhad | Tidak |
| Lulus permohonan | Ya | Ya | Tidak | Tidak |
| Urus pengguna/peranan | Ya | Tidak | Tidak | Tidak |
| Ubah tetapan kritikal | Ya | Tidak | Tidak | Tidak |

Matriks akhir perlu dikuatkuasakan dalam Cloudflare Worker dan diuji untuk setiap endpoint.

### Larangan suntingan stok terus

- Jangan wujudkan medan `STOK_SEMASA` yang boleh disunting dalam `MASTER_ITEM`.
- Paparan stok semasa ialah hasil kiraan lejar.
- Sebarang perbezaan stok fizikal direkodkan sebagai `PELARASAN_TAMBAH` atau `PELARASAN_TOLAK` bersama sebab dan audit.

### Jejak audit minimum

Audit diwajibkan untuk:

- penciptaan atau perubahan item;
- pengaktifan, penyahaktifan atau arkib item;
- penciptaan, pengesahan atau pembatalan transaksi;
- perubahan status permohonan;
- perubahan pengguna dan peranan;
- perubahan tetapan;
- cubaan akses yang ditolak bagi tindakan sensitif.

## 11. Urutan pelaksanaan disyorkan

1. Lindungi dan sandarkan empat tab legasi.
2. Tambah `MASTER_ITEM` dan migrasikan data mengikut `SPREADSHEET_MAPPING.md`.
3. Rekonsiliasi 130 item dan nilai sumber.
4. Tambah `USERS` dengan akaun `ITU Melaka`.
5. Tambah `TRANSACTIONS`, kemudian sahkan pengiraan stok.
6. Tambah `REQUESTS`, `AUDIT_LOG` dan `SETTINGS`.
7. Hadkan semua operasi tulis kepada Cloudflare Worker.
8. Aktifkan integrasi frontend hanya selepas validasi dan ujian akses selesai.
