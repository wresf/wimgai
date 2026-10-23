# VectorCraft AI Studio

Aplikasi web statis untuk membuat aset microstock dengan AI: generasi gambar/SVG, auto-upscale, metadata SEO (judul + 49 keyword + kategori), EXIF 300 DPI, dan ekspor ZIP + CSV Adobe Stock.

Semua dijalankan di browser. Tidak ada server dan tidak ada CDN eksternal untuk tampilan maupun pustaka.

## Deploy ke GitHub Pages
1. Buat repositori, unggah seluruh isi folder ini (kecuali `node_modules/`).
2. Settings → Pages → Source: *Deploy from a branch* → pilih `main` dan folder `/ (root)`.
3. Buka URL Pages yang diberikan GitHub.

`style.css` sudah dikompilasi, jadi tidak perlu build apa pun saat deploy.

## API gratis yang dipakai (key dimasukkan pengguna di halaman)
| Fungsi | Provider | Keterangan |
|---|---|---|
| Prompt, metadata, SVG | Google Gemini (AI Studio) atau Groq | Key gratis dari masing-masing situs |
| Gambar foto | Hugging Face FLUX.1-schnell | Token gratis dari huggingface.co |
| Gambar foto (alternatif) | Pollinations | Anonim dibatasi sekitar 1 request/15 detik |

Key hanya disimpan di `localStorage` browser pengguna dan dikirim langsung ke penyedia API. Jangan menaruh key di repositori.

## Mengubah tampilan (opsional)
```
npm install
npm run build:css     # membuat style.css dari src/input.css
npm run watch:css     # mode pengembangan
```

## Struktur
- `index.html` kerangka halaman
- `app.js` seluruh logika aplikasi
- `style.css` hasil build Tailwind (jangan diedit manual)
- `src/input.css`, `tailwind.config.js` sumber gaya
- `vendor/` JSZip, piexifjs, Font Awesome (disalin lokal)

## Catatan submit Adobe Stock
- Konten buatan AI wajib diberi label *Created using generative AI* saat submit.
- Badge "Siap submit" hanya memeriksa syarat teknis (resolusi, ukuran, EXIF, judul, 49 keyword), bukan kualitas visual.
- Mode Vector menghasilkan SVG; konversi ke EPS/AI lewat Inkscape atau Illustrator bila diperlukan.
