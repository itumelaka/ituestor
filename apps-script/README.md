# ITU eSTOR email relay

Google Apps Script ini hanya menghantar e-mel kelulusan pengguna melalui `itumelaka@gmail.com`. Login kekal pada Supabase Auth, API dan kebenaran kekal pada Cloudflare Worker, dan data operasi kekal pada Google Sheets.

## Pemasangan

1. Log masuk ke `script.google.com` menggunakan `itumelaka@gmail.com` dan cipta projek baharu bernama `ITU eSTOR Email`.
2. Salin `Code.gs` dan aktifkan paparan fail manifest untuk menyalin `appsscript.json`.
3. Dalam **Project Settings > Script Properties**, tambah `ESTOR_EMAIL_WEBHOOK_SECRET` dengan nilai rawak sekurang-kurangnya 32 aksara.
4. Pilih **Deploy > New deployment > Web app**. Jalankan sebagai pemilik skrip dan benarkan akses kepada **Anyone**.
5. Simpan URL `/exec`, kemudian tetapkan dua rahsia Worker menggunakan `wrangler secret put EMAIL_WEBHOOK_URL` dan `wrangler secret put EMAIL_WEBHOOK_SECRET`. Nilai rahsia kedua mesti sama dengan Script Property.
6. Deploy Worker dan luluskan seorang pengguna ujian untuk mengesahkan e-mel diterima.

Jangan simpan URL deployment atau rahsia webhook dalam repositori, spreadsheet, tangkap layar atau mesej awam.
