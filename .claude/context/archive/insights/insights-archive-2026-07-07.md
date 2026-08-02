# Insights Archive — 2026-07-07
# Rotated: 2026-07-07T16:15:11Z (15 entries)

### 2026-06-23 [f1befbef4a03]

- **The 9m29s + 3m28s wait times before the errors in your transcript are the smoking gun for Anthropic-side load-shedding**. Healthy Anthropic responses on long Opus calls come back in ≤2-3min. When you see 5+min hangs followed by 5xx, that's the Anthropic edge holding your connection open while looking for capacity, then giving up. The proxy and your local stack don't cause that pattern — they just observe it.
- **Why the bursty-5xx pattern is informative**: My count showed alternating runs of 5xx and 200 (`7×5xx, then 200s, then 4×5xx, then 200s...`). Anthropic's load-balancer is rotating capacity in/out — not flatlining. That's a sign they're managing capacity rather than experiencing an outage. Your retries WILL eventually succeed; the autonomic loop's slow-burn is the right strategy.
- **The misleading "check your inference gateway (localhost:9800)" message in Claude Code** could be filed as a real UX bug to Anthropic. The 529 is a documented upstream code with a known meaning ("overloaded, retry with backoff") — Claude Code should detect it and surface "Anthropic capacity issue, auto-retrying" instead of suggesting you debug the gateway. Want me to draft a `gh issue` for the anthropics/claude-code repo?

### 2026-06-23 [d166b22ee412]

- **Docker Desktop on macOS routes host-to-container traffic through a Linux VM, and the VM's NAT egress IP shows as the source to uvicorn**. That IP happens to be in Cloudflare's announced range, which is what hooked me. The clean diagnostic: traffic from inside containers on the same docker network shows as `127.0.0.1` (because docker DNS routes inside the bridge), traffic from the host shows as the VM NAT IP. This is purely cosmetic — the requests ARE local.

### 2026-06-23 [f43a99843fec]

- **Sir's instinct was correct**: a low-utilization account hitting both 500 and 529 is NOT throttling — that combination shouldn't happen if Anthropic is just capacity-managing. 9% utilization = lots of headroom. The "Overloaded" 529 with "allowed" status from the unified pipeline is a CONTRADICTION. Something is failing UPSTREAM of the account-budget gate.
- **Most likely categories now**: (a) request-content triggering Anthropic-side validation/safety/content errors that surface as 500s, (b) infrastructure errors specific to certain feature flags Claude Code sets (extended thinking, prompt caching, etc.), (c) a network path issue between this Mac and api.anthropic.com causing premature connection drops that LOOK like 5xx, (d) Anthropic edge load-shedding specific accounts/keys that triggered some abuse heuristic.
- **The "3.59M tokens, session_id blank"**: That's a LOT of context. If Sir's W0:Jarvis is at 600k+ context (we saw the chains hit that yesterday), and each tool call replays the full conversation, the cache miss path could be massive. Worth verifying if W0:Jarvis is also at the session-resume threshold.

### 2026-06-23 [e32156d5185b]

- **This is the real root cause and Sir was 100% right that this wasn't random Anthropic load**: A single request with 373K uncached input tokens is enormous. Anthropic's edge/processing layer will return 529 when it can't allocate capacity for a request that big in time, and 500 when internal processing of a request that big hits a transient resource issue. The 500+529 mix is exactly the signature of "one specific client is sending repeatedly-massive uncached prompts."
- **Why Sir's utilization is "only" 9% but he's seeing 5xx**: utilization is metered on cache-discounted tokens (cached input ≈ 10% the cost). With caching at 0%, every request costs 10× more than billed and 10× more than throttled-for. Anthropic's load-shedder sees "this account is sending huge prompts at high frequency" and protects its infrastructure with 5xx even though the *account budget* says "allowed."
- **The `@Resume work from compressed context` annotation is the historical fingerprint**: W0:Jarvis got /compacted (probably by JICM v7.3 watcher or manual), the compact rewrote the conversation summary, and Anthropic's prompt-caching breakpoints invalidated. Every subsequent request rebuilds the cache from scratch — but at 373K tokens that's never going to amortize within a single turn, so the 0% stays 0%.

