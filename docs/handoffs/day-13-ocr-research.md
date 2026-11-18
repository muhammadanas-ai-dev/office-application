# Day 13 — OCR research (DRAFT, owner decision pending)

Owner instruction 2026-11-18 14:31 PKT (side chat): "no first finds the best ocr on github opensource which have goods stars and fork and comments that really standard and usefull and then i decide which one i have to integrete them"

This is loop step 1 only — research, no code, no install, no engine chosen. The owner picks; then plan → build → test follows FEATURE_LOOP.md.

## Star snapshot used

Primary snapshot: HackerNoon / Text Mining directory, 11 Nov 2026 — PaddleOCR 92.6K, MinerU 83.5K, Tesseract 77.5K, OCRmyPDF 35.3K, EasyOCR 30.1K, RapidOCR 8.5K, docTR 6.4K. Updated where a source gave a 17 Nov 2026 figure (PaddleOCR 92.8K, MinerU 83.8K, Tesseract 77.6K). Stars move daily — re-check at build time. Stars are popularity, not a benchmark: MinerU is a document parser, not a pure OCR engine.

## Ranked comparison

| # | Engine | Repo | Stars / forks (Nov 11 snapshot unless noted) | Licence | Latest release / activity | Languages, Urdu/Arabic | Forma fit |
|---|---|---|---|---|---|---|---|
| 1 | PaddleOCR | PaddlePaddle/PaddleOCR | 92.6K / ~11.5K (92.8K on 17 Nov) | Apache-2.0, code + weights | 3.7.0, 11 Jun 2026; PP-OCRv6; last commit 16 Sep 2026 | 100+ langs; PP-OCRv6 covers 50 langs in one model, Arabic/Urdu still via PP-OCRv5 `arabic_PP-OCRv5_mobile_rec` (reads Arabic, Persian, Urdu, Pashto, Kurdish, Sindhi, Balochi, English; vendor-reported 81.27%) | Best accuracy/features; heaviest — PaddlePaddle runtime, Python sidecar needed |
| 2 | MinerU | opendatalab/MinerU | 83.5K (83.8K on 17 Nov) | MinerU Open Source License — Apache-2.0 + extra terms: commercial licence above 100M monthly users or $20M/month revenue; an online service must state prominently that it uses MinerU | 4.0.12, 11 Oct 2026; 18 releases 16 Sep–2 Nov 2026 | PDF/Office → Markdown/JSON, tables, formulas, reading order | NOT a pure OCR pick. A document parser; Standard/Advanced tiers use a 1.2B VLM (GPU, 8GB+ VRAM). Basic tier runs CPU. Licence attribution duty. |
| 3 | Tesseract | tesseract-ocr/tesseract | 77.5K / ~10.9K (77.6K on 17 Nov) | Apache-2.0 | 5.5.3, 24 Jul 2026; last commit 27 Oct 2026 | 100+ langs; `urd.traineddata` and `ara.traineddata` exist in tessdata | Lightest: ~1MB apt install, CPU-only, no GPU, no heavy framework. No native PDF — needs pdftoppm (already on this VM). Weak on messy photos, tables, layout; no handwriting. Already the engine named in WPS_LEVEL_PLAN Phase C. |
| 4 | OCRmyPDF | ocrmypdf/OCRmyPDF | 35.3K | MPL-2.0 | Actively maintained; 128 open issues (older count) | Uses Tesseract's languages | Not a rival engine — a wrapper that adds a searchable text layer to a scanned PDF (PDF/A). Useful as an output step on top of Tesseract, not a pick on its own. |
| 5 | EasyOCR | JaidedAI/EasyOCR | 30.1K / ~3.6K | Apache-2.0 | 1.7.2, Sep 2024; last commit Dec 2025 | 80+ langs incl. Arabic | Simple one-call Python API, PyTorch. Maintenance has slowed; issues older than 6 months auto-close; GPU-heavy, slower on CPU. |
| 6 | Surya | datalab-to/surya (was VikParuchuri/surya) | 21.6K / 1.6K | Code Apache-2.0; weights modified OpenRAIL-M — free only for research, personal use, startups under $5M funding/revenue; commercial licence above that, price not published | Surya 2.5, 29 Oct 2026, 689M params, surya-ocr 0.24.0, 13 Nov 2026; 85.9 OmniParseBench, 83.7% olmOCR-bench (vendor-reported) | 90+ langs incl. Arabic | Best layout/reading-order/table accuracy under 1B params, but GPU-heavy (4.5 pages/sec on one H100), runs via vLLM/llama.cpp, and the weights licence caps commercial use at $5M. 2.5 drops table cell geometry. |
| 7 | RapidOCR | RapidAI/RapidOCR | 8.5K / ~769 | Apache-2.0 | 3.10.0, 8 Oct 2026; commits within 1 day of 17 Nov check | Same models as PaddleOCR (PP-OCRv4/v5/v6), incl. Arabic PP-OCRv5 model; RTL needs extra deps | PaddleOCR's models converted to ONNX — same accuracy, no PaddlePaddle framework, CPU-only ONNX Runtime. The lightweight way to get PaddleOCR accuracy. |
| — | docTR (honourable mention) | mindee/doctr | 6.4K / 692 | Apache-2.0 | PyTorch, v1.0+; ~30 open issues — well maintained for its size | Configurable detection + recognition | Clean, swappable pipeline; smaller community than the top three. |

