# Model Data Pengeluaran ITU eSTOR

## 1. Tujuan dan skop

Dokumen ini mentakrifkan model data pengeluaran untuk ITU eSTOR, sistem pengurusan stok dan bekalan Institut Teknologi Unggas. Data disimpan sebagai tab Google Sheets Native dalam spreadsheet yang sama dengan empat tab legasi:

- `ALAT TULIS`
- `BAHAN KIMIA`
- `HOUSE HOLD`
- `LAIN-LAIN`

Empat tab tersebut ialah sumber migrasi sejarah dan **tidak boleh dipadam, dinamakan semula atau ditulis ganti**.

Enam tab pengeluaran kini telah diwujudkan dalam spreadsheet yang sama:

- `MASTER_ITEM`
- `TRANSACTIONS`
- `USERS`
- `REQUESTS`
- `AUDIT_LOG`
- `SETTINGS`

Migrasi `MASTER_ITEM` telah selesai dengan 130 rekod produksi yang direkonsiliasi. `GET /api/items` membaca `MASTER_ITEM` dan `TRANSACTIONS` untuk menghasilkan baki semasa. `TRANSACTIONS` menyokong Barang Masuk, sejarah dan pembatalan, manakala `AUDIT_LOG` menerima audit penciptaan item, transaksi dan pembatalan. `USERS` dibaca secara dalaman untuk kebenaran dan tidak didedahkan sebagai senarai pengguna.

GitHub Pages tidak membaca atau mengubah Google Sheet secara terus. Worker produksi mengesahkan token Supabase, menormalkan e-mel, dan memadankannya dengan `EMAIL`, `STATUS` serta `ROLE` dalam `USERS`. Sejak 3 Ogos 2026, operasi item dan transaksi yang aktif turut dikuatkuasakan mengikut peranan khusus.

Semua cap masa menggunakan zon `Asia/Kuala_Lumpur`, mata wang ialah Ringgit Malaysia (RM), dan alamat e-mel disimpan dalam huruf kecil.

## 2. Prinsip teras

1. `MASTER_ITEM` menyimpan definisi item dan stok awal migrasi, bukan baki stok semasa yang boleh diedit.
2. Stok semasa dikira daripada `STOK_AWAL` dan transaksi berstatus `SAH`.
3. Baris transaksi yang telah dimuktamadkan tidak boleh dipadam. Pembatalan terkawal hanya mengubah sel `STATUS` kepada `DIBATALKAN`.
4. Pembetulan lain dibuat melalui transaksi pelarasan baharu.
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

Hanya transaksi dengan `STATUS = SAH` diambil kira. Kuantiti disimpan sebagai nombor positif; kesan tambah atau tolak ditentukan oleh `JENIS`. Transaksi `DIBATALKAN` kekal dalam lejar tetapi kesannya dikeluarkan daripada pengiraan.

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

- Baris berstatus `SAH` tidak boleh disunting secara umum. Endpoint pembatalan khusus hanya dibenarkan mengubah sel `STATUS`.
- Pembatalan tidak memadam baris; `STATUS` ditukar kepada `DIBATALKAN` dan sebab direkodkan dalam audit `CANCEL / TRANSACTION`.
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
- Nama, e-mel dan imej profil daripada Google ialah identiti, bukan bukti peranan aplikasi.
- Worker mengesahkan token melalui Supabase sebelum membaca rekod `USERS`.
- E-mel yang telah disahkan dinormalkan dengan `trim()` dan huruf kecil sebelum padanan tepat.
- E-mel mesti wujud dalam `USERS`, berstatus `AKTIF`, dan mempunyai salah satu peranan yang dibenarkan.
- Pengguna tidak berdaftar, tidak aktif atau mempunyai peranan tidak sah ditolak sebelum data inventori dibaca.
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
| Lihat profil, item dan transaksi | Ya | Ya | Ya | Ya |
| Daftar item baharu | Ya | Ya | Tidak | Tidak |
| Rekod Barang Masuk / Tambah Stok | Ya | Ya | Ya | Tidak |
| Batalkan transaksi `SAH` | Ya | Ya | Tidak | Tidak |
| Barang Keluar | Belum aktif | Belum aktif | Belum aktif | Belum aktif |
| Lulus permohonan | Belum aktif | Belum aktif | Belum aktif | Belum aktif |
| Urus pengguna/peranan | Belum aktif | Belum aktif | Belum aktif | Belum aktif |
| Ubah tetapan kritikal | Belum aktif | Belum aktif | Belum aktif | Belum aktif |