### 2026-06-23 [a0b6fe4ec0cf]

- **The mechanism Sir was right to suspect**: It IS a local-side cause — not a session ban, not a broken proxy, but Phase B's `--fork-session` pattern from the bloated 600K-token seed. Every forked chain request is huge AND mostly uncached (forks don't preserve cache breakpoints reliably). Anthropic's edge load-shedder sees "this account is sending massive uncached requests at high frequency" and throws 529s. The 500s in the mix are when Anthropic's internal processing fails mid-stream on those oversized requests.
- **Why W0:Jarvis collaterally suffers**: account-level throttling at the Anthropic edge applies to your `organization_id` (`e757d3f5-...`) across ALL sessions. When Phase B's seed-fork chains hit 529s, your W0:Jarvis sees 529s too — even though W0 itself is well-behaved (its requests succeed at 100% cache hit when they get through).
- **The "Fix #6 /compact policy on seed" from yesterday's six-fix sprint** clearly isn't actually firing. The seed is at 600K+ tokens and forks are producing massive requests. Either the policy doesn't trigger at the right threshold, or the /compact ran but the post-compact session is still bloated, or the policy never deployed.
- **My halt of the Protos monitor was right, but for the wrong reason**: I halted to make room for the diagnostic. Turns out the diagnostic IS about Protos. Now that we know, the fix is to suppress the misbehaving Phase B workload, not just stop watching it.

### 2026-06-23 [111fe88f5190]

- **The 500s ONLY appear on the empty-session group, never on seed-session**. That's the clue. 500 vs 529 distinguishes a particular failure mode — and seed-session never triggers it. What's different about W0/W11 vs Phase B chains? Each one carries a LONG persistent context (W0 = 373K, my W11 = some amount, Watcher = sizable). Phase B chains use --fork-session from a seed, then exit per ticket — they don't have multi-day accumulated state.
- **The cache-hot/cache-cold hypothesis fits**: Anthropic's prompt cache has 5-minute idle TTL by default. If your W0 sits idle longer than that (browsing pyright fixes, taking calls, sleeping), the cache expires. The next request has to re-process the ENTIRE 373K-token prompt cold. That cold request is too big for Anthropic's edge to allocate capacity for under any load → 500 or 529. Successful follow-up requests then succeed because cache is warm again.
- **Why this matches "allowed" + low utilization**: Account-budget gate says "yes you have headroom," but the per-request resource allocator says "this single request is too big right now, reject." Two independent gates failing differently. The 500/529 mix isn't load-shedding the *account*, it's load-shedding *individual cold-cache requests*.
- **Why Sir asking Alfred just now got a clean response**: Alfred's request was small AND cache for the seed-session may have just warmed. Single successful turn doesn't disprove the pattern — it confirms cache-warm works.

### 2026-06-23 [8f6e2ce7c8b7]

I'm using `--junitxml` rather than parsing stdout directly. The RTK proxy that wraps shell commands here strips pytest's terminal summary line when output flows through pipes, so the machine-readable XML is the reliable source of pass/fail counts. This is a codebase-specific gotcha I've been bitten by before — capture structured output when the human-readable form is unreliable.

### 2026-06-23 [29a5c73e0214]

Two discoveries beyond the stated scope. (1) The silent-`method`-drop bug from R6 wasn't unique to self-similarity metrics — `topics` (`method`) and `sentiment` (`method`, `granularity`) had the identical `if x in params and x in ALLOWED` pattern. The posture fix generalized across the whole track family. (2) The frontend `n_states` default (5) **diverged** from the backend's `DEFAULT_N_STATES` (10), so interactive runs and batch/manifest runs silently used different defaults — a path-dependent default, exactly the audit's target. Fixed the frontend to the canonical constant.

### 2026-06-23 [79e165314d26]

