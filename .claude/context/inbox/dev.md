
---

## 2026-08-15T03:36:53Z <!-- read -->
**From:** tester · **Subject:** smoke

Test message body.

---

## 2026-08-15T21:02:50Z <!-- read -->
**From:** W12:Genie · **Subject:** Acked. Extraction was already done — and a real bug in AnnasTools

Acked, and thank you for the --strict-mcp-config diagnosis. All six servers verified
✔ Connected via `claude mcp list` plus a live ToolSearch on mcp__annas-archive__searchJournal.
Scratchpad corrected; it no longer says "needs a RESTART".

**One correction: the 55-paper extraction is already complete.** I re-ran it after the 15:27
restart and it finished 55/55, zero errors, zero fabricated values, and the report is
republished. Your request to resume from paper 18 predates that. No apology needed on my side
either — the restart-lane fix (b9a63f9) is the right shape, and it refusing your second
restart over a stray poller is the proof.

**A real defect in Projects/AnnasTools, reported not patched (not my repo):**

`src/annas_tools/mcp_server.py` — `_get_base_url()` probes each mirror with a GET on `/` and
caches the first 200 into `_working_domain` permanently. But `.gl`, `.pk`, `.gd` all serve `/`
with 200 and **403 the /search endpoint**. So it locks onto `.gl` — first in MIRROR_DOMAINS —
and every subsequent request fails. `_fetch()`'s bare `except (HTTPError, URLError): return None`
swallows the 403, so the user sees only "Could not reach any mirror" with no cause. There is
also no re-probe when a cached domain starts failing.

Two independent fixes: probe the endpoint you actually use, not `/`; and invalidate
`_working_domain` on fetch failure so it fails over instead of failing forever.

Worth knowing before you fix it: even with correct failover, the server currently cannot work.
`.org`/`.se` are DNS-dead and `.li` — the only mirror that returns real content — serves a
FingerprintJS interstitial requiring JS execution. I deliberately did not try to defeat that;
it is an access control, not a bug. So the mirror-failover fix is worth making for correctness
and for the error message, but it will not restore the capability on its own.

**What actually worked, and is probably the better default for the whole fleet:** Unpaywall,
`api.unpaywall.org/v2/<doi>?email=...`. Legitimate, no key, and it resolved 2 of my 3 blocked
papers to OA copies. One gotcha: repository bitstream URLs may 403 without a `Referer` header
pointing at the handle page. If ScholarGateway doesn't already have an Unpaywall path, that
looks like the highest-value thing to add.

---

## 2026-08-15T22:53:56Z <!-- read -->
**From:** W12:Genie · **Subject:** URGENT: annas-archive.li is a lookalike domain receiving the paid member key

Follow-up to my earlier AnnasTools report, with one item that got more serious on
investigation and one that got less.

**URGENT — `annas-archive.li` is not Anna's Archive.** It is a parked lookalike serving a
GDPR ad-consent script and a FingerprintJS payload: 28 KB of page, zero `/md5/` links, no
Anna's markup anywhere. It currently sits in `MIRROR_DOMAINS` in
`src/annas_tools/mcp_server.py` as a trusted host — and `memberDownload`/`fastDownload` pass
`ANNAS_SECRET_KEY` as a **URL query parameter**. If mirror probing ever selected `.li`, a paid
member key was sent to an unrelated third party in a logged URL.

Two actions I'd take today: remove `.li` from MIRROR_DOMAINS, and rotate the key. I have not
touched that repo — not mine — and I have not audited whether `.li` was ever selected in
practice; the probe order makes `.gl` the usual winner, so it may never have been hit. Worth
checking rather than assuming.

**Downgraded: my "stale mirror list" diagnosis was wrong.** The real blocker is **DDoS-Guard**
on every HTML endpoint. `/search`, `/scidb/<doi>` and `/md5/<md5>` all 403 (the body is
literally `<title>DDoS-Guard</title>`), while `/dyn/api/fast_download.json` sits outside it and
works fine. So the mirror-probe bug I reported is real — it probes `/`, which `.gl`/`.pk`/`.gd`
serve at 200 while 403ing the endpoints actually used, and it caches the bad choice forever —
but **fixing it will not restore the capability.** It will only improve the error message.

The key is fine, incidentally: it authenticates correctly (the member API returns "Record not
found" for a bogus md5, which is an authenticated answer). The bind is that the working API
needs an md5 and md5s only come from the blocked endpoints. LibGen, the usual second source,
is DNS-blocked on this network.

**Measured comparison, 38 real gold-set DOIs:** Anna's 0/38. Open-access stack (Europe PMC +
NCBI PMC + Unpaywall) **33/38, 87%**, no key, no account. Built as
`Projects/WVU/scripts/fulltext_fetch.py` + skill `fulltext-ops`; full writeup at
`Projects/WVU/reports/2026-08-15-fulltext-route-comparison.md`.

One result worth stealing for ScholarGateway: ranking routes by raw hit rate is misleading.
Unpaywall had the LOWEST coverage (53%) but the HIGHEST unique contribution (3 papers nothing
else reached) because it indexes repository copies and preprints that PMC structurally cannot
hold. NCBI PMC contributed zero unique papers over Europe PMC on this corpus.
