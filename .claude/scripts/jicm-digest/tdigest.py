#!/usr/bin/env python3
"""tdigest2 — fact-sheet-grounded digest. Python supplies identifiers; LLM supplies prose."""
import json,re,sys,os,glob,time,argparse,subprocess,collections
P=os.path.expanduser("~/.claude/projects")
RE_PATH=re.compile(r'(?:[\w.~-]*/)+[\w.-]+\.[A-Za-z0-9]{1,6}|\b[\w-]+\.(?:py|sh|md|json|jsonl|ts|tsx|js|yaml|yml|toml|txt|html)\b')
RE_HASH=re.compile(r'\b[0-9a-f]{7,40}\b')
RE_METRIC=re.compile(r'\b\d+\.\d{2,4}\b|\b\d+(?:,\d{3})+\b|\bp=0\.\d+\b|\b\d+/\d+\b|\b\d+(?:\.\d+)?%')
def base(p): return p.strip('`"\'(),;:').split('/')[-1]

def extract(sid, reason_cap=0, tail_turns=0):
    f=sorted(glob.glob(f"{P}/*/{sid}*.jsonl"),key=os.path.getsize,reverse=True)
    if not f: sys.exit(f"no transcript {sid}")
    f=f[0]
    pc=collections.Counter(); hc=collections.Counter(); mc=collections.Counter()
    plast={}; hlast={}; mlast={}; _i=[0]
    segs=[]; gt_paths=set(); gt_hash=set()
    for line in open(f,errors="replace"):
        try: r=json.loads(line)
        except: continue
        # Whitelist (hallucination check) harvests from the RAW record — permissive, so a
        # legitimate tool-param path is never flagged. Salience (fact sheet + recovery) is
        # counted ONLY from conversation prose below: hook files like context-injector.js
        # appear in every system-reminder and would otherwise dominate by raw frequency.
        for m in RE_PATH.findall(line): gt_paths.add(base(m))
        for m in RE_HASH.findall(line): gt_hash.add(m)
        if r.get("type") not in ("user","assistant"): continue
        c=r.get("message",{}).get("content"); blocks=[]
        if isinstance(c,str): blocks=[("text",c)]
        elif isinstance(c,list):
            for b in c:
                if b.get("type")=="text": blocks.append(("text",b.get("text","")))
                elif b.get("type")=="thinking": blocks.append(("thinking",b.get("thinking","")))
        for kind,txt in blocks:
            if not txt or not txt.strip(): continue
            _i[0]+=1
            for m in RE_METRIC.findall(txt): mc[m]+=1; mlast[m]=_i[0]
            for m in RE_PATH.findall(txt): pc[base(m)]+=1; plast[base(m)]=_i[0]
            for m in RE_HASH.findall(txt): hc[m]+=1; hlast[m]=_i[0]
            if r["type"]=="user":
                if re.search(r'<system-reminder>|hook success|<local-command-|<command-name>|Caveat: The messages',txt): continue
                segs.append(("USER",txt.strip()))
            elif kind=="thinking":
                t=txt.strip()
                if reason_cap and len(t)>reason_cap: t=t[:reason_cap]+" …[trimmed]"
                segs.append(("REASONING",t))
            else: segs.append(("ASSISTANT",txt.strip()))
    if tail_turns: segs=segs[:2]+segs[-tail_turns:]
    prose="\n\n".join(f"{k}: {v}" for k,v in segs)
    return f,prose,gt_paths,gt_hash,pc,hc,mc,len(segs),(plast,hlast,mlast)

def factsheet(pc,hc,mc,topn=40,last=None,order='freq'):
    """order='recency' ranks by LAST mention — what the session was doing when it died is
    what the successor most needs. order='freq' ranks by total mentions.

    B4 FIX: the two orderings must differ ONLY in ORDER. The recency branch previously
    dropped the "(N x)" mention counts that the freq branch kept, so order and format varied
    together and the ordering comparison was confounded. Counts now appear in BOTH."""
    rec = (order=="recency" and last)
    pl,hl,ml = last if last else ({},{},{})
    if rec:
        pk=sorted(pc,key=lambda k:-pl.get(k,0))[:topn]
        L=["## FACT SHEET — the ONLY identifiers you may use","### Files (most recent first)"]
        L+=[f"- {x}  ({pc[x]}×)" for x in pk]
        hk=[x for x in sorted(hc,key=lambda k:-hl.get(k,0))[:8] if not x.isdigit()]
        mk=sorted(mc,key=lambda k:-ml.get(k,0))[:24]
    else:
        L=["## FACT SHEET — the ONLY identifiers you may use","### Files (by mentions)"]
        L+=[f"- {p}  ({n}\u00d7)" for p,n in pc.most_common(topn)]
        hk=[x for x,n in hc.most_common(8) if not x.isdigit()]
        mk=[x for x,n in mc.most_common(24)]
    if hk: L+=["### Commit-like hashes"]+[f"- {x}" for x in hk]
    if mk: L+=["### Key numbers / metrics"]+[f"- {x}" for x in mk]
    return "\n".join(L)

