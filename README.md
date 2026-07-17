# Crypto SMC Scanner → Telegram (24/7)

Scanner otomatis yang jalan di **GitHub Actions** tiap ~15 menit, cari **CHoCH READY** (logika persis `LuxAlgo_ChoCh_Screener_v3`), dan kirim **notifikasi Telegram** cuma buat setup yang **baru muncul** (nggak spam).

- Data: `data-api.binance.vision` (endpoint publik Binance — biasanya lolos geo-block cloud).
- Setup dinotifikasikan: **CHoCH READY, M15**, min volume 24h **3 juta USDT**, filter halal aktif.
- Gratis (pakai repo **public** → menit Actions unlimited).

---

## Langkah setup (sekali, ~15-30 menit)

### 1) Bikin bot Telegram
1. Di Telegram, chat **@BotFather** → kirim `/newbot` → ikutin (kasih nama + username) → dapet **TOKEN** (bentuknya `1234567:AbCdEf...`).
2. Kirim satu pesan apa aja ke bot baru kamu (biar dia "kenal" kamu).
3. Cari **CHAT ID** kamu: chat **@userinfobot** → dia balas angka `Id: 123456789`. Itu CHAT ID kamu.
   - (Alternatif: buka `https://api.telegram.org/bot<TOKEN>/getUpdates` di browser setelah kirim pesan ke bot → cari `"chat":{"id":...}`.)

### 2) Bikin repo GitHub
1. Buat repo **baru**, set **Public** (biar Actions gratis tanpa batas menit).
2. Upload isi folder ini ke **root repo** — struktur harus jadi begini:
   ```
   scan.js
   state.json
   .github/workflows/scan.yml
   ```
   > Penting: file workflow harus di path `.github/workflows/scan.yml`. Folder `.github` diawali titik (kalau di Finder Mac nggak kelihatan, upload lewat web GitHub: "Add file → Upload files", lalu ketik path lengkapnya).

### 3) Masukin token sebagai Secret (JANGAN ditaruh di kode)
Di repo: **Settings → Secrets and variables → Actions → New repository secret**, bikin dua:
- `TELEGRAM_TOKEN`  = token dari BotFather
- `TELEGRAM_CHAT_ID` = chat id kamu

### 4) Nyalain & tes
1. Buka tab **Actions** di repo → kalau ada peringatan, klik **"I understand... enable"**.
2. Pilih workflow **crypto-scan** → **Run workflow** (tombol manual) → tungguin ~1-2 menit.
3. Cek: harusnya dapet log jumlah koin di-scan, dan (kalau ada READY baru) notif masuk Telegram.

Setelah itu dia jalan sendiri tiap ~15 menit. Selesai. ✅

---

## Catatan jujur
- **Cron GitHub sering telat.** `*/15` itu target, realitanya bisa mundur 10-40 menit pas server lagi sibuk. Kalau butuh presisi, lapis browser (auto-scan di HTML) lebih gesit.
- **Geo-block.** Kalau di log muncul `HTTP 451`, berarti IP runner-nya keblok Binance. Solusi: pindah host ke VPS region Singapura/Eropa (kode-nya sama persis, tinggal `node scan.js` + cron). Bilang aja kalau kena ini.
- **Anti-spam.** `state.json` nyimpen daftar READY terakhir; tiap run cuma kirim yg baru. File ini di-commit balik tiap run (sekalian jaga workflow biar nggak di-nonaktifin GitHub karena "repo idle").
- **Bukan sinyal buy.** Tetap verifikasi di chart (LuxAlgo swing=50, internal=5) sebelum entry.

## Ubah setting
Semua di atas `scan.js` (bagian KONFIG): `MIN_VOL`, `MAX_BARS`, `TF`, dll. Filter halal di `HARAM_BASES`.

## Tes lokal (opsional, butuh Node 18+)
```
node test_scan.js
```
Nguji logika CHoCH-nya (tanpa jaringan). Harusnya `PASS` semua.