## Community / maintenance signals (not just stars)

- Tesseract: 485 open issues on a decades-old codebase; release 5.5.3 Jul 2026, commits into Oct 2026.
- PaddleOCR: +6,398 stars in 112 days to 17 Nov 2026; adopted by Dify, RAGFlow, Cherry Studio.
- EasyOCR: star curve flattened 2020–2023 onward as maintenance slowed.
- MinerU: only 11 open issues, very active releases — but the licence flipped AGPL → Apache three times Mar–Apr 2026 before settling; pin the version and read the licence.
- Surya: older Unstract table lists GPL-3.0 + Rail-M ($2M) — superseded; current PyPI/Datalab wording is code Apache-2.0, weights Rail-M ($5M).

## Recommendation (owner decides — this is not a pick)

- Ship fastest, safest: **Tesseract** — already in the plan, smallest, fits the VM (600MB–1.2GB RAM available, no GPU), no licence risk, Urdu/Arabic packs exist but must be tested on a real Urdu page before any claim.
- Best accuracy per weight: **RapidOCR** — PaddleOCR's models via ONNX on CPU, no heavy framework. The real challenger to Tesseract.
- Full PaddleOCR if layout/tables/document-to-Markdown matter more than weight.
- Do not pick as primary OCR: MinerU (parser + licence attribution), Surya (weights licence cap + GPU), EasyOCR (stalled maintenance).
- OCRmyPDF is an output step, not an engine choice.

Suggested decision for the owner: (A) Tesseract, (B) RapidOCR, or (C) PaddleOCR full — or test Tesseract vs RapidOCR side-by-side on the same scanned English + Urdu pages first, then commit. That test is what the loop's test step would do anyway.

## Not verified

- No engine was installed or run in this research; no Urdu accuracy was measured. The assistant's 09:29 PKT note stands: Tesseract is not installed on this VM, pdftoppm is.
- Benchmark scores above are vendor/third-party reported (OmniDocBench, olmOCR-bench, PaddleOCR model pages), not re-run here. No engine here does handwriting well.
- Forma constraints from WPS_LEVEL_PLAN.md Phase C and FEATURE_LOOP.md: OCR runs server-side on the user's own file; languages are the ones actually installed; no OCR claim without a tested language pack; original file never overwritten; background job with a page cap (from the 09:29 plan).

Sources: HackerNoon 138 OCR repos ranked (Nov 11 2026 snapshot) https://hackernoon.com/138-open-source-ocr-and-pdf-parsers-ranked-by-github-stars-paddleocr-mineru-tesseract-and-more ; PaddleOCR compare (27 Oct 2026) https://paddleocr.dev/compare ; PaddleOCR models https://paddleocr.dev/models ; RapidOCR model list https://rapidai.github.io/RapidOCRDocs/main/en/model_list/ ; Surya 2.5 https://www.datalab.to/blog/surya-2-5 ; MinerU licence https://selfhostmap.com/compare/mineru-vs-paddleocr/ ; Tesseract tessdata ara/urd https://tesseract-ocr.github.io/tessdoc/Data-Files
