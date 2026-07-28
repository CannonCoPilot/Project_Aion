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
    z=a.parse_args()
    f,prose,gp,gh,pc,hc,mc,nseg,last=extract(z.sid,z.reason_cap,z.tail)
    # ---- B1 FIX: explicit input-budget enforcement -------------------------------
    # Previously a >num_ctx prompt was clipped by the RUNTIME, silently, from the TAIL —
    # losing the newest turns (exactly what a handoff needs) while every metric reported
    # success. Now: measure first, trim OLDEST-first so the newest survive, and RECORD it.
    fs_pre = factsheet(pc,hc,mc,40,last,z.order) if z.grounded else ""
    fs_tok = len(fs_pre)//4
    # ---- B5 FIX: the trim point must not depend on the fact sheet ------------------
    # B1's fix and B2's fix collided. B1 budgeted against len(factsheet) — correct arithmetic,
    # but it made the transcript's FIRST token a function of the APPENDIX: two runs whose sheets
    # differed by 14 tokens (37992 vs 38006 budget on 01d1ae83) trimmed at different points, so
    # the prefixes diverged and the KV cache was void. That is why the one trimmed transcript was
    # the one with no cache reuse, killing pre-warm on exactly the large sessions it exists for.
    # So reserve a CONSTANT allowance instead. The sheet is bounded by construction (topn files +
    # 8 hashes + 24 metrics), so a fixed reservation is honest, and the trim point now depends
    # only on the transcript — identical prefixes across sheet variants and across a GROWING
    # session, which is the precondition for pre-warm.
    reserve_tok  = z.fs_allowance
    prefix_stable = True
    if fs_tok > z.fs_allowance:
        # NO SILENT DEGRADATION: budgeting against a too-small reservation would overflow num_ctx
        # and hand the clipping back to the runtime — the exact silent failure B1 removed. Fall
        # back to actual size (correct, still safe) and ALERT that THIS run forfeits prefix reuse.
        # A recurring alert here means the allowance is mis-sized and should be raised, not that
        # the run should be accepted as-is.
        reserve_tok = fs_tok
        prefix_stable = False
        sys.stderr.write(f"ALERT fact-sheet allowance: {z.sid} sheet is {fs_tok} tok > allowance "
                         f"{z.fs_allowance}; budgeting against ACTUAL size — prefix stability "
                         f"FORFEITED for this run (raise --fs-allowance)\n")
    budget_tok = z.nctx - z.npred - reserve_tok - 400        # 400 = system prompt + margin
    est_tok = len(prose)//4
    trimmed_tok = 0
    if est_tok > budget_tok:
        parts = prose.split("\n\n")
        while parts and (len("\n\n".join(parts))//4) > budget_tok:
            parts.pop(0)                                     # drop OLDEST segment
        new = "\n\n".join(parts)
        trimmed_tok = est_tok - (len(new)//4)
        # The marker leads the prompt, so its TEXT is part of the cached prefix. It may only
        # contain values that are themselves sheet-independent — hence no token count here:
        # under the old budgeting an interpolated number would have re-broken the prefix by
        # itself, even with the trim point fixed. The exact figure lives in the row instead.
        prose = ("[EARLIER TURNS TRIMMED TO FIT CONTEXT — the oldest turns of this session were "
                 "dropped. The FACT SHEET still covers the WHOLE session.]\n\n") + new
        sys.stderr.write(f"ALERT input-budget: {z.sid} needed {est_tok} tok > budget {budget_tok}; "
                         f"trimmed {trimmed_tok} tok oldest-first\n")
    fs=fs_pre
    # ---- B2: prompt layout -------------------------------------------------------
    # 'tx' (default) puts the TRANSCRIPT first and the FACT SHEET last. Two reasons:
    #  (1) semantics — the transcript is the part that grows and gets trimmed, so it belongs
    #      where growth is natural; the sheet is a fixed-size appendix that must never be the
    #      thing an overflow eats.
    #  (2) prefix-cache reuse — the transcript is chronological, so a later run of a LONGER
    #      session EXTENDS the earlier prompt's prefix instead of invalidating it. With the
    #      sheet first, every new file mention rewrites token 0 and voids the whole KV cache.
    #      This is the precondition for the soft-threshold pre-warm (142s -> 53s measured).
    # 'fs' reproduces the original sheet-first layout for comparison.
    if not z.grounded:      user=prose
    elif z.layout=="fs":    user=fs+"\n\n## TRANSCRIPT\n"+prose
    else:                   user="## TRANSCRIPT\n"+prose+"\n\n"+fs
    sp=sysprompt(z.size,z.focus,z.style,z.caveman,z.grounded)
    out,el,j=run(z.model,sp,user,z.nctx,z.npred,z.temp)
    if out is None: sys.exit("LLM failed")
    au=audit(out,gp,gh,pc,15,last)
    oc=j.get("eval_count",0)
    er=echo_rate(out,fs)
    # B3 FIX: genuine output truncation is ONLY "ran into the generation cap". The old
    # detector also flagged any digest not ending in terminal punctuation — a leftover from
    # the removed "## END" instruction — which fired on perfectly complete digests ending in
    # a heading, a list item or an identifier. `soft_end` keeps that weaker signal visible
    # for inspection without letting it contaminate the truncation verdict.
    trunc = oc >= z.npred-2
    soft_end = not re.search(r'[.!?]”?\s*$', out.strip())
    print(json.dumps(dict(tag=z.tag,order=z.order,layout=z.layout,model=("32B" if "32b" in z.model else "8B"),grounded=z.grounded,
      style=z.style,focus=z.focus,cave=z.caveman,rcap=z.reason_cap,tail=z.tail,size=z.size,
      elapsed=round(el,1),prompt_s=round(j.get("prompt_eval_duration",0)/1e9,1),
      in_tok=j.get("prompt_eval_count",0),out_tok=oc,words=len(out.split()),
      input_trimmed_tok=trimmed_tok,factsheet_tok=fs_tok,prefix_stable=prefix_stable,
      runtime_clipped=bool(j.get("prompt_eval_count",0)>=z.nctx),
      truncated=bool(trunc),soft_end=bool(soft_end),halluc=round(au["halluc"],3),recovery=au["recovery_topk"],echo=er,
      out_ids=au["out_ids"],bad=au["bad_paths"])))
    if z.show: print("----- DIGEST -----"); print(out)
