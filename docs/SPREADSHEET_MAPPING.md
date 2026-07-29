# Pemetaan Migrasi Spreadsheet ITU eSTOR

## 1. Tujuan

Dokumen ini menerangkan pemetaan data daripada empat tab legasi kepada tab pengeluaran pertama, `MASTER_ITEM`, dalam spreadsheet Google Sheets berikut:

```text
Spreadsheet ID: 1nihQ3IN9104uyIP3hqry6vd7jMcNpcnMfTTvPUsTpa4
```

Tab sumber:

- `ALAT TULIS`
- `BAHAN KIMIA`
- `HOUSE HOLD`
- `LAIN-LAIN`

Tab sumber ialah rekod sejarah. Proses migrasi hanya membaca tab tersebut dan **tidak boleh memadam, menulis ganti, menyusun semula atau menamakan semula** mana-mana tab atau baris sumber.

## 2. Jumlah rekonsiliasi sumber

| Tab sumber | Jangkaan item | Kategori pengeluaran | Awalan ID |
|---|---:|---|---|
| `ALAT TULIS` | 63 | `ALAT TULIS` | `AT` |
| `BAHAN KIMIA` | 16 | `BAHAN KIMIA` | `BK` |
| `HOUSE HOLD` | 40 | `HOUSE HOLD` | `HH` |
| `LAIN-LAIN` | 11 | `LAIN-LAIN` | `LL` |
| **Jumlah** | **130** |  |  |

Migrasi tidak boleh dimuktamadkan jika jumlah rekod yang sah tidak sepadan dengan jadual ini, kecuali perbezaan telah disemak, diterangkan dan diluluskan.

## 3. Pemetaan medan

| Sumber legasi | Sasaran `MASTER_ITEM` | Kaedah |
|---|---|---|
| Nama tab sumber | `KATEGORI` | Pemetaan tepat mengikut jadual kategori. |
| `BIL` | Sokongan rujukan sahaja | Tidak digunakan sebagai ID atau `SUMBER_BARIS`; boleh dimasukkan dalam laporan migrasi. |
| `ITEM` | `NAMA_ITEM_ASAL` | Salin nilai sumber untuk kebolehkesanan audit. |
| `ITEM` yang dibersihkan | `NAMA_ITEM` | Terapkan peraturan normalisasi terkawal. |
| `KEMASAN` | `UNIT` | Trim dan normalisasi ruang; standardkan hanya nilai yang jelas setara. |
| `KOS SEUNIT (RM)` | `KOS_SEUNIT` | Tukar kepada nombor RM dengan maksimum dua tempat perpuluhan. |
| `BAKI` | `STOK_AWAL` | Tukar kepada nombor bukan negatif. |
| Tiada medan sumber | `STOK_MINIMUM` | Tetapkan `0`. |
| Tiada medan sumber | `STATUS` | Tetapkan `AKTIF`. |
| Nama tab sumber | `SUMBER_TAB` | Simpan nama tab tepat seperti sumber. |
| Nombor baris fizikal | `SUMBER_BARIS` | Simpan nombor baris sebenar Google Sheet, termasuk ofset baris tajuk. |
| Masa migrasi | `CREATED_AT` | Timestamp ISO 8601 `Asia/Kuala_Lumpur`. |
| Masa migrasi | `UPDATED_AT` | Sama dengan `CREATED_AT` semasa migrasi. |
| Jana semasa migrasi | `ITEM_ID` | Awalan kategori + nombor urutan empat digit. |

`JUMLAH (RM)` dan `PEMBELIAN 3 BULAN` tidak dipindahkan ke `MASTER_ITEM` sebagai medan pengeluaran:

- `JUMLAH (RM)` digunakan untuk semakan sahaja kerana nilai pengeluaran boleh dikira sebagai `STOK_AWAL × KOS_SEUNIT`.
- `PEMBELIAN 3 BULAN` ialah data sejarah/agregat dan perlu disimpan dalam laporan migrasi atau tab arkib berasingan jika diperlukan kemudian.

