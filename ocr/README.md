# OCR — Tesseract, built from source

Tesseract 5.5.4 (tag `5.5.4` of `tesseract-ocr/tesseract`) plus
Leptonica 1.88.0 (`DanBloomberg/leptonica`), cloned and built
into this folder. Nothing is installed system-wide and nothing
is sent to an outside service — OCR runs on this machine, on
the user's own file.

## Layout

- `tesseract/` — the Tesseract source (shallow clone, tag 5.5.4).
- `leptonica/` — the Leptonica source (shallow clone, main).
- `vendor/` — the local install prefix: `bin/tesseract`,
  `lib/libleptonica.*`, `lib/libtesseract.*`, `include/`.
  The binary finds its own libraries through an rpath of
  `$ORIGIN/../lib` (verified with `ldd`: `libleptonica.so.6`
  resolves to `vendor/bin/../lib/libleptonica.so.6`).
- `tessdata/` — the language data (tessdata_fast models):
  `eng.traineddata` (4.1 MB), `urd.traineddata` (1.4 MB),
  `ara.traineddata` (1.4 MB), plus `configs/` (copied from the
  install — Tesseract looks for its `tsv`/`hocr` configs next
  to the language data, so they must live here).
- `worker.mjs` — the OCR worker process (see below).

## Why it lives here

`~/workspace` persists across VM resets; apt-installed
packages do not. Building the engine into the project means
the binary survives a reset. Only the *build-time* tools are
apt packages (cmake, g++, autoconf, automake, libtool,
libjpeg-dev, libpng-dev, zlib1g-dev) — a rebuild after a
reset needs those reinstalled, but the built binary keeps
working without them.

## Verified (2026-11-18)

- `vendor/bin/tesseract --version` → tesseract 5.5.4,
  leptonica-1.88.0, libjpeg, libpng, zlib.
- `--list-langs` → ara, eng, urd.
- English test image ("Forma Office OCR test" /
  "The quick brown fox jumps over the lazy dog") → read
  exactly, 13 words, mean confidence 96.3.
- Urdu test image ("فارما آفس" / "یہ ایک اردو جانچ ہے",
  Noto Sans Arabic) → the second line read exactly; the
  first came back as "فارما آفقفس" (one extra character).
  Urdu is usable, not perfect — accuracy depends on the
  font and the scan.

## Known limits

- **No TIFF support.** Leptonica was built with
  `--without-libtiff` because `libtiff-dev` cannot install
  on this machine (apt: libzstd-dev wants libzstd1
  1.5.5+dfsg2-2build1.1 but 1.5.5+dfsg2-2build1.1+hatch1 is
  installed; held broken packages). The OCR pipeline
  renders PDF pages to PNG and accepts PNG/JPEG uploads,
  so TIFF is not on the path. A TIFF image is refused with
  a clear message.
- **Cosmetic TIFF warnings.** `--list-langs` prints
  `Error in pixReadMemTiff: function not present` — that is
  the same missing TIFF support, harmless, and it does not
  affect OCR of PNG/JPEG input.
- **tessdata_fast models.** The fast models are smaller and
  a little less accurate than the `tessdata` "best" models.
  Fast was chosen for a server; switching to "best" is a
  one-line change (replace the three `.traineddata` files).

## How the app uses it

- `OCR_TESSERACT_BIN` — the binary path (default:
  `<project>/ocr/vendor/bin/tesseract`).
- `OCR_TESSDATA_PREFIX` — the language data dir (default:
  `<project>/ocr/tessdata`). Set as `TESSDATA_PREFIX` for
  the child process.
- The engine (`src/lib/ocr.ts`) runs the binary with
  `execFile`, output `tsv`, `--psm 6`, one run per page,
  a 30 s timeout per page, and parses the TSV for the text
  and the per-word confidence.

## The worker

OCR takes seconds per page, so it does not run inside a web
request. The route enqueues a job in `ocr_jobs`; the worker
polls the table, renders the file's pages, runs Tesseract
per page, stores the text in `document_ocr_results`, and
marks the job done/failed. Start it from the project root:

```sh
node ocr/worker.mjs
```

It reads `.env.local` (Supabase URL + service role key) and
the binary path above. It runs until stopped (Ctrl-C) and
does not survive a VM reset — restart it next to the app.

## Rebuild (after a VM reset, if the binary is ever lost)

```sh
cd ocr/leptonica && ./autogen.sh
./configure --prefix=$PWD/../vendor --without-libtiff
make -j"$(nproc)" && make install
cd ../tesseract
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX=$PWD/../vendor \
  -DCMAKE_PREFIX_PATH=$PWD/../vendor \
  -DCMAKE_INSTALL_RPATH='$ORIGIN/../lib' \
  -DBUILD_TRAINING_TOOLS=OFF -DBUILD_TESTS=OFF
cmake --build build -j"$(nproc)" && cmake --install build
cp -r ../vendor/share/tessdata/configs ../tessdata/configs
```

(Reinstall the build-time apt packages first: cmake, g++,
autoconf, automake, libtool, libjpeg-dev, libpng-dev,
zlib1g-dev. The language data in `tessdata/` does not need
re-downloading — it lives in the project.)