Kebenaran di atas dikuatkuasakan oleh Worker selepas pengesahan token, `STATUS = AKTIF` dan padanan peranan. Baris `Belum aktif` bukan kebenaran tersirat dan tidak boleh dilaksanakan tanpa endpoint, validasi, audit dan ujian khusus.

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

## 11. Konsistensi penulisan Google Sheets

Penciptaan item dan Barang Masuk menggunakan kunci idempotensi untuk retry selamat. Pembatalan transaksi menggunakan ID audit deterministik supaya cubaan semula boleh melengkapkan audit apabila sel `STATUS` telah berubah tetapi append audit sebelumnya gagal.

Google Sheets tidak menyediakan transaksi atomik merentas dua tab. Oleh itu:

- Worker tidak melaporkan kejayaan jika audit wajib gagal;
- retry membaca semula keadaan semasa dan memulihkan audit yang hilang;
- penulisan pertama yang benar-benar serentak masih mempunyai tetingkap perlumbaan kecil;
- penguncian kuat pada masa hadapan mungkin memerlukan Cloudflare Durable Objects atau D1.

## 12. Peralihan operasi tab legasi

ITU eSTOR belum dilepaskan secara rasmi kepada pegawai stor. Sebelum go-live:

1. operasi diteruskan pada `BAHAN KIMIA`, `ALAT TULIS`, `HOUSE HOLD` dan `LAIN-LAIN`;
2. hentikan kemas kini tab legasi sementara ketika rekonsiliasi akhir;
3. selaras item baharu dan baki terkini;
4. sahkan jumlah item, baki serta nilai stok;
5. tetapkan tarikh go-live rasmi.

Selepas go-live, ITU eSTOR menjadi sistem operasi tunggal. Empat tab legasi menjadi rujukan baca sahaja/arkib. Kemasukan berganda antara tab legasi dan eSTOR mesti dielakkan.

## 13. Status pelaksanaan dan urutan seterusnya

Selesai dan disahkan pada 3 Ogos 2026:

1. `MASTER_ITEM` direkonsiliasi kepada 130 item produksi.
2. Pengesahan Supabase dan kebenaran berasaskan `USERS` aktif.
3. Daftar Item Baharu aktif dengan ID kategori, semakan pendua, idempotensi dan audit.
4. Barang Masuk aktif dengan identiti, masa, jumlah nilai dan status yang ditetapkan Worker.
5. Pengiraan stok semasa menggunakan transaksi `SAH` bagi keenam-enam jenis transaksi.
6. Dashboard, daftar item, butiran item dan pintasan Tambah Stok menggunakan baki semasa.
7. Sejarah serta butiran transaksi aktif.
8. Pembatalan transaksi aktif tanpa pemadaman fizikal dan dengan audit pemulihan.
9. Suite akhir Worker lulus 82/82.

Rekod ujian produksi `TXN-2B7808B76CBEA4CA9FEF3E1A` untuk `LL-0006` Bateri D telah dibatalkan dan diaudit. Ia ialah rekod pengesahan produksi, bukan stok operasi biasa; kesan stok 10 unit dan RM30.00 telah dikeluarkan, menjadikan baki semula 0, nilai RM0.00 dan status `HABIS`.

Kerja seterusnya:

1. Barang Keluar.
2. Permohonan, kelulusan dan penyerahan.
3. Sunting metadata serta nyahaktif/aktif semula item.
4. UI pengguna/peranan, audit, tetapan dan laporan.
5. Rekonsiliasi akhir dan prosedur go-live.
6. Penerbitan Google OAuth keluar daripada status `Testing`.