## 4. Penjanaan `ITEM_ID`

Format:

```text
<AWALAN>-<NOMBOR_URUTAN_4_DIGIT>
```

Contoh:

```text
AT-0001
BK-0001
HH-0001
LL-0001
```

Kaedah disyorkan:

1. Proses setiap tab mengikut susunan kategori yang ditetapkan.
2. Baca baris sumber dari atas ke bawah tanpa menyusun semula tab.
3. Abaikan baris yang benar-benar kosong.
4. Jana urutan berasingan bagi setiap kategori bermula pada `0001`.
5. Kaitkan ID dengan nombor baris fizikal melalui `SUMBER_TAB` dan `SUMBER_BARIS`.
6. Simpan fail/laporan manifest migrasi yang mengandungi `ITEM_ID`, `SUMBER_TAB`, `SUMBER_BARIS` dan nilai `BIL`.
7. Jangan menjana semula atau menukar ID selepas migrasi dimuktamadkan.

Jika migrasi perlu diulang sebelum dimuktamadkan, gunakan input dan susunan sumber yang sama supaya ID kekal deterministik.

## 5. Peraturan normalisasi

### 5.1 Ruang dan aksara

- Trim ruang di awal dan akhir semua nilai teks.
- Tukarkan dua atau lebih ruang dalaman kepada satu ruang.
- Buang aksara kawalan dan ruang tidak kelihatan.
- Jangan buang tanda baca yang membawa makna produk, model atau ukuran.
- Kekalkan tanda seperti `/`, `-`, `%`, `(` dan `)` apabila bermakna.

Contoh:

```text
"  Kertas   A4 80gsm " → "Kertas A4 80gsm"
```

### 5.2 Huruf besar, huruf kecil dan akronim

- Gunakan gaya tajuk secara berhati-hati untuk nama biasa.
- Jangan gunakan transformasi *title case* automatik ke atas keseluruhan teks.
- Kekalkan akronim dan kod yang diketahui, contohnya `A4`, `PVC`, `USB`, `AA`, `N95`, `pH`.
- Kekalkan nombor model, saiz dan unit, contohnya `80gsm`, `500ml`, `1kg`.
- Standardkan bentuk unit hanya apabila maknanya pasti dan tidak mengubah nama produk.

### 5.3 Nama item asal

- `NAMA_ITEM_ASAL` mesti memelihara kandungan sumber untuk audit.
- Normalisasi paparan hanya berlaku pada `NAMA_ITEM`.
- Jangan membetulkan secara senyap ejaan atau maksud yang meragukan.
- Jika pembetulan tidak pasti, kekalkan nama yang dinormalisasi minimum dan masukkan rekod dalam senarai semakan manual.

### 5.4 Unit / kemasan

- Trim dan runtuhkan ruang berulang.
- Gunakan bentuk konsisten seperti `UNIT`, `KOTAK`, `BOTOL`, `PEK`, `RIM` hanya apabila padanan jelas.
- Jangan menukar `KOTAK` kepada `UNIT` atau sebaliknya tanpa pengesahan.
- Kuantiti perpuluhan hanya dibenarkan bagi unit yang memang menyokong pecahan.

### 5.5 Nombor dan mata wang

- Buang simbol `RM`, pemisah ribu dan ruang sebelum menukar kepada nombor.
- Gunakan titik sebagai pemisah perpuluhan dalam nilai dalaman.
- Bundarkan `KOS_SEUNIT` kepada maksimum dua tempat perpuluhan hanya selepas nilai berjaya ditafsir.
- Tolak nilai kosong, bukan nombor atau negatif untuk `KOS_SEUNIT` dan `STOK_AWAL`; jangan tukar kepada `0` secara senyap.
- Bandingkan `JUMLAH (RM)` sumber dengan `KOS_SEUNIT × BAKI` menggunakan toleransi pembundaran RM0.01.