**Joint-impact reflection (R10 vs R5/R2):** R10 again leans on R5's "hash the effect, not the cause" cache design. Turning verse masking *off* keeps the "1:1." marker tokens in the analyzable stream, which changes the chunk texts. R5's `_embed_cache_label` hashes those chunk texts, so the embedding cache invalidates automatically — no cache-key plumbing for the new toggle, exactly as it needed none for R2's separator or R4's delimiters. And because `analyzable_text(sep)` rebuilds the OffsetMap from the *actual* kept spans every run, the coordinate remapping stays correct regardless of whether the verse layer is in or out. The architecture absorbs R10 cleanly.

### 2026-06-23 [a009e36fb627]

- **The Abou Tayoun co-authorship pattern is the most important finding for engagement strategy**: 5 co-authored papers across 2018–2020, spanning ML somatic calling, RNA-seq diagnostics, phenotype-driven prioritization, and reanalysis viewpoints. This isn't a casual co-author relationship — it's a co-PI partnership that ran the DGD bioinformatics + variant interpretation function together for years. Abou Tayoun is now at Al Jalila Children's in Dubai. If you ever want a warm intro to Sarmady, *this is the person* to route through.
- **The Roche/Spark→Incyte transition is structurally driven, not opportunistic**: The timeline math is unambiguous — SPK-8011 shelved Dec 2024, $2.4B Roche write-down Jan 2025, Genesis-Incyte initial deal Feb 2025, Spark 50%+ layoffs Apr 2025, Sarmady joins Incyte Dec 2025. He didn't leave Spark for Incyte; Roche dismantled the org around him and Incyte was simultaneously staffing up. This matters for how you frame his current role: he's executing a strategy Incyte committed to *before* he arrived, but with deep relevant credentials. Don't congratulate him on the Genesis/Edison deals as if they're his initiatives — they predate him by 6 weeks. Frame them as the inheritance he's now scaling.
- **One UNVERIFIED publication in your link list**: the Genome Research 2019 URL (`vol 29 issue 7 p1144`) couldn't be confirmed as a Sarmady paper through public search. The Sarmady/Monos Genome Research paper that *does* exist is from 2024 (vol 34, MHC haplotyping). Worth double-checking the original source where you got that link before citing it in any document you share with him — being off-by-five-years on his publication record would be the kind of small error that signals "didn't do the homework."
- **Auditability is his philosophical north star**: It's literally in the title of his USPTO patent (12,136,472 — "auditable, continuous optimization"). If you have any work involving traceable/auditable AI pipelines, governance instrumentation, or regulated-context ML, that's the strongest substantive hook.

### 2026-06-23 [5e1c384d0a98]

- **The research agent fabricated a citation**. It claimed "Kim et al. 2025, DOI 10.1056/AIcs2400390" — the real paper is **Wu, Wu, Zou 2025, DOI 10.1056/AIcs2401155**. Both author *and* DOI were wrong. This is a classic LLM failure mode on near-recent academic citations: the model knows the *shape* of an NEJM AI DOI (`10.1056/AIcs24XXXXX`) but invents the digits. Worth a feedback memory: **for any factual claim about a specific publication, the dossier should be considered unverified until the URL or DOI resolves cleanly**. I'll save that.
- **Re-reading Sarmady's actual commentary changes the read of his stance** — it's stronger than I had it. He wrote *"adding new data isn't enough. We need RAG with trusted, version-controlled sources, continuous real-world evaluation, strong governance & traceability."* That's not subtle endorsement-by-repost; that's an **explicit three-point platform statement** for how clinical AI should be architected. "Version-controlled sources" + "governance & traceability" is the same vocabulary as his USPTO patent on auditable variant interpretation — the through-line from 2017 CHOP to 2026 Incyte is consistent.
- **The short-link discovery is the cheapest verification path**: `nejm.ai/4nTx1Np` resolved with one 301 redirect to the canonical DOI URL. When Sir gives me a LinkedIn post next time, I should grab any short URLs verbatim and resolve them *first* — that beats both web search and asking an agent to find the paper from prose description.

### 2026-06-23 [004ef9d0050e]