def sysprompt(size,focus,style,caveman,grounded):
    F={"steps":"Prioritise COMPLETED STEPS in order, with concrete artifacts.",
       "reasoning":"Prioritise REASONING: problems, hypotheses, what was falsified and why.",
       "balanced":"Balance completed steps against the reasoning that produced them."}[focus]
    S={"forensic":"FORENSIC RECORD: terse ordered findings under headings.",
       "dialog":"TWO-PERSON DIALOG: alternating USER:/JARVIS: turns.",
       "train":"RUNNING TRAIN OF THOUGHT: one flowing narrative fusing intent, reasoning, response."}[style]
    p=[f"You distil an ABANDONED session transcript so the NEXT session continues seamlessly. It has NO memory of this one.",F,S]
    if grounded:
        p.append("IDENTIFIER RULE (ABSOLUTE): every filename, path, hash and metric you write MUST appear "
                 "VERBATIM in the FACT SHEET. Copy them character-for-character. If a fact is not in the "
                 "FACT SHEET, describe it in words WITHOUT inventing a name. Never guess a date in a filename.")
        p.append("USE THE FACT SHEET RICHLY: name as many of its files and metrics as are relevant — but ALWAYS "
                 "inside a sentence saying what happened to that file or what that number measured. Do NOT copy "
                 "the sheet's layout: no bullet lists of bare filenames, no bare numbers, never the (N×) counts.")
        p.append("THE FACT SHEET IS REFERENCE ONLY. Never reproduce it. Never emit a list of files, a list of "
                 "bare numbers, or the (N×) mention counts. Every identifier must sit inside a sentence that "
                 "says what happened to it. A digest that lists identifiers without explaining them is a FAILURE.")
    else:
        p.append("Never invent a file path or hash; reproduce identifiers exactly.")
    p.append(f"Write approximately {size} words of substantive prose under section headings, then stop.")
    if caveman: p.append("CAVEMAN: omit articles/copulas/filler; telegraphic. Identifiers and numbers stay exact.")
    return "\n".join(p)

def echo_rate(out, fs):
    """Fraction of output lines that are verbatim fact-sheet lines (Goodhart guard):
    a model can score perfect recovery + zero hallucination by simply copying the sheet."""
    if not fs: return 0.0
    fl={l.strip() for l in fs.splitlines() if l.strip().startswith("- ")}
    ol=[l.strip() for l in out.splitlines() if l.strip().startswith("- ")]
    if not ol: return 0.0
    return round(sum(1 for l in ol if l in fl)/len(ol),3)

def audit(out,gt_paths,gt_hash,pc,topk=15,last=None):
    op={base(m) for m in RE_PATH.findall(out)}; oh=set(RE_HASH.findall(out))
    badp=sorted(x for x in op if x not in gt_paths); badh=sorted(x for x in oh if x not in gt_hash)
    tot=len(op)+len(oh); bad=len(badp)+len(badh)
    # NEUTRAL target: union of top-K by frequency AND top-K by recency. Scoring only
    # against frequency-salience gave the freq-ordered sheet a home-field advantage.
    salient=[p for p,_ in pc.most_common(topk)]
    if last:
        salient=list(dict.fromkeys(salient+sorted(pc,key=lambda k:-last[0].get(k,0))[:topk]))
    rec=sum(1 for s in salient if s in op)/len(salient) if salient else 0
    return dict(halluc=(bad/tot if tot else 0.0),bad_paths=badp[:5],bad_hashes=badh[:3],
                recovery_topk=round(rec,3),out_ids=tot)

def run(model,sp,user,nctx,npred,temp):
    req=dict(model=model,think=False,stream=False,keep_alive=-1,
             options=dict(num_ctx=nctx,num_predict=npred,temperature=temp),
             messages=[dict(role="system",content=sp),dict(role="user",content=user)])
    t0=time.time()
    r=subprocess.run(["curl","-s","-m","1800","http://localhost:11434/api/chat","-d","@-"],
                     input=json.dumps(req),capture_output=True,text=True)
    el=time.time()-t0
    try: j=json.loads(r.stdout)
    except: return None,el,{}
    return j.get("message",{}).get("content",""),el,j

