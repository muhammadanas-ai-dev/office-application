# Docserver recovery lead — ONLYOFFICE apt repo (untried path)

Written 2026-11-18 ~15:45 PKT, as research only — nothing installed, nothing
changed on the VM. For the Day 14 conversion-hub live e2e (and the Day 7
export / editor live checks, same blocker).

## The blocker as recorded
- `docs/handoffs/day-14-plan.md` (2026-11-18 15:28 PKT): the document
  server is wiped after the VM reset; direct download of the 10.0.0 .deb
  returns **403** through the egress proxy (re-checked that day).
- The conversion live e2e is therefore recorded as blocked on the
  docserver; only the validation/RLS paths can be tested live without it.

## The untried path: the official ONLYOFFICE apt repository
The plan only evidences the direct `.deb` download failing. The official
install docs give a second fetch path that has NOT been tried on this VM:

- Official guide: https://helpcenter.onlyoffice.com/docs/installation/community/linux/installing/install-ubuntu
- Repo: `deb [signed-by=/usr/share/keyrings/onlyoffice.gpg] https://download.onlyoffice.com/repo/debian squeeze main`
- GPG key: `curl -fsSL https://download.onlyoffice.com/GPG-KEY-ONLYOFFICE`
  (key id CB2DE8E5), then `sudo apt-get install onlyoffice-documentserver`
- Independent report (fosslinux, tested 2026-10-17): the official deb repo
  served package **10.0.0-169** — the same version installed on Day 5
  (DEB 10.0.0-169).

Why it might work where the .deb failed: it is a different host/path
(`download.onlyoffice.com/repo/...` via apt) from the direct download that
403'd, and apt on this VM demonstrably works today — Ghostscript and qpdf
were reinstalled via `apt-get` during the Day 13 recovery (2026-11-18
~15:19 PKT).

## Honest caveats — test, don't assume
- apt may hit the same egress-proxy 403; the proxy, not the host, is the
  suspect. `apt-get update` after adding the repo is the cheap test.
- Package is large (~500 MB download; Day 5 noted ~600 MB–1.2 GB RAM
  available vs 4 GB official requirement) — Day 5 ran it anyway with
  `--force-depends` and it worked.
- `ttf-mscorefonts-installer` is half-configured/broken on this VM (Day 8
  note) and the docserver install pulls it — expect the same failure mode
  as Day 5 and the same workaround if so.
- This is an apt install, not Docker — it respects the user's no-Docker-files rule.
- If apt also 403s, the blocker stands and the live e2e stays blocked;
  record the attempt with the exact error, don't claim it.