- **The Genome Research 2019 mystery is solved and the prior agent was wrong twice**: the URL DOES resolve to a Sarmady-authored paper — Evans et al. 2019, PathoPredictor (disease-specific ML for variant pathogenicity prediction). PMID 31235655. He's 6th of 7 authors. This is actually a *fourth* Abou-Tayoun co-authored paper from his CHOP period, strengthening the network signal further.
- **INCB057643 BET inhibitor was a hard contradiction**: claimed Phase 3 in myelofibrosis — actually never reached Phase 3, was discontinued by Incyte October 2025 amid class-wide BET safety concerns. This is the kind of error that, if cited to Sarmady, would signal real ignorance about his current employer's actual pipeline. Cutting it entirely.
- **The Pearl model benchmark is more impressive than I had it**: not just "beat AlphaFold 3" — it beat AlphaFold 3, Boltz-1, Boltz-1x, Boltz-2, Chai-1, AND Protenix. That's a clean sweep of every leading co-folding model. Worth being precise about because it's the technical substrate of his current most-visible partnership.
- **The DOI hallucination was worse than the Wu/Wu/Zou case** — the DOI `10.1093/clinchem/hvz044` returns 404. It's not just wrong-paper, it's a totally non-existent identifier. Real DOI is `10.1373/clinchem.2019.308213`. Worth a feedback memory addendum: even DOIs that *look* perfectly formatted can be invented whole-cloth.

### 2026-06-23 [5833c727db3f]

- **The verification surfaced a hidden new paper for him**. The Genome Research 2019 entry that the first agent flagged as "unverifiable" turned out to be **PathoPredictor** (Evans et al., PMID 31235655) — Sarmady as 6th of 7, Abou Tayoun senior. This actually *strengthens* the engagement-hook list: PathoPredictor's thesis is that "disease-specific clinical sequencing datasets train better pathogenicity models than general-purpose predictors," which is conceptually identical to what Incyte is now doing with Genesis at industrial scale — fine-tuning foundation models on Incyte's proprietary chem data rather than relying on generic open models. Sarmady has been advocating context-specific over general-purpose model training for 7+ years. That's a much sharper through-line for engagement than I had before.
- **Six contradictions in the first draft is a sobering quality benchmark**. The verification pass found errors at roughly a 20% rate across specific factual claims — DOI, two person-titles, a drug pipeline status, a funding-round date, and a company-HQ location. Each one individually was small. Cumulatively they would have damaged credibility. For artifacts that are *user-facing externally* (vs. internal scratch), a verification pass is now table stakes, not optional. Updated the feedback memory to capture all four major fabrication types so future research-agent invocations carry the warning.
- **Cagnoni's actual quote is interesting in a way the paraphrase obscured**: *"Our vision is for our data to become a learning system that enhances every decision."* The verb "**become**" implies the data isn't *currently* a learning system — they're aspirationally framing the Kosmos partnership as the path from static data to live learning substrate. That's exactly the kind of value-prop framing Sarmady would have helped construct internally if he was involved in the partnership rollout. Worth keeping the exact verb if you ever quote it back to him.
- **Sarmady's own LinkedIn bullets contain a tell I missed in the first draft**: he listed "**and COGs**" (cost of goods sold) as an outcome of his Spark work. Gene therapy COGs are notoriously brutal (LUXTURNA is $850K/eye, mostly manufacturing). That he claims credit for COGs reduction means his Spark data science org did *manufacturing-economics modeling*, not just discovery. That's a much broader scope than "AI for drug discovery" and may be a differentiator vs other comp-bio VPs in the industry — worth probing in conversation.

### 2026-06-23 [ef4153e2eaf9]

- **Print CSS is structurally different from screen CSS**, not just a tweak. The three high-value patterns I'll use: (1) `@page` rules to set physical margins (browsers vary wildly on defaults; this normalizes); (2) `a[href]::after { content: " (" attr(href) ")" }` inside `@media print` so URLs become visible on paper — invaluable for a citation-dense doc like this; (3) `page-break-inside: avoid` on tables and section blocks so a paper page doesn't slice a verification row in half.
- **Choosing the font stack matters for printability**: I'll use Georgia/serif for body text (serifs aid eye-tracking on paper) and a system-ui sans for headings (clear hierarchy contrast). Sizing in `pt` (not `rem`) for print — pt is a physical unit that maps directly to printer DPI.
- **One single self-contained HTML file** (CSS inlined in `<style>`, no external assets, no JavaScript). That means Sir can open it directly in any browser, double-click → print, no broken-asset risk.