def assemble(z):
    """Build the EXACT prompt for a session. SINGLE source of truth: pre-warm and the real
    digest MUST produce byte-identical prefixes, and the only way to guarantee that is to have
    one code path. Two paths that merely look the same would drift, and a missed cache is
    invisible — it just looks like a slow model."""
    f,prose,gp,gh,pc,hc,mc,nseg,last=extract(z.sid,z.reason_cap,z.tail)
    # ---- B1: explicit input-budget enforcement ----------------------------------------
    # A >num_ctx prompt used to be clipped by the RUNTIME, silently, from the TAIL — losing the
    # newest turns (what a handoff needs most) while every metric reported success.
    fs_pre = factsheet(pc,hc,mc,40,last,z.order) if z.grounded else ""
    fs_tok = len(fs_pre)//4
    # ---- B5: the trim point must not depend on the fact sheet --------------------------
    # Budgeting against len(factsheet) made the transcript's FIRST token a function of the
    # APPENDIX (sheets 354 vs 368 tok -> budgets 37992 vs 38006 -> different trim points ->
    # void cache). A CONSTANT reservation makes the trim point depend only on the transcript.
    reserve_tok, prefix_stable = z.fs_allowance, True
    if fs_tok > z.fs_allowance:
        # NO SILENT DEGRADATION: budgeting against a too-small reservation would overflow
        # num_ctx and hand clipping back to the runtime — the exact failure B1 removed.
        reserve_tok, prefix_stable = fs_tok, False
        sys.stderr.write(f"ALERT fact-sheet allowance: {z.sid} sheet is {fs_tok} tok > allowance "
                         f"{z.fs_allowance}; budgeting against ACTUAL size — prefix stability "
                         f"FORFEITED for this run (raise --fs-allowance)\n")
    budget_tok = z.nctx - z.npred - reserve_tok - 400        # 400 = system prompt + margin
    est_tok = len(prose)//4
    trimmed_tok = 0; anchor = 0
    # EXPERIMENTAL LEVER (--drop-frac): drop a FRACTION of the oldest transcript regardless of
    # whether the budget requires it. Exists because the trim-vs-recovery question cannot be
    # studied otherwise — only the largest transcript overflows the budget at all, so without
    # this there is exactly one data point and no way to vary it. Default 0.0 = no effect on
    # the shipping path.
    forced_tok = int(z.drop_frac * est_tok) if getattr(z,"drop_frac",0.0) > 0 else 0
    if est_tok > budget_tok or forced_tok > 0:
        parts = prose.split("\n\n")
        # Suffix sizes, so finding the anchor is linear rather than a quadratic pile of joins.
        n=len(parts); suf=[0]*(n+1)
        for i in range(n-1,-1,-1): suf[i]=suf[i+1]+len(parts[i])+(2 if i<n-1 else 0)
        i=0
        while i<n and suf[i]//4 > budget_tok: i+=1
        # ---- PRE-WARM: quantise the anchor in TOKENS ------------------------------------
        # B5 fixed the anchor against the FACT SHEET, but a GROWING session moves it too: every
        # new turn pushes the minimal anchor forward a little, so the prompt's first token
        # changes continuously and the pre-warmed cache is void by the time the hard threshold
        # arrives — on exactly the large sessions pre-warm exists for.
        #
        # So round the amount DROPPED up to a multiple of Q TOKENS. The anchor then moves in
        # jumps, and the guarantee is stated in the unit that matters: a warm survives up to Q
        # tokens of transcript growth, for an average waste of Q/2 of the OLDEST turns. Choose Q
        # against the soft->hard gap. (Quantising by SEGMENT COUNT was the first attempt and is
        # the wrong unit — segments vary in size, so it bought an unpredictable 1500-2500 tok of
        # growth for a 1926 tok cost, with neither number controllable.)
        Q=max(1,z.trim_quantum)
        # The budget requirement and the experimental lever are both LOWER BOUNDS on what must
        # go; the binding one wins. Taking the max (not the sum) keeps --drop-frac 0 exactly
        # equal to the shipping path, so the lever cannot perturb the config it is measuring.
        need   = max(est_tok - budget_tok, forced_tok)
        target = ((need + Q - 1)//Q)*Q               # ...rounded up to a Q boundary
        while i < n-1 and (est_tok - suf[i]//4) < target: i+=1
        anchor=i
        new="\n\n".join(parts[anchor:])
        trimmed_tok = est_tok - (len(new)//4)
        # The marker LEADS the prompt, so its text is part of the cached prefix and may contain
        # only prefix-stable values — hence no token count (that number varies with the budget
        # and would re-break the prefix by itself). The figure lives in the result row instead.
        prose = ("[EARLIER TURNS TRIMMED TO FIT CONTEXT — the oldest turns of this session were "
                 "dropped. The FACT SHEET still covers the WHOLE session.]\n\n") + new
        sys.stderr.write(f"ALERT input-budget: {z.sid} needed {est_tok} tok > budget {budget_tok}; "
                         f"trimmed {trimmed_tok} tok oldest-first (anchor seg {anchor}/{n}, Q={Q})\n")
    # ---- B2: prompt layout -------------------------------------------------------------
    # 'tx' puts the TRANSCRIPT first and the FACT SHEET last: (1) the transcript is what grows
    # and gets trimmed, so it belongs where growth is natural and can never evict the sheet;
    # (2) chronological order means a LONGER session EXTENDS the earlier prefix instead of
    # invalidating it. With the sheet first, one new file mention rewrites token 0 and voids
    # the entire KV cache. This is what makes pre-warm possible at all.
    if not z.grounded:      user=prose
    elif z.layout=="fs":    user=fs_pre+"\n\n## TRANSCRIPT\n"+prose
    else:                   user="## TRANSCRIPT\n"+prose+"\n\n"+fs_pre
    return dict(user=user, sp=sysprompt(z.size,z.focus,z.style,z.caveman,z.grounded),
                fs=fs_pre, gp=gp, gh=gh, pc=pc, last=last, fs_tok=fs_tok,
                prefix_stable=prefix_stable, trimmed_tok=trimmed_tok, anchor=anchor, nseg=nseg)

if __name__=="__main__":
    a=argparse.ArgumentParser()
    a.add_argument("sid"); a.add_argument("--model",default="qwen3-32b-nothink:latest")
    a.add_argument("--size",type=int,default=600); a.add_argument("--focus",default="balanced")
    a.add_argument("--style",default="forensic"); a.add_argument("--caveman",action="store_true")
    a.add_argument("--nctx",type=int,default=40960); a.add_argument("--npred",type=int,default=2200)
    a.add_argument("--temp",type=float,default=0.0)
    a.add_argument("--reason-cap",type=int,default=0); a.add_argument("--tail",type=int,default=0)
    a.add_argument("--grounded",action="store_true"); a.add_argument("--show",action="store_true")
    a.add_argument("--tag",default=""); a.add_argument("--order",default="freq")
    a.add_argument("--layout",default="tx",choices=["tx","fs"])
    # B5: constant reservation for the fact sheet. Must EXCEED any sheet this config can emit,
    # or the run falls back to actual-size budgeting and forfeits prefix reuse (it alerts).
    a.add_argument("--fs-allowance",type=int,default=900)
    # Pre-warm: TOKEN quantum for the trim anchor. A pre-warm survives up to Q tokens of
    # transcript growth; average cost is Q/2 of the oldest turns. Set against the soft->hard gap.
    # Q=1 disables quantisation (reproduces the pre-pre-warm behaviour exactly).
    a.add_argument("--trim-quantum",type=int,default=4000)
    # Populate the KV cache and STOP. Same prompt, num_predict=1 — no digest is produced.
    a.add_argument("--prewarm",action="store_true")
    # Report the trim anchor WITHOUT contacting the model. The pre-warm scheduler needs to know
    # whether the prefix has moved, and that question must be answerable for the price of a
    # transcript read — asking the GPU on every watcher tick would cost more than it saves.
    a.add_argument("--anchor-only",action="store_true")
    # Experimental: force-drop this fraction of the OLDEST transcript even when the budget does
    # not require it. Research lever only — 0.0 leaves the shipping path bit-identical.
    a.add_argument("--drop-frac",type=float,default=0.0)
    # Write the digest TEXT here. The JSON row still goes to stdout, so a caller gets the
    # verdict fields (degenerate/truncated/halluc) and the artifact separately — parsing the
    # digest back out of stdout would couple the actuator to this script's print formatting.
    a.add_argument("--out",default="")
    z=a.parse_args()

    A=assemble(z)
    common=dict(tag=z.tag,order=z.order,layout=z.layout,
                model=("32B" if "32b" in z.model else "8B"),grounded=z.grounded,
                factsheet_tok=A["fs_tok"],prefix_stable=A["prefix_stable"],
                input_trimmed_tok=A["trimmed_tok"],trim_anchor=A["anchor"],quantum=z.trim_quantum,
                drop_frac=z.drop_frac)

    if z.anchor_only:
        # Same assemble() as every other mode — the anchor reported here is BY CONSTRUCTION the
        # anchor the real prompt will use. Deriving it separately would be the classic drift bug:
        # a scheduler confidently tracking a number the prompt no longer depends on.
        print(json.dumps(dict(common,mode="anchor",sid=z.sid,prompt_chars=len(A["user"]))))
        sys.exit(0)

    if z.prewarm:
        # Generation is the part we are deliberately NOT paying for here; num_predict=1 makes
        # the request cost ~= prompt evaluation alone. keep_alive=-1 (set in run()) is what
        # holds the model — and its cache — resident until the hard threshold arrives.
        out,el,j=run(z.model,A["sp"],A["user"],z.nctx,1,z.temp)
        if out is None: sys.exit("prewarm: LLM failed")
        print(json.dumps(dict(common,mode="prewarm",elapsed=round(el,1),
              prompt_s=round(j.get("prompt_eval_duration",0)/1e9,1),
              in_tok=j.get("prompt_eval_count",0),
              runtime_clipped=bool(j.get("prompt_eval_count",0)>=z.nctx))))
        sys.exit(0)

    out,el,j=run(z.model,A["sp"],A["user"],z.nctx,z.npred,z.temp)
    if out is None: sys.exit("LLM failed")
    au=audit(out,A["gp"],A["gh"],A["pc"],15,A["last"])
    oc=j.get("eval_count",0)
    er=echo_rate(out,A["fs"])
    # B3: genuine output truncation is ONLY "ran into the generation cap". The old detector also
    # flagged any digest not ending in terminal punctuation — a leftover from the removed
    # "## END" instruction — firing on complete digests that ended in a heading or identifier.
    # `soft_end` keeps that weaker signal visible without contaminating the verdict.
    trunc = oc >= z.npred-2
    soft_end = not re.search(r'[.!?]”?\s*$', out.strip())
    # DEGENERATE-OUTPUT GUARD (No Silent Degradation). Found by the trim sweep: f56d4d98 at
    # drop-frac 0.10 returned 26 words — "I've pruned the scratchpad to 80 lines... Done." The
    # model had slipped into CONTINUATION mode, answering as the assistant inside the transcript
    # instead of digesting it. Every existing guard passed it: not truncated (it stopped on its
    # own), terminal punctuation present, zero hallucination (it named nothing), echo 0.0. A
    # failed digest was reported as a clean success, which is exactly the failure class we do not
    # permit. Length is the cheap tell: a digest asked for ~N words that returns a small fraction
    # of N did not do the task. This FLAGS and ALERTS; it never silently retries or accepts.
    n_words = len(out.split())
    degenerate = n_words < max(40, z.size//4)
    if degenerate:
        sys.stderr.write(f"ALERT degenerate output: {z.sid} produced {n_words} words for a "
                         f"{z.size}-word request — likely continuation-mode (model answered AS "
                         f"the transcript's assistant instead of digesting it). NOT a usable "
                         f"digest; do not ship this run.\n")
    print(json.dumps(dict(common,mode="digest",
      style=z.style,focus=z.focus,cave=z.caveman,rcap=z.reason_cap,tail=z.tail,size=z.size,
      elapsed=round(el,1),prompt_s=round(j.get("prompt_eval_duration",0)/1e9,1),
      in_tok=j.get("prompt_eval_count",0),out_tok=oc,words=len(out.split()),
      runtime_clipped=bool(j.get("prompt_eval_count",0)>=z.nctx),
      truncated=bool(trunc),soft_end=bool(soft_end),degenerate=bool(degenerate),halluc=round(au["halluc"],3),
      recovery=au["recovery_topk"],echo=er,out_ids=au["out_ids"],bad=au["bad_paths"])))
    if z.out:
        # Write only AFTER the verdict fields are computed, so a caller that checks the row can
        # trust that the file it is about to read corresponds to the row it just parsed.
        try:
            with open(z.out,"w") as fh: fh.write(out)
        except Exception as e:
            sys.stderr.write(f"ALERT: could not write digest to {z.out}: {e}\n"); sys.exit(1)
    if z.show: print("----- DIGEST -----"); print(out)