## 6. Strategi pengesanan pendua

Pengesanan dijalankan sebelum penulisan ke `MASTER_ITEM`.

### Padanan tepat

Tandakan sebagai calon pendua jika gabungan berikut sama selepas normalisasi:

```text
KATEGORI + NAMA_ITEM + UNIT
```

### Padanan hampir

Hasilkan laporan semakan bagi:

- nama berbeza hanya dari segi ruang, huruf besar/kecil atau tanda baca;
- nama hampir sama tetapi unit/kemasan berbeza;
- nombor model atau saiz yang hampir sama;
- item sama yang muncul dalam dua tab kategori;
- nilai `BIL` berulang atau kosong.

### Keputusan pendua

- Jangan gabungkan rekod secara automatik apabila makna tidak pasti.
- Setiap gabungan perlu mendapat keputusan `GABUNG`, `KEKAL_BERASINGAN` atau `PERLU_SEMAKAN`.
- Jika digabung, semua rujukan sumber mesti disimpan dalam manifest migrasi. Struktur `MASTER_ITEM` hanya mempunyai satu pasangan sumber utama; rujukan tambahan perlu kekal dalam laporan migrasi/audit.
- Jumlah `STOK_AWAL` hanya boleh digabung selepas unit dan identiti item disahkan setara.

## 7. Senarai semak sebelum migrasi

### Struktur

- [ ] Spreadsheet ID sepadan dengan `1nihQ3IN9104uyIP3hqry6vd7jMcNpcnMfTTvPUsTpa4`.
- [ ] Keempat-empat tab sumber wujud dengan nama tepat.
- [ ] Tajuk lajur sumber lengkap dan berada pada baris yang dikenal pasti.
- [ ] Tiada penulisan akan dibuat kepada tab legasi.
- [ ] Salinan sandaran atau eksport bertarikh telah dibuat.

### Kandungan

- [ ] `ITEM` tidak kosong bagi semua baris yang akan dimigrasi.
- [ ] `KEMASAN` boleh ditafsir dan tidak kosong.
- [ ] `KOS SEUNIT (RM)` ialah nombor bukan negatif.
- [ ] `BAKI` ialah nombor bukan negatif.
- [ ] `JUMLAH (RM)` telah dibandingkan dengan nilai kiraan.
- [ ] Baris kosong, baris tajuk berulang dan jumlah kecil telah dikecualikan.
- [ ] Calon pendua telah disemak.
- [ ] Pembetulan tidak pasti telah disenaraikan untuk keputusan manusia.

### Kawalan migrasi

- [ ] Timestamp migrasi tunggal telah ditetapkan dalam `Asia/Kuala_Lumpur`.
- [ ] Penjanaan ID telah diuji dan bebas pertindihan.
- [ ] `STOK_MINIMUM = 0` untuk semua rekod.
- [ ] `STATUS = AKTIF` untuk semua rekod awal.
- [ ] Setiap rekod mempunyai `SUMBER_TAB` dan `SUMBER_BARIS`.
- [ ] Proses telah diuji dalam mod simulasi (*dry run*) tanpa menulis data.

## 8. Rekonsiliasi migrasi

Selepas normalisasi dan sebelum muat naik:

| Kategori | Sumber dijangka | Migrasi dijangka |
|---|---:|---:|
| `ALAT TULIS` | 63 | 63 |
| `BAHAN KIMIA` | 16 | 16 |
| `HOUSE HOLD` | 40 | 40 |
| `LAIN-LAIN` | 11 | 11 |
| **Jumlah** | **130** | **130** |

Sediakan laporan per kategori yang mengandungi:

- bilangan baris sumber dibaca;
- bilangan baris kosong/dikecualikan;
- bilangan rekod berjaya;
- bilangan ralat;
- bilangan calon pendua;
- jumlah `BAKI` mengikut unit;
- jumlah nilai sumber;
- jumlah nilai yang dikira semula;
- perbezaan pembundaran.