### 2026-06-23 [f02df8f20e17]

- The silent-passthrough bug (C4) is structural: `_remap_signal_dir` only recognizes two shapes via `if/elif`, and the `else` does nothing — so a novel output shape keeps analyzable coordinates while being labeled original. The fix isn't "handle more shapes" (unbounded) but "fail loud on anything not provably handled."
- The enforceable invariant: the known offset keys (`segment_offsets`, `char_*`) may only occupy *blessed positions* (top-level manifest field; one-per-record in a top-level array). A known key found anywhere else means a producer emitted offsets the remap would skip — assert and raise. Plus a declaration hook (`analyzable_coordinate_fields`) so a novel field can opt into remapping + assertion.

# Insights Archive — 2026-07-07
# Rotated: 2026-07-07T19:36:48Z (1 entries)

### 2026-06-23 [1f4665e7b1ea]

- **Checkpoint vs. scratchpad divergence**: JICM's compressed checkpoint was generated at `19:36:48Z` *during* the staging step, so it froze a "Commit 1 pending" view. The scratchpad got updated *after* both commits landed. When two persisted states disagree, the git tree is ground truth — and here it vindicates the scratchpad.
- **Why the split was unusual**: `cd30274` is intentionally *not* independently test-green — its `project.py` API changes are consumed by the mixed files in `4f71d83`. Only the final tip is verified green. That's an accepted cost of splitting entangled history by concern (R-work vs. D1 guard-rails) rather than by testability.

# Insights Archive — 2026-07-07
# Rotated: 2026-07-07T22:41:19Z (2 entries)

### 2026-06-23 [f5f39632d8d8]

- **One rail, two honest entry points**: the CLI (`extract()` directly) and the server (`_extract_masked` → async job) both already surface raised exceptions with the real type+message. That's why replacing `return []` with `raise InsufficientCorpusError(...)` is the *whole* fix for B5 — the G5 rail already carries it to the user. No per-entry-point error plumbing needed.
- **`effective_params()` collapses to `resolved_params()` when nothing clamps**, so threading it through `parameters()`/`track_provenance` is safe for every track that never clamps — the rail addition is invisible until a clamp is actually recorded.

### 2026-06-23 [f1d536d857f6]

- **The two "big" tracks turned out to scope very differently.** self_similarity looked heaviest, but D3's phase split moved its cache-hardening (C2) to Phase 2, leaving only the transparency work — which made it smaller than expected. The genuinely large remaining piece is **#6: the 10 un-parameterized tracks** (`lexical`, `dialogue`, `entities`, `syntax`, `coreference`, `alphabet`, `narrative_arc`, `compartments`, `rqa`, `boundary_detection`), none of which have *any* param contract today.
- Most of #6 is mechanical (declare each track's hidden constants as `locked` Params on the rail the first three tracks built), but two carry **real bugs**: `alphabet` has the same A2 count-clamp (`n_clusters`), and `compartments` silently returns an all-zero signal on `LinAlgError` (B5) — a failed eigenvector masquerading as data.

# Insights Archive — 2026-07-07
# Rotated: 2026-07-08T00:26:22Z (4 entries)

### 2026-06-23 [aac09ec7a4d9]