Jika rekod pendua diluluskan untuk digabung, jumlah akhir `MASTER_ITEM` mungkin kurang daripada 130. Perbezaan tersebut mesti dijelaskan dalam laporan dan semua 130 baris sumber mesti masih boleh dijejaki.

## 9. Langkah migrasi

1. Tetapkan tab legasi sebagai baca sahaja bagi proses migrasi.
2. Eksport/sandarkan tab sumber dan rekodkan checksum jika tersedia.
3. Baca tajuk serta baris fizikal setiap tab.
4. Bina rekod perantaraan yang mengekalkan semua nilai asal.
5. Jalankan normalisasi dan validasi.
6. Hasilkan laporan ralat, calon pendua dan simulasi ID.
7. Dapatkan kelulusan pentadbir untuk isu yang memerlukan keputusan.
8. Cipta tab `MASTER_ITEM` dengan tajuk lajur yang diluluskan.
9. Tulis data dalam satu kelompok migrasi terkawal.
10. Baca semula semua rekod sasaran dan jalankan rekonsiliasi.
11. Rekodkan ringkasan migrasi dalam `AUDIT_LOG` apabila tab audit tersedia.

## 10. Pengesahan selepas migrasi

- [ ] Semua `ITEM_ID` unik dan sepadan dengan kategori.
- [ ] Tiada gabungan `SUMBER_TAB` + `SUMBER_BARIS` berulang.
- [ ] Semua `NAMA_ITEM_ASAL` boleh dipadankan dengan sumber.
- [ ] Semua nilai `KATEGORI`, `STATUS` dan awalan ID sah.
- [ ] Semua `KOS_SEUNIT`, `STOK_AWAL` dan `STOK_MINIMUM` ialah nombor bukan negatif.
- [ ] Semua `STOK_MINIMUM` awal bernilai `0`.
- [ ] Semua `STATUS` awal bernilai `AKTIF`.
- [ ] Semua timestamp menggunakan format dan zon masa yang diluluskan.
- [ ] Jumlah rekod mengikut kategori telah direkonsiliasi.
- [ ] Sampel sekurang-kurangnya lima rekod setiap kategori telah dibandingkan secara visual dengan sumber.
- [ ] Tab legasi tidak berubah; bilangan baris dan nilai asal kekal sama.
- [ ] Dashboard/backend belum dihalakan kepada `MASTER_ITEM` sebelum kelulusan akhir.

## 11. Strategi rollback

Rollback mesti tidak menyentuh empat tab legasi.

### Sebelum penggunaan pengeluaran

1. Hentikan semua penulisan aplikasi.
2. Namakan tab `MASTER_ITEM` yang gagal kepada nama kuarantin bertimestamp, contohnya `MASTER_ITEM_FAILED_20260729_143500`.
3. Jangan padam tab gagal sehingga analisis dan audit selesai.
4. Baiki skrip/peraturan migrasi.
5. Cipta semula `MASTER_ITEM` daripada sumber legasi dan manifest migrasi.
6. Jalankan semula semua validasi dan rekonsiliasi.

### Selepas penggunaan pengeluaran bermula

- Jangan ganti `MASTER_ITEM` secara terus.
- Aktifkan mod penyelenggaraan dan hentikan transaksi baharu.
- Ambil snapshot tab pengeluaran berkaitan.
- Pulihkan daripada versi Google Drive yang dikenal pasti atau tab sandaran yang diluluskan.
- Rekonsiliasi `MASTER_ITEM` bersama `TRANSACTIONS` supaya stok semasa tidak hilang.
- Rekodkan kejadian, skop, pelulus dan hasil pemulihan dalam `AUDIT_LOG`.

Rollback dianggap selesai hanya apabila sumber legasi kekal tidak berubah, semua ID dan hubungan sah, serta jumlah stok boleh dibina semula daripada `STOK_AWAL` dan transaksi.