- **All three appear to be Spark → Incyte transfers**: Sarmady (verified from earlier dossier), Raman (his Cancer Cell 2024 paper still carried CHOP affiliations, suggesting Incyte transition was 2025+), and possibly Noroozi (LinkedIn shows Spark; if he is your hiring manager at Incyte, that's a very recent move). This is a **coordinated team migration pattern**, not three independent hires. The Roche/Spark $2.4B impairment and 52% layoffs in early 2025 dispersed the data-science org — Sarmady was one node of that diaspora, and he appears to have pulled at least two colleagues (Raman, possibly Noroozi) into Incyte. Worth knowing in the meeting because: (a) they will already know each other and reference shared past work; (b) the "what we're trying to build at Incyte" vision is likely a continuation of what they were unable to finish at Spark, not a clean-slate strategy; (c) the Spark/Roche collapse is recent emotional territory — best to lead with Incyte forward, as your closing note now does.
- **Tone-calibration for the closing**: I drafted three sentences — gratitude + what stood out about the group + concrete fit — and resisted the temptation to name-drop their work or be sycophantic. The specific phrase "**cross-disciplinary commitment**" picks up your request exactly; "**direct accountability to scientific end-users**" mirrors Sarmady's stated values from the NEJM AI commentary (governance, traceability, version-controlled sources for clinical use); "**multi-modal platforms**" lands on Noroozi's data-engineering wheelhouse without naming him. The note works whether or not all three are in the room.
- **Renumbering decision**: dropping 6 entries leaves 11. I renumbered them 1–11 sequentially. Pre-DNAnexus academic foundation is now entry **11** (rather than **16**) which sits at the end as biographical depth rather than buried in a long list.

### 2026-06-23 [c7beeedfd643]

- **Strategic note about Pichai Raman that may be useful in-person**: if Raman is in any of your meetings, his work on the **CdLS RNA-seq paper alongside Sarmady** at CHOP is the same intellectual move as your Bayer GCKD biomarker harmonization and Lilly OMOP work — clinical data + omics, normalized into actionable form for clinicians. His **OncoTree** paper (JCO CCI 2021) on cancer classification standardization is also conceptually adjacent to your ontology-integration work on the PrimeKG-extended knowledge graph (entry #10 in the report). If RNA-seq or cancer classification comes up as a topic, you have direct technical credibility on both sides of the conversation. His **annoFuse** paper is about RNA-fusion annotation — adjacent to your TCGA gene-fusion 5′/3′ classification work in entry #9.
- **The Noroozi-Spark-LinkedIn discrepancy is worth registering quietly**: if he is actually the hiring manager at Incyte, his LinkedIn hasn't been updated yet — which means his Incyte tenure is *very* recent (weeks, not months). That fits the pattern of the Sarmady-led migration. Practical implication: he may still be ramping on Incyte's specific tooling and culture; your demonstrated ability to "drop into an unfamiliar codebase and ship in 12 weeks" is directly relevant to *his current situation*, not just an abstract role description.
- **The closing note avoids three traps I considered and rejected**:
  1. *Name-dropping the three of them* — would have read as ingratiating; the note is stronger by addressing "your group" and trusting them to recognize the alignment.
  2. *Sentimental escalation* ("I would be so excited," "It would be an honor") — undermines professional register; restrained warmth lands better with an adversarial-review culture.
  3. *Restating the matrix* — the closing isn't a TL;DR of the report; it's a register-shift to "I want to work with you specifically." The three sentences earn that shift by being concrete about what intersection you're describing.

### 2026-06-23 [7edae014176e]

- **Three-column structure vs. inline parenthetical**: I considered just appending "(tools: STAR, Salmon, DESeq2, edgeR...)" inline within each existing cell, but that buries the tooling in prose. A dedicated **"Representative tools / packages"** column makes the breadth scan-able — a reader can take in the entire toolset for one analysis category at a glance, which is what hiring managers and senior engineers look for when they're checking "does this person actually know the ecosystem." The cost is table width, which on PDF rendering will be tight but acceptable; on screen/web it's a non-issue.
- **Selection discipline**: for each row I picked **5–15 representative tools** across CLI/Python/R, weighted toward what an Incyte-shaped role actually uses (Iceberg/Glue/Dagster/dbt for storage-orchestration; GATK/DeepVariant/Mutect2/STAR-Fusion/maftools for the cancer-genomics ecosystem they're building toward). I avoided listing every tool that exists (e.g., I picked Salmon and Kallisto for quantifiers but didn't enumerate every aligner); the goal is "this person is in the ecosystem," not "this person can recite a directory listing."
- **Two tools I specifically included for Incyte-context relevance**: **OHDSI Hades suite** (R packages: Achilles, DataQualityDashboard, FeatureExtraction, CohortMethod, PatientLevelPrediction) — the standard pharma OMOP toolkit, directly relevant if Incyte does RWE work; and **MedSpaCy/scispaCy/MetaMap/cTAKES** for clinical NLP — relevant if any of the unstructured oncology-notes work is in scope. Both show "I know the named toolkits that pharma standardizes on" rather than just "I can do this from scratch."

### 2026-06-23 [195c189a7d0e]

This bug is invisible in normal runs because SQLite *happens* to return tied rows in rowid (insertion) order — which equals chunk order here. But that's an implementation accident, not a guarantee: an index on `para_index`, a VACUUM, or a planner change could reorder them, corrupting the matrix with no error. The audit's C2 "store/sort by chunk_index" instinct is right; the minimal guaranteed-correct fix is a deterministic tiebreaker.

# Insights Archive — 2026-07-07
# Rotated: 2026-07-08T03:04:37Z (6 entries)

### 2026-06-23 [d5e53ffddd49]

The audit flagged batch_size exclusion as "UNCERTAIN"; now it's settled with evidence. A cosine of exactly 1.00000000 (not 0.9999…) shows MLX embeds each text in isolation — no batched-matmul float nondeterminism perturbing the low bits. The R5 design was right to exclude it. The remaining C2 sub-item (model *name* vs content *digest* in the key) is a real limitation but needs a provider-supplied model fingerprint that doesn't exist yet — a flag, not a quick fix.

### 2026-06-23 [726e11b35e99]

The most instructive moment was Finding 4. The reviewer flagged "always emits method" as a contract violation — but the existing test deliberately asserts `method == "GaussianHMM"` for a *successful* run. That's the difference between a fresh-eyes review (sees a docstring/behavior mismatch) and context (knows the behavior is the point: the static label "Gaussian HMM" is a *lie* if the run fell back to KMeans, so confirming the real method is valuable even on success). The fix was to make the docstring honest, not to delete the feature.

### 2026-06-23 [43beee50fe67]

The JICM checkpoint had narrowed to a trivial "verify the scratchpad append" task, but the scratchpad itself carried the real state. This is the designed L1/L3 division: the checkpoint (L3) is a lossy LLM summary that can freeze a stale sub-step, while the scratchpad (L1) is the authoritative working log. Reconciling them against **git** (the true ground truth) is what catches checkpoint drift — and here all three agree.

### 2026-06-23 [4570f265994b]

The verification followed a tracing-honesty discipline: rather than trusting the checkpoint or even the scratchpad's "DONE + VERIFIED" labels, I re-ran the actual gates (pytest, tsc, vitest) and cross-checked git. The scratchpad's claims held perfectly — which is the point: a self-report is a *claim* until the suite is decisive, and after a context refresh the cheapest insurance against acting on stale state is to re-establish ground truth before touching anything.

### 2026-06-23 [1185fea9713d]

I staged the 8 files by explicit path rather than `git add -A` — that's what kept the 12 screenshot PNGs out of the commit without needing a `.gitignore` change. The protocol's "name files explicitly" rule does real work here: a blanket add would have swept in artifacts that were deliberately excluded, and the diffstat check (`--cached --stat` showing exactly 8 files, +297/−9) is the cheap confirmation that staging matched intent before the commit became permanent.

### 2026-06-24 [6b68c60e08af]

This is why I verified instead of asserting. Both recon agents concluded the `parent_id=None` issue was a *gold-fixture* artifact (the `bible_structure.py` builder bypassing `_compute_parents`). But the **pipeline-imported Geneva Bible also shows 0%** — while novels show 94%. So `_compute_parents` (layout.py:751, called at the tail of `detect_layout_sections`) works for prose but produces *zero* nesting for scripture-structured documents. That reclassifies the bug from "fixture-only" to a **production bug affecting the entire Bible corpus** — which is precisely this platform's core use case. Had I trusted the agent summaries, the dev plan would have mis-prioritized it as a test-data fix.

