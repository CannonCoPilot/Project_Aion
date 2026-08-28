# Pre-/clear Scrollback Capture
# Captured: 2026-08-27T17:39:37Z | key: jaques | session: ef5b8621-b1d9-4123-b199-04f48b57e18e

          dec=sum(1 for x in rows if float(x['DecoyP'])==1.0)
          print(f"  {r:4} {len(rows):5} {dec:5}  {dict(notes)}")
      print("\n--- score column relationships (pAla) ---")
      rows=tabs['Ala']
      same_ps_pbs=sum(1 for x in rows if x['PTM_score']==x['PTM_best_score'])
      print(f"  PTM_score == PTM_best_score in {same_ps_pbs}/{len(rows)} rows")
      print("\n--- USI structure ---")
      u=rows[0]['All_USI']; print("  ",u[:150])
      reps=collections.Counter()
      for x in rows:
          for m in re.findall(r'rep(\d+)', x['All_USI']): reps[m]+=1
      print("  rep tokens across pAla:",dict(reps))
      multi=sum(1 for x in rows if ';' in x['All_USI'] or ',' in x['All_USI'])
      print(f"  rows whose All_USI holds >1 spectrum ref: {multi}")
      print("\n--- Pool vs USI-encoded pool (pAla) ---")
      mism=0; ok=0
      for x in rows:
          m=re.search(r'pool(\d+)', x['All_USI'])
          if m:
              if m.group(1)==x['Pool'].strip(): ok+=1
              else: mism+=1
      print(f"  agree {ok}  disagree {mism}")
      print("\n--- Notes 'Incorrect pool.' rows: does Pool disagree with USI? ---")
      ip=[x for x in rows if 'Incorrect pool' in x['Notes']]
      print(f"  n={len(ip)}")
      d=0
      for x in ip:
          m=re.search(r'pool(\d+)', x['All_USI'])
          if m and m.group(1)!=x['Pool'].strip(): d+=1
      print(f"  of those, Pool != USI pool: {d}")
      EOF)
  ⎿  residue rows decoy notes_uniq
       Ala    969    19  {'': 910, 'Incorrect pool.': 37, 'pAla.': 16, 'pAla. pAla.': 6}
       Asp    982    26  {'': 940, 'Incorrect pool.': 42}
       Glu   1005    16  {'': 967, 'Incorrect pool.': 38}
       Gly    962    48  {'': 927, 'Incorrect pool.': 35}
       Leu    975    27  {'': 938, 'Incorrect pool.': 37}
       Pro    997    89  {'': 965, 'Incorrect pool.': 32}

     --- score column relationships (pAla) ---
       PTM_score == PTM_best_score in 969/969 rows

     --- USI structure ---
        mzspec:PXD007058:SF_200217_pPeptideLibrary_pool1_HCDOT_rep2:scan:04800:[Acetyl]-GQEY[Phosphorylation]LILEK/2
       rep tokens across pAla: {'2': 500, '1': 469}
       rows whose All_USI holds >1 spectrum ref: 0

     --- Pool vs USI-encoded pool (pAla) ---
       agree 969  disagree 0

     --- Notes 'Incorrect pool.' rows: does Pool disagree with USI? ---
       n=37
       of those, Pool != USI pool: 0
  ⎿  Async hook PostToolUse completed

∴ I'm confirming several empirical patterns in the data: PSM_count is always blank, PTM_score matches PTM_best_score in every row, each row corresponds to exactly one spectrum via All_USI,
  and the Pool field consistently matches the USI-encoded pool across all entries.

  This raises an important gap—the "incorrect pool" annotation in the notes doesn't actually correspond to any Pool-vs-USI mismatch in the table, since those flagged rows show perfect
  agreement. I'm also tracking the rep1/rep2 replicate split and the note text patterns unique to the Ala table, then working through a taxonomy of underdetermination types to find genuine
  examples—starting with fields that are never recorded, like PSM_count, and checking whether that gap is already captured by an existing claim about reproducibility.

  Now I'm checking for duplicate rows to see if per-identification spectrum support can be inferred that way. I've landed on a solid case for aggregate-only evidence: the +1 offset shows up
  across many cells collectively, but no single row can be pinpointed as the "extra" one—so any claim that individual rows identify the extra site would be unsupported. I'm also cataloging
  other underdetermination types already covered (wrong granularity, necessary-not-sufficient, population mismatch) and starting to think through confounded comparisons and provenance gaps
  as additional categories to search for.

⏺ Good material. Digging into what is genuinely underdetermined versus merely unstated:

⏺ Bash(cd /Users/nathanielcannon/Claude/Projects/SnorkelTasks/projects/ec-starfish/tasks/biology/bioinformatics/phosphosite-flr-reconstruction-001/environment/data; python3 - <<'EOF'
      import csv, collections, glob, os, re
      tabs={}
      for f in sorted(glob.glob('flr_tables/*.csv')):
          tabs[os.path.basename(f).split('_p')[-1][:-4]]=list(csv.DictReader(open(f)))
      A=tabs['Ala']
      print("--- PTM_score vs PTM_best_score, ALL tables ---")
      for r,rows in tabs.items():
          n=sum(1 for x in rows if x['PTM_score']==x['PTM_best_score'])
          print(f"  {r}: identical in {n}/{len(rows)}")
      print("\n--- duplicate (Peptide_mod, PTM_positions) within a table? ---")
      for r,rows in tabs.items():
          c=collections.Counter((x['Peptide_mod'],x['PTM_positions']) for x in rows)
          dup=sum(1 for k,v in c.items() if v>1)
          print(f"  {r}: {len(c)} distinct, {dup} appearing >1x, max multiplicity {max(c.values())}")
      print("\n--- is PTM_final_prob derivable from Score/PTM_score? (pAla, first 5) ---")
      for x in A[:5]:
          print(f"  Score={x['Score']:8} PTM_score={x['PTM_score']:7} final={x['PTM_final_prob'][:10]}")
      print("\n--- replicate tokens across ALL tables ---")
      for r,rows in tabs.items():
          reps=collections.Counter(re.search(r'rep(\d+)',x['All_USI']).group(1) for x in rows if re.search(r'rep(\d+)',x['All_USI']))
          pools=collections.Counter(x['Pool'].strip() for x in rows)
          print(f"  {r}: reps={dict(sorted(reps.items()))} pools={dict(sorted(pools.items()))}")
      print("\n--- decoy rows: which residue does PTM_positions point at? (pAla) ---")
      cnt=collections.Counter()
      for x in A:
          p=int(x['PTM_positions']); pep=x['Peptide']
          aa=pep[p-1] if 1<=p<=len(pep) else '?'
          cnt[(x['DecoyP'],aa)]+=1
      print("  ",dict(cnt))
      EOF)
  ⎿  --- PTM_score vs PTM_best_score, ALL tables ---
       Ala: identical in 969/969
       Asp: identical in 982/982
       Glu: identical in 1005/1005
       Gly: identical in 962/962
       Leu: identical in 975/975
       Pro: identical in 997/997

     --- duplicate (Peptide_mod, PTM_positions) within a table? ---
       Ala: 264 distinct, 177 appearing >1x, max multiplicity 16
       Asp: 270 distinct, 176 appearing >1x, max multiplicity 17
       Glu: 270 distinct, 184 appearing >1x, max multiplicity 18
       Gly: 269 distinct, 180 appearing >1x, max multiplicity 15
       Leu: 257 distinct, 175 appearing >1x, max multiplicity 17
       Pro: 269 distinct, 185 appearing >1x, max multiplicity 16

     --- is PTM_final_prob derivable from Score/PTM_score? (pAla, first 5) ---
       Score=1.0      PTM_score=1.0     final=1.0
       Score=1.0      PTM_score=1.0     final=1.0
       Score=1.0      PTM_score=0.998   final=0.998
       Score=1.0      PTM_score=0.998   final=0.998
       Score=1.0      PTM_score=0.998   final=0.998

     --- replicate tokens across ALL tables ---
       Ala: reps={'1': 469, '2': 500} pools={'1': 170, '2': 216, '3': 185, '4': 193, '5': 205}
       Asp: reps={'1': 478, '2': 504} pools={'1': 161, '2': 212, '3': 193, '4': 197, '5': 219}
       Glu: reps={'1': 485, '2': 520} pools={'1': 172, '2': 208, '3': 194, '4': 207, '5': 224}
       Gly: reps={'1': 462, '2': 500} pools={'1': 176, '2': 209, '3': 179, '4': 186, '5': 212}
       Leu: reps={'1': 466, '2': 509} pools={'1': 179, '2': 214, '3': 182, '4': 192, '5': 208}
       Pro: reps={'1': 498, '2': 499} pools={'1': 173, '2': 219, '3': 184, '4': 199, '5': 222}

     --- decoy rows: which residue does PTM_positions point at? (pAla) ---
        {('0.0', 'Y'): 270, ('0.0', 'S'): 537, ('0.0', 'T'): 143, ('1.0', 'A'): 19}
  ⎿  Async hook PostToolUse completed

∴ I'm confirming that PTM_score and PTM_best_score are identical across all 5890 rows, meaning the "best" column adds nothing new. I also notice rows repeat for the same peptide/position
  pair, showing each row corresponds to a separate PSM supporting a given site, and that decoy rows with probability 1.0 consistently point to alanine.

  Now I'm drafting a set of candidate claims about the dataset to test against the data — starting with ones I can already mark as contradicted, like the idea that PTM_best_score is an
  independently computed value, or that the pool note flags decoy sites, or that protein positions are assigned independently, or that the deposited data lets you reproduce the collapse
  step. I'm about to evaluate whether each row genuinely represents a distinct site.

  Now I'm checking whether DecoyP simply flags low-confidence identifications versus specifically marking the decoy residue, and separately confirming that decoy assignments always land on
  the decoy residue itself. I'm also working through whether row multiplicity per site can stand in for a spectra-per-site count, since each row corresponds to one spectrum (one USI).

  I'm identifying a solid aggregate-only case: the extra site offset appearing across published cells is visible only in aggregate across 35 cells, with no individual row identifiable as
  "the extra one" — this fits cleanly as NOT_EVIDENCED. I'm also revisiting an existing wrong-granularity pool item about peptide-level notes versus site-level claims, and still need to
  find a necessary-but-not-sufficient case to round out the categories.

  For the confounded/no-background category, I'm noting that a claim about proline having the highest error rate because it's hardest to localize can't be separated from search-space or
  composition effects using just the decoy counts in the table.

  For provenance, I'm flagging that rep1/rep2 labels don't specify technical vs biological replicates, and for directionality, the "incorrect pool" note doesn't clarify whether the peptide
  or annotation is at fault. Before finalizing these, I want to empirically verify the score column thresholds, decoy probability distributions across the range, and whether the Pro vs Glu
  decoy counts (89 vs 16) actually allow search space to be computed.

  I need to stress-test each candidate against my own defect rule—could a knowledgeable expert reasonably argue for the opposite conclusion? Time to run the verification.

⏺ Now testing candidate claims against the data — each must be settleable one way only:

  Bash(cd /Users/nathanielcannon/Claude/Projects/SnorkelTasks/projects/ec-starfish/tasks/biology/bioinformatics/phosphosite-flr-reconstruction-001/environment/data; python3 - <<'EOF'
      import csv, collections, glob, os, re
      tabs={}
      for f in sorted(glob.glob('flr_tables/*.csv')):
          tabs[os.path.basename(f).split('_p')[-1][:-4]]=list(csv.DictReader(open(f)))
      AA={'Ala':'A','Asp':'D','Glu':'E','Gly':'G','Leu':'L','Pro':'P'}

      print("C1  PTM_best_score identical to PTM_score everywhere?")
      tot=same=0
      for r,rows in tabs.items():
          tot+=len(rows); same+=sum(1 for x in rows if x['PTM_score']==x['PTM_best_score'])
      print(f"    {same}/{tot} rows identical  -> {'CONTRADICTED ok' if same==tot else 'NOT CLEAN'}")

      print("\nS2  DecoyP==1 iff assigned position is the decoy residue?")
      bad=0; dec=0
      for r,rows in tabs.items():
          for x in rows:
              p=int(x['PTM_positions']); pep=x['Peptide']
              aa=pep[p-1] if 1<=p<=len(pep) else '?'
              isdec=float(x['DecoyP'])==1.0
              if isdec: dec+=1
              if isdec != (aa==AA[r]): bad+=1
      print(f"    decoy rows={dec}, violations={bad} -> {'SUPPORTED ok' if bad==0 else 'NOT CLEAN'}")

      print("\nC5  does a (Peptide_mod, position) pair repeat across rows?")
      mx=max(max(collections.Counter((x['Peptide_mod'],x['PTM_positions']) for x in rows).values()) for rows in tabs.values())
      print(f"    max multiplicity {mx} -> row != distinct site; CONTRADICTED ok")

      print("\nU1  is any score threshold recorded? Score/PTM_score ranges:")
      for r,rows in tabs.items():
          s=[float(x['Score']) for x in rows]; p=[float(x['PTM_score']) for x in rows]
          print(f"    {r}: Score min={min(s):.4f} max={max(s):.4f} | PTM_score min={min(p):.4f} max={max(p):.4f}")

      print("\nU6  decoy counts vs residue occurrence (is a background computable?)")
      for r,rows in tabs.items():
          dec=sum(1 for x in rows if float(x['DecoyP'])==1.0)
          occ=sum(x['Peptide'].count(AA[r]) for x in rows)
          sty=sum(sum(x['Peptide'].count(c) for c in 'STY') for x in rows)
          print(f"    {r}: decoy={dec:3} residue_occurrences={occ:6} STY_occurrences={sty:6} ratio={occ/sty:.4f}")

      print("\nU7  does anything state what rep1/rep2 are, or what a Pool is?")
      allusi=" ".join(x['All_USI'] for x in tabs['Ala'][:50])
      print("    USI tokens:", sorted(set(re.findall(r'[A-Za-z]+(?=\d)', allusi)))[:12])
      print("    columns available:", list(tabs['Ala'][0].keys()))
      EOF)
  ⎿  C1  PTM_best_score identical to PTM_score everywhere?
         5890/5890 rows identical  -> CONTRADICTED ok

     S2  DecoyP==1 iff assigned position is the decoy residue?
         decoy rows=225, violations=0 -> SUPPORTED ok

     C5  does a (Peptide_mod, position) pair repeat across rows?
         max multiplicity 18 -> row != distinct site; CONTRADICTED ok

     U1  is any score threshold recorded? Score/PTM_score ranges:
         Ala: Score min=0.7066 max=1.0000 | PTM_score min=0.1660 max=1.0000
         Asp: Score min=0.7948 max=1.0000 | PTM_score min=0.1970 max=1.0000
         Glu: Score min=0.7930 max=1.0000 | PTM_score min=0.1960 max=1.0000
         Gly: Score min=0.7529 max=1.0000 | PTM_score min=0.1980 max=1.0000
         Leu: Score min=0.7093 max=1.0000 | PTM_score min=0.1660 max=1.0000
         Pro: Score min=0.8032 max=1.0000 | PTM_score min=0.1620 max=1.0000

     U6  decoy counts vs residue occurrence (is a background computable?)
         Ala: decoy= 19 residue_occurrences=   839 STY_occurrences=  3255 ratio=0.2578
         Asp: decoy= 26 residue_occurrences=   699 STY_occurrences=  3318 ratio=0.2107
         Glu: decoy= 16 residue_occurrences=  1089 STY_occurrences=  3366 ratio=0.3235
         Gly: decoy= 48 residue_occurrences=   896 STY_occurrences=  3263 ratio=0.2746
         Leu: decoy= 27 residue_occurrences=  1015 STY_occurrences=  3254 ratio=0.3119
         Pro: decoy= 89 residue_occurrences=  1546 STY_occurrences=  3302 ratio=0.4682

     U7  does anything state what rep1/rep2 are, or what a Pool is?
         USI tokens: ['PXD', 'pool', 'rep']
         columns available: ['Peptide_mod', 'Peptide', 'Protein', 'Pool', 'All_USI', 'Score', 'PTM', 'PTM_score', 'PTM_best_score', 'PTM_positions', 'PTM_Protein_Positions',
     'PSM_count', 'Notes', 'PTM_final_prob', 'DecoyP', 'Use_for_SP_analysis']
  ⎿  Async hook PostToolUse completed

∴ Checking C1's claim about PTM_best_score, I find 5890/5890 values identical — a clean contradiction. But I pause to consider whether an expert could still defend this as "not evidenced"
  rather than contradicted, since identical values in this dataset don't strictly prove the columns are semantically the same thing.

  The stronger test is whether PTM_best_score stays constant and equals the max PTM_score within each (Peptide_mod, position) group, since sites repeat up to 18 times with different scores
  — if it doesn't hold, that's decisive contradiction rather than mere coincidence.

  For U6, I'm weighing whether Proline's high decoy count and error rate can be separated from its high occurrence in the search space, since the occurrence ratio (0.4682) is computable and
  could normalize the claim into something more precisely testable.

  An observed minimum score doesn't prove a threshold was applied at that point — it's consistent with a threshold anywhere at or below it, so this stays NOT_EVIDENCED cleanly. Same logic
  applies to whether rep1/rep2 are technical replicates: nothing in the columns or USI states this, though it's arguably too easy. The real hard cases should involve computations that look
  like they settle a question but only establish necessary, not sufficient, conditions — which points me toward the aggregate-only family.

  For U2, the +1 offset per cell is real and visible across all 35 cells, but it's a counting-convention artifact spread across the ranking with no single row being "the extra one," so
  identifying which specific site is genuinely impossible from these tables — that's clean and hard. For U8, I verified Pool always agrees with the USI-encoded pool across all 969 rows
  including the 37 noted ones, meaning the "Incorrect pool" note can't be recording a Pool/USI mismatch — though it could still refer to some external fact about synthesis.

  That agreement is necessary but not sufficient to refute the claim, since the design pool itself isn't deposited in the tables — a genuine and novel trap. Now I want to verify the
  PTM_best_score-within-group test, the pool-note design question, and the aggregate-only +1 claim before assembling the final set, so let me run through these checks.

⏺ Two candidates need sharper tests before I trust them. Checking whether PTM_best_score is decisively refuted, and whether the pool note has a hidden trap:

  Bash(cd /Users/nathanielcannon/Claude/Projects/SnorkelTasks/projects/ec-starfish/tasks/biology/bioinformatics/phosphosite-flr-reconstruction-001/environment/data; python3 - <<'EOF'
      import csv, collections, glob, os, re
      tabs={}
      for f in sorted(glob.glob('flr_tables/*.csv')):
          tabs[os.path.basename(f).split('_p')[-1][:-4]]=list(csv.DictReader(open(f)))

      print("C1 sharper: if PTM_best_score were 'best across the spectra supporting this site',")
      print("   it would be CONSTANT within a (Peptide_mod,pos) group and equal to that group's max.")
      viol=grp=0
      for r,rows in tabs.items():
          g=collections.defaultdict(list)
          for x in rows: g[(x['Peptide_mod'],x['PTM_positions'])].append(x)
          for k,v in g.items():
              if len(v)<2: continue
              grp+=1
              bs={x['PTM_best_score'] for x in v}
              if len(bs)>1: viol+=1
      print(f"   multi-row groups={grp}, groups where PTM_best_score VARIES within the group={viol}")
      print(f"   -> {viol/grp:.0%} of groups violate the 'best-across-spectra' reading; decisively CONTRADICTED")

      print("\nU8 pool note: is the DESIGN pool (which pool a peptide was synthesised for) deposited?")
      A=tabs['Ala']
      ip=[x for x in A if 'Incorrect pool' in x['Notes']]
      print(f"   'Incorrect pool.' rows in pAla: {len(ip)}")
      same=sum(1 for x in ip if re.search(r'pool(\d+)',x['All_USI']).group(1)==x['Pool'].strip())
      print(f"   of those, recorded Pool == USI-encoded pool: {same}/{len(ip)}  (the salient computation)")
      pep2pools=collections.defaultdict(set)
      for x in A: pep2pools[x['Peptide']].add(x['Pool'].strip())
      multi=[p for p,s in pep2pools.items() if len(s)>1]
      print(f"   peptides appearing in >1 pool: {len(multi)} of {len(pep2pools)}")
      ipeps={x['Peptide'] for x in ip}
      print(f"   of the {len(ipeps)} noted peptides, how many appear in >1 pool: {len(ipeps & set(multi))}")

      print("\nU2 aggregate-only: is any individual row identifiable as the '+1' extra site?")
      print("   (the offset is a property of the count, spread across the ranking)")
      print("   columns that could mark it:", [c for c in A[0] if 'flag' in c.lower() or 'extra' in c.lower()] or "NONE")
      EOF)
  ⎿  C1 sharper: if PTM_best_score were 'best across the spectra supporting this site',
        it would be CONSTANT within a (Peptide_mod,pos) group and equal to that group's max.
        multi-row groups=1077, groups where PTM_best_score VARIES within the group=1077
        -> 100% of groups violate the 'best-across-spectra' reading; decisively CONTRADICTED

     U8 pool note: is the DESIGN pool (which pool a peptide was synthesised for) deposited?
        'Incorrect pool.' rows in pAla: 37
        of those, recorded Pool == USI-encoded pool: 37/37  (the salient computation)
        peptides appearing in >1 pool: 30 of 114
        of the 13 noted peptides, how many appear in >1 pool: 12

     U2 aggregate-only: is any individual row identifiable as the '+1' extra site?
        (the offset is a property of the count, spread across the ranking)
        columns that could mark it: NONE
  ⎿  Async hook PostToolUse completed

∴ All three checks confirm decisively: C1 fails since every one of the 1077 multi-row groups has a varying PTM_best_score, and U8 also fails since although all 37 noted rows match Pool with
  USI pool, 12 of the 13 noted peptides actually appear in multiple pools — meaning the deposit doesn't actually record which pool the peptide was designed for, so the note relies on an
  external fact not evidenced in the data itself.

  Checking the numbers: 12 of 13 noted peptides appear in multiple pools, but 30 of 114 total peptides are multi-pool — so multi-pool presence alone can't explain the flag, and one noted
  peptide isn't even multi-pool. That rules out treating the flag as directly reproducible from the columns, so the cleaner claim is that the "Incorrect pool" note reflects a mismatch
  against an external design record never deposited here — something the tables are consistent with but can't confirm, landing this as NOT_EVIDENCED with the 37/37 pool-match figure as a
  necessary-but-not-sufficient trap.

  Now drafting the full claim set: roughly a dozen claims split across contradicted, supported, and not_evidenced categories, weighting toward not_evidenced with each one built around a
  distinct failure type. For contradicted claims I'm sketching four: one about best-score being a per-site maximum (refuted by internal score variation across 1077 groups), one about each
  row representing a distinct site (refuted by multiplicity up to 18), and one about the pool note being reproducible from the deposited columns (refuted since multi-pool status is neither
  necessary nor sufficient for the note).

  For the fourth contradicted claim, I'm noting that PSM_count being all dashes refutes claims of it being reproducible from this deposit. For supported claims, I have two: the decoy flag
  marking the decoy residue exactly (validated across all 225 rows with zero violations), and the glycine false-hits-are-displaced-real-sites claim I'd already confirmed. Now I'm starting
  on the not_evidenced claims, aiming for six distinct trap types — the first being a necessary-but-not-sufficient claim about the pool note marking a synthesis mismatch, where the trap is
  that Pool equals the USI pool.

  For the remaining not-evidenced claims: claim 8 is aggregate-only, since the single extra site per published cell is real and verifiable in aggregate across 35 cells but no individual row
  carries it directly. Claim 9 involves a floor-is-not-a-threshold trap, where the tables' clear per-table minima (0.7066–0.8032) look like an applied cutoff, but an observed minimum is
  consistent with any threshold at or below it, and the minima differ across tables. I'm now moving into claim 10, which concerns provenance of the rep1/rep2 replicates as technical
  replicates.

  Actually, calibration might be estimable from decoy rates per probability bin, which is risky since it's settleable. Let me try a different angle instead: whether the deposit lets you
  separate a wrong peptide identification from a correct peptide with a misplaced phosphate. The trap here is that DecoyP flags a decoy residue but doesn't tell you if the underlying
  peptide call itself was wrong — a genuine granularity confound.

  Confirming this is truly not evidenced: nothing in the table validates the peptide ID against the decoy flag, so this claim stays clean. That brings the count to 12 claims total — 4
  contradicted, 2 supported, 6 not evidenced, a 50% NE rate where a blanket answer of either type would fail. I need to be careful to frame this as a research artifact for EXP-02, not an
  alteration of the actual shipped task.

  The shipped bundle stays untouched — this is purely to test whether harder claims can discriminate before ever considering them for a real task. I'm now planning a claims spec file
  listing each claim with its verdict, type, verification method, and trap, along with a verifier script that re-derives every classification from the shipped tables and aborts if the
  evidence shifts. I want to write that verification script first since it's what makes the whole exercise concrete, and I need to double check that the aggregate claim about the +1 result
  actually matches what's in the published results file.

  I confirm the expected truth data shows all 35 cells offset by exactly one under the key's convention, so the extra site isn't tied to any specific row — that claim seems solid. But then
  I catch myself: a clever agent could argue the "extra site" is identifiable as whichever site falls at rank N+1 in the published ordering, which is actually a defensible interpretation
  and would undercut the claim I was treating as safely non-identifiable.

  Given this ambiguity, I'm leaning toward reframing or dropping this claim rather than asserting it confidently, since whether the +1 stems from a boundary convention or a genuinely
  distinct site set isn't something the deposited data settles — and I don't want to overstate what's determinable here.

  That leaves five NE claims, so I'm looking for one more solid candidate of a different flavor: absence-of-evidence from a filtered dataset. Since the tables only list observed peptides, I
  can't distinguish peptides that were synthesized-but-undetected from peptides that were never made — no record states the library size — making this a clean, canonical NOT_EVIDENCED
  case.

  Now I want to write this up properly: a machine-readable claims spec, a verifier script that re-derives every verdict from the tables and aborts on drift, the statements shown to the
  agent, and notes explaining the design plus rejected candidates. I'll start with the verifier since that's what grounds the claims rather than just asserting them.

⏺ All three verified decisively. One candidate died under scrutiny, which is worth recording. Building the set:

⏺ Bash(mkdir -p /Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes/exp02_claims && echo ok)
  ⎿  ok
  ⎿  Async hook PostToolUse completed

⏺ Write(/Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes/exp02_claims/verify_claims.py)
  ⎿  Wrote 211 lines to /Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes/exp02_claims/verify_claims.py
        1 #!/usr/bin/env python3
        2 """EXP-02 -- re-derive every claim verdict from the shipped tables, and ABORT if the evidence moves.
        3
        4 A claim set that is merely asserted is an answer key waiting to be wrong. Every verdict below is
        5 recomputed from environment/data at build time. If a recomputation stops matching the recorded
        6 verdict, this exits non-zero and the claim set must not be used.
        7
        8 This is a RESEARCH artefact for EXP-02. It is NOT part of the shipped bundle.
        9 """
       10 import csv, collections, glob, json, os, re, sys, pathlib
       11
       12 REPO = pathlib.Path(__file__).resolve().parents[3]
       13 DATA = REPO / "projects/ec-starfish/tasks/biology/bioinformatics/phosphosite-flr-reconstruction-001/environment/data"
       14 AA = {"Ala": "A", "Asp": "D", "Glu": "E", "Gly": "G", "Leu": "L", "Pro": "P"}
       15
       16
       17 def load():
       18     t = {}
       19     for f in sorted(glob.glob(str(DATA / "flr_tables/*.csv"))):
       20         t[os.path.basename(f).split("_p")[-1][:-4]] = list(csv.DictReader(open(f)))
       21     if not t:
       22         sys.exit(f"no tables under {DATA}")
       23     return t
       24
       25
       26 def groups(rows):
       27     g = collections.defaultdict(list)
       28     for x in rows:
       29         g[(x["Peptide_mod"], x["PTM_positions"])].append(x)
       30     return g
       31
       32
       33 # ---------------------------------------------------------------- evidence checks
       34 def ev_best_score_varies_within_site(T):
       35     """PTM_best_score cannot be a per-site maximum: it varies WITHIN every multi-row site group."""
       36     multi = viol = 0
       37     for rows in T.values():
       38         for k, v in groups(rows).items():
       39             if len(v) < 2:
       40                 continue
       41             multi += 1
       42             if len({x["PTM_best_score"] for x in v}) > 1:
       43                 viol += 1
       44     return {"multi_row_site_groups": multi, "groups_where_best_score_varies": viol,
       45             "holds": multi > 0 and viol == multi}
       46
       47
       48 def ev_row_is_not_a_site(T):
       49     mx = max(max(collections.Counter((x["Peptide_mod"], x["PTM_positions"]) for x in rows).values())
       50              for rows in T.values())
       51     return {"max_rows_per_site": mx, "holds": mx > 1}
       52
       53
       54 def ev_psm_count_absent(T):
       55     tot = sum(len(r) for r in T.values())
       56     filled = sum(1 for rows in T.values() for x in rows if x["PSM_count"].strip() not in ("", "-"))
       57     return {"rows": tot, "rows_with_psm_count": filled, "holds": filled == 0}
       58
       59
       60 def ev_decoy_flag_is_the_decoy_residue(T):
       61     dec = viol = 0
       62     for r, rows in T.items():
       63         for x in rows:
       64             p = int(x["PTM_positions"]); pep = x["Peptide"]
       65             aa = pep[p - 1] if 1 <= p <= len(pep) else "?"
       66             isdec = float(x["DecoyP"]) == 1.0
       67             dec += isdec
       68             if isdec != (aa == AA[r]):
       69                 viol += 1
       70     return {"decoy_rows": dec, "violations": viol, "holds": dec > 0 and viol == 0}
       71
       72
       73 def ev_pool_note_not_reproducible(T):
       74     """The note is neither implied by nor implies multi-pool occurrence, so it cannot be
       75     regenerated from the deposited columns."""
       76     out = {}
       77     for r, rows in T.items():
       78         p2p = collections.defaultdict(set)
       79         for x in rows:
       80             p2p[x["Peptide"]].add(x["Pool"].strip())
       81         multi = {p for p, s in p2p.items() if len(s) > 1}
       82         noted = {x["Peptide"] for x in rows if "Incorrect pool" in x["Notes"]}
       83         out[r] = {"noted_peptides": len(noted), "multi_pool_peptides": len(multi),
       84                   "noted_and_multi": len(noted & multi), "multi_but_not_noted": len(multi - noted),
       85                   "noted_but_not_multi": len(noted - multi)}
       86     # not sufficient (many multi-pool peptides are unnoted) AND not necessary somewhere
       87     not_sufficient = all(v["multi_but_not_noted"] > 0 for v in out.values())
       88     return {"per_table": out, "holds": not_sufficient}
       89
       90
       91 def ev_design_pool_absent(T):
       92     """The salient computation -- recorded Pool vs USI-encoded pool -- compares two records of the
       93     SAME observation. The pool a peptide was SYNTHESISED for is nowhere in the deposit."""
       94     agree = total = 0
       95     for rows in T.values():
       96         for x in rows:
       97             if "Incorrect pool" not in x["Notes"]:
       98                 continue
       99             m = re.search(r"pool(\d+)", x["All_USI"])
      100             if not m:
      101                 continue
      102             total += 1
      103             agree += (m.group(1) == x["Pool"].strip())
      104     cols = set(next(iter(T.values()))[0].keys())
      105     design_cols = {c for c in cols if "design" in c.lower() or "expected" in c.lower()
      106                    or "synth" in c.lower()}
      107     return {"noted_rows_checked": total, "pool_equals_usi_pool": agree,
      108             "columns_naming_a_design_pool": sorted(design_cols),
      109             "holds": total > 0 and agree == total and not design_cols}
      110
      111
      112 def ev_no_threshold_recorded(T):
      113     """Each table has a score FLOOR, and the floors differ. A floor is consistent with any
      114     threshold at or below it; no column or file records the cutoff applied."""
      115     floors = {r: {"score_min": min(float(x["Score"]) for x in rows),
      116                   "ptm_score_min": min(float(x["PTM_score"]) for x in rows)}
      117               for r, rows in T.items()}
      118     distinct = len({round(v["score_min"], 4) for v in floors.values()})
      119     cols = set(next(iter(T.values()))[0].keys())
      120     thr_cols = {c for c in cols if "thresh" in c.lower() or "cutoff" in c.lower()}
      121     return {"floors": floors, "distinct_score_floors": distinct,
      122             "columns_naming_a_threshold": sorted(thr_cols),
      123             "holds": distinct > 1 and not thr_cols}
      124
      125
      126 def ev_replicate_type_absent(T):
      127     """rep1/rep2 appear in the USI. Nothing records whether they are technical or biological."""
      128     reps = collections.Counter()
      129     for rows in T.values():
      130         for x in rows:
      131             m = re.search(r"rep(\d+)", x["All_USI"])
      132             if m:
      133                 reps[m.group(1)] += 1
      134     cols = set(next(iter(T.values()))[0].keys())
      135     rep_cols = {c for c in cols if "replicate" in c.lower() or c.lower() == "rep"}
      136     return {"replicate_tokens": dict(sorted(reps.items())), "columns_describing_replicates":
      137             sorted(rep_cols), "holds": len(reps) > 1 and not rep_cols}
      138
      139
      140 def ev_library_contents_absent(T):
      141     """Only OBSERVED peptides appear. Nothing records what was synthesised, so a peptide's absence
      142     cannot be distinguished from its never having been detected."""
      143     peps = {x["Peptide"] for rows in T.values() for x in rows}
      144     pools = {x["Pool"].strip() for rows in T.values() for x in rows}
      145     cols = set(next(iter(T.values()))[0].keys())
      146     lib_cols = {c for c in cols if "librar" in c.lower() or "designed" in c.lower()}
      147     return {"distinct_observed_peptides": len(peps), "distinct_pools": len(pools),
      148             "columns_recording_library_contents": sorted(lib_cols), "holds": not lib_cols}
      149
      150
      151 def ev_id_vs_localisation_not_separable(T):
      152     """DecoyP says the assigned POSITION is on the decoy residue. Nothing validates the peptide
      153     IDENTIFICATION itself, so the two error kinds cannot be told apart."""
      154     cols = set(next(iter(T.values()))[0].keys())
      155     id_cols = {c for c in cols if "correct" in c.lower() or "truth" in c.lower()
      156                or "validated" in c.lower()}
      157     return {"columns_validating_the_peptide_id": sorted(id_cols), "holds": not id_cols}
      158
      159
      160 CLAIMS = [
      161     # ---- CONTRADICTED: the tables settle these FALSE
      162     ("best_score_is_a_per_site_maximum", "contradicted", "settled",
      163      ev_best_score_varies_within_site),
      164     ("each_row_is_one_site", "contradicted", "settled", ev_row_is_not_a_site),
      165     ("spectrum_counts_are_deposited", "contradicted", "settled", ev_psm_count_absent),
      166     ("pool_note_is_reproducible_from_the_columns", "contradicted", "settled",
      167      ev_pool_note_not_reproducible),
      168     # ---- SUPPORTED: the tables settle these TRUE
      169     ("decoy_flag_marks_the_decoy_residue", "supported", "settled",
      170      ev_decoy_flag_is_the_decoy_residue),
      171     # ---- NOT_EVIDENCED: each a DIFFERENT kind of underdetermination
      172     ("pool_note_marks_a_synthesis_mismatch", "not_evidenced", "necessary_not_sufficient",
      173      ev_design_pool_absent),
      174     ("a_score_threshold_is_recorded", "not_evidenced", "floor_is_not_a_threshold",
      175      ev_no_threshold_recorded),
      176     ("replicates_are_technical", "not_evidenced", "provenance_unrecorded",
      177      ev_replicate_type_absent),
      178     ("every_synthesised_peptide_appears_here", "not_evidenced", "absence_vs_non_detection",
      179      ev_library_contents_absent),
      180     ("identification_and_localisation_errors_are_separable", "not_evidenced",
      181      "confounded_error_kinds", ev_id_vs_localisation_not_separable),
      182 ]
      183
      184
      185 def main():
      186     T = load()
      187     print(f"tables: {', '.join(f'{k}({len(v)})' for k, v in T.items())}\n")
      188     out, bad = {}, []
      189     for name, verdict, kind, fn in CLAIMS:
      190         ev = fn(T)
      191         ok = ev.pop("holds")
      192         out[name] = {"verdict": verdict, "kind": kind, "evidence": ev}
      193         print(f"{'OK ' if ok else 'FAIL'} {verdict:14} {kind:26} {name}")
      194         if not ok:
      195             bad.append(name)
      196     counts = collections.Counter(c[1] for c in CLAIMS)
      197     print(f"\nverdict mix: {dict(counts)}  (n={len(CLAIMS)})")
      198     ne = counts["not_evidenced"] / len(CLAIMS)
      199     print(f"not_evidenced share = {ne:.2f}; blanket-NE scores {counts['not_evidenced']}/{len(CLAIMS)}, "
      200           f"blanket-contradicted scores {counts['contradicted']}/{len(CLAIMS)} -- both fail")
      206               open(pathlib.Path(__file__).parent / "claims_spec.json", "w"), indent=1)
      207     print("\nwrote claims_spec.json")
      208
      209
      210 if __name__ == "__main__":
      211     main()
  ⎿  Async hook PostToolUse completed

⏺ Bash(cd /Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes/exp02_claims && python3 verify_claims.py)
  ⎿  tables: Ala(969), Asp(982), Glu(1005), Gly(962), Leu(975), Pro(997)

     OK  contradicted   settled                    best_score_is_a_per_site_maximum
     OK  contradicted   settled                    each_row_is_one_site
     OK  contradicted   settled                    spectrum_counts_are_deposited
     OK  contradicted   settled                    pool_note_is_reproducible_from_the_columns
     OK  supported      settled                    decoy_flag_marks_the_decoy_residue
     OK  not_evidenced  necessary_not_sufficient   pool_note_marks_a_synthesis_mismatch
     OK  not_evidenced  floor_is_not_a_threshold   a_score_threshold_is_recorded
     OK  not_evidenced  provenance_unrecorded      replicates_are_technical
     OK  not_evidenced  absence_vs_non_detection   every_synthesised_peptide_appears_here
     OK  not_evidenced  confounded_error_kinds     identification_and_localisation_errors_are_separable

     verdict mix: {'contradicted': 4, 'supported': 1, 'not_evidenced': 5}  (n=10)
     not_evidenced share = 0.50; blanket-NE scores 5/10, blanket-contradicted scores 4/10 -- both fail

     wrote claims_spec.json
  ⎿  verify_claims.py (/Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes/exp02_claims/verify_claims.py):
  ⎿    ★ [Line 38:13] "k" is not accessed (Pyright)
  ⎿  Async hook PostToolUse completed

∴ All 10 checks passed, but a verifier that never fails proves nothing, so I want to negative-test it by perturbing a temp copy of the data — like flattening PTM_best_score within groups —
  and confirming the best_score claim correctly fails. Then I'll write up the statements.md text and the design note.

⏺ All ten hold. Now negative-testing the verifier — a checker that never fails proves nothing:

  Bash(cd /Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes/exp02_claims; python3 - <<'EOF'
      import importlib.util, collections, copy
      spec=importlib.util.spec_from_file_location("vc","verify_claims.py"); vc=importlib.util.module_from_spec(spec); spec.loader.exec_module(vc)
      T=vc.load()

      def perturb(T, fn):
          T2={k:[dict(r) for r in v] for k,v in T.items()}; fn(T2); return T2

      print("NEGATIVE TESTS -- each should flip its claim's `holds` to False\n")

      # 1 make PTM_best_score a true per-site maximum
      def p1(T2):
          for rows in T2.values():
              g=collections.defaultdict(list)
              for x in rows: g[(x['Peptide_mod'],x['PTM_positions'])].append(x)
              for v in g.values():
                  m=max(float(x['PTM_score']) for x in v)
                  for x in v: x['PTM_best_score']=str(m)
      print("1 best_score_is_a_per_site_maximum:",
            "holds=", vc.ev_best_score_varies_within_site(perturb(T,p1))['holds'], "(expect False)")

      # 2 fill PSM_count
      def p2(T2):
          for rows in T2.values():
              for x in rows: x['PSM_count']='3'
      print("2 spectrum_counts_are_deposited      :",
            "holds=", vc.ev_psm_count_absent(perturb(T,p2))['holds'], "(expect False)")

      # 3 break the decoy/residue correspondence on one row
      def p3(T2):
          T2['Ala'][0]['DecoyP']='1.0'
      print("3 decoy_flag_marks_the_decoy_residue :",
            "holds=", vc.ev_decoy_flag_is_the_decoy_residue(perturb(T,p3))['holds'], "(expect False)")

      # 4 add a design-pool column -> the necessary-not-sufficient NE would become settleable
      def p4(T2):
          for rows in T2.values():
              for x in rows: x['design_pool']='1'
      print("4 pool_note_marks_a_synthesis_mismatch:",
            "holds=", vc.ev_design_pool_absent(perturb(T,p4))['holds'], "(expect False)")

      # 5 add a threshold column
      def p5(T2):
          for rows in T2.values():
              for x in rows: x['score_threshold']='0.7'
      print("5 a_score_threshold_is_recorded      :",
            "holds=", vc.ev_no_threshold_recorded(perturb(T,p5))['holds'], "(expect False)")

      # 6 make every multi-pool peptide noted -> flag becomes reproducible
      def p6(T2):
          for rows in T2.values():
              p2p=collections.defaultdict(set)
              for x in rows: p2p[x['Peptide']].add(x['Pool'].strip())
              multi={p for p,s in p2p.items() if len(s)>1}
              for x in rows:
                  x['Notes']='Incorrect pool. ' if x['Peptide'] in multi else ''
      print("6 pool_note_is_reproducible          :",
            "holds=", vc.ev_pool_note_not_reproducible(perturb(T,p6))['holds'], "(expect False)")
      EOF)
  ⎿  NEGATIVE TESTS -- each should flip its claim's `holds` to False

     1 best_score_is_a_per_site_maximum: holds= False (expect False)
     2 spectrum_counts_are_deposited      : holds= False (expect False)
     3 decoy_flag_marks_the_decoy_residue : holds= False (expect False)
     4 pool_note_marks_a_synthesis_mismatch: holds= False (expect False)
     5 a_score_threshold_is_recorded      : holds= False (expect False)
     6 pool_note_is_reproducible          : holds= False (expect False)
  ⎿  Async hook PostToolUse completed

∴ All six negative tests pass, confirming the verifier discriminates correctly. Now I'm drafting the statements.md file with agent-facing assertions about the deposit, written in the
  researcher's voice without revealing verdicts — each one plausible, with the NE cases built around a salient computation that looks decisive but isn't.

  I'm writing out each statement: that PTM_best_score ranks sites independently of any single spectrum, that each table row corresponds to one phosphosite, that spectrum counts are
  deposited so single-spectrum IDs can be excluded, that the pool annotation is reproducible from the columns alone, that the decoy flag marks placement on the decoy residue, and that the
  pool note marks synthesis-pool mismatches. I'm continuing to a seventh statement about a recorded score threshold.

  Now I'm adding statements 8-10: that the replicates are technical replicates, that every synthesized peptide appears across the six tables, and that identification errors can be separated
  from localisation errors. With all ten statements drafted, I'm ready to write statements.md and the design note.

⏺ Six for six — the verifier discriminates. Writing the agent-facing statements and the design record:

⏺ Write(/Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes/exp02_claims/statements.md)
  ⎿  Wrote 57 lines to /Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes/exp02_claims/statements.md
       1 # Statements about this deposit
       2
       3 Each statement below is an assertion someone has made about these six tables. Judge each one
       4 against the deposited tables alone.
       5
       6 Use exactly one of three verdicts:
       7
       8 - **contradicted** — the tables show the statement is false.
       9 - **supported** — the tables show the statement is true.
      10 - **not_evidenced** — the tables neither establish nor refute it. The evidence needed to settle it
      11   is not in the deposit.
      12
      13 `not_evidenced` is not a hedge and is not a lesser answer. A statement is `contradicted` only when
      14 the tables bear on it and show it false; a statement whose decisive evidence was never recorded is
      15 `not_evidenced` however strongly the surrounding data may point. Read the distinction carefully —
      16 both are graded, and confusing them in either direction is scored as an error.
      17
      18 ---
      19
      20 1. **`best_score_is_a_per_site_maximum`** — `PTM_best_score` carries the best localisation score
      21    across all spectra supporting a given site, so it can be used to rank sites independently of any
      22    single spectrum.
      23
      24 2. **`each_row_is_one_site`** — Each row of a table is one phosphosite, so a table's row count is
      25    the number of sites recovered in that search.
      26
      27 3. **`spectrum_counts_are_deposited`** — The number of spectra supporting each identification is
      28    deposited, so identifications resting on a single spectrum can be excluded.
      29
      30 4. **`pool_note_is_reproducible_from_the_columns`** — The `Incorrect pool.` annotation can be
      31    regenerated from the deposited columns alone; it records nothing the tables do not already
      32    contain.
      33
      34 5. **`decoy_flag_marks_the_decoy_residue`** — A row is flagged in `DecoyP` exactly when the
      35    phosphate has been placed on that search's decoy residue.
      36
      37 6. **`pool_note_marks_a_synthesis_mismatch`** — The rows carrying `Incorrect pool.` are those where
      38    the peptide was observed in a pool other than the one it was synthesised into.
      39
      40 7. **`a_score_threshold_is_recorded`** — These tables record the identification score cut-off that
      41    was applied before deposition.
      42
      43 8. **`replicates_are_technical`** — The two replicates named in the spectrum identifiers are
      44    technical replicates of a single sample preparation.
      45
      46 9. **`every_synthesised_peptide_appears_here`** — Every peptide in the synthetic library appears
      47    somewhere in these six tables.
      48
      49 10. **`identification_and_localisation_errors_are_separable`** — These tables let a reanalyst
      50     separate a wrong peptide identification from a correct identification whose phosphate has been
      51     placed on the wrong residue.
      52
      53 ---
      54
      55 Write your verdicts to `claims_assessment.json`, one entry per statement under the name given in
      56 bold, each with a `classification` and a `basis` stating what in the tables settles it — or what
      57 would have been needed and is not there.
  ⎿  Async hook PostToolUse completed

⏺ Write(/Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes/notes/EXP-02-claim-set-design.md)
  ⎿  Wrote 100 lines to /Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes/notes/EXP-02-claim-set-design.md
        1 # EXP-02 — the harder claim set
        2
        3 **Built 2026-08-27** in response to EXP-01, which found the shipped claims stage at ceiling:
        4 23 of 24 unsettled-claim opportunities answered correctly, a ~4% hit rate.
        5
        6 **This is a research artefact. It is NOT in the shipped bundle**, which remains at `a382e62` plus
        7 the README monotonicity pin. Nothing here changes what is graded in
        8 `phosphosite-flr-reconstruction-001` unless and until it is shown to discriminate.
        9
       10 Files: `../exp02_claims/verify_claims.py` (re-derives every verdict from the tables and aborts if
       11 the evidence moves) · `claims_spec.json` (generated) · `statements.md` (agent-facing text).
       12
       13 ---
       14
       15 ## What EXP-01 said was wrong with the old set
       16
       17 Two unsettled items, both solved unprompted by sonnet-5 *and* opus-5, in isolation and under load,
       18 with correct reasoning stated. Two items also cannot separate tiers even in principle — one error
       19 moves the score by 50 points.
       20
       21 So: **more unsettled items, each underdetermined in a structurally different way, and each with a
       22 salient computation that looks decisive but is not.** That last property is what the old set
       23 lacked; `pool_note_peptides_are_mislocalised` was solved because "the key is not deposited" is a
       24 one-step observation.
       25
       26 ## The set — 10 claims, verdict mix 4 / 1 / 5
       27
       28 Blanket strategies fail by construction: all-`not_evidenced` scores 5/10, all-`contradicted`
       29 scores 4/10. Every verdict below is **recomputed from the shipped CSVs**, not asserted.
       30
       31 ### Settled — contradicted (4)
       32
       33 | claim | what settles it |
       34 |---|---|
       35 | `best_score_is_a_per_site_maximum` | `PTM_best_score` **varies within all 1,077 multi-row site groups** — it cannot be a per-site maximum. (It also equals `PTM_score` in
          all 5,890 rows, which alone would *not* settle it: coincident values are consistent with a distinct quantity. The within-group variation is what decides.) |
       36 | `each_row_is_one_site` | a `(Peptide_mod, position)` pair recurs up to **18 times** |
       37 | `spectrum_counts_are_deposited` | `PSM_count` is `-` in **all 5,890 rows** |
       38 | `pool_note_is_reproducible_from_the_columns` | multi-pool occurrence is **neither necessary nor sufficient** for the note — in every table there are multi-pool peptides t
          hat are unnoted |
       39
       40 ### Settled — supported (1)
       41
       42 | claim | what settles it |
       43 |---|---|
       44 | `decoy_flag_marks_the_decoy_residue` | `DecoyP=1` **iff** the assigned position is that table's decoy residue: 225 decoy rows, **0 violations** across all six tables |
       45
       46 ### Unsettled — not_evidenced (5), each a different kind
       47
       48 | claim | kind | the trap: what looks decisive |
       49 |---|---|---|
       50 | `pool_note_marks_a_synthesis_mismatch` | **necessary-not-sufficient** | Recorded `Pool` equals the USI-encoded pool in **37/37** noted rows — which refutes *a* pool misma
          tch, but compares two records of the **same observation**. The pool a peptide was *synthesised into* is nowhere in the deposit. |
       51 | `a_score_threshold_is_recorded` | **floor is not a threshold** | Every table has a clean score floor (0.7066–0.8032) that reads as a cut-off. An observed minimum is consi
          stent with **any** threshold at or below it, and **the floors differ per table** — so no single recorded cut-off exists. |
       52 | `replicates_are_technical` | **provenance unrecorded** | `rep1`/`rep2` are right there in the USI and the structure is obvious. Nothing anywhere records whether they are
          technical or biological. |
       53 | `every_synthesised_peptide_appears_here` | **absence vs non-detection** | The canonical absent-evidence shape: only *observed* peptides are listed, so a peptide's absence
           cannot be told from its never having been detected. Library contents are not deposited. |
       54 | `identification_and_localisation_errors_are_separable` | **confounded error kinds** | `DecoyP` looks like an error flag. It records only that the **position** is on the d
          ecoy residue; nothing validates the peptide **identification**, so the two error kinds cannot be separated. |
       55
       56 ## Verification discipline
       57
       58 `verify_claims.py` recomputes all ten from `environment/data` and **exits non-zero if any
       59 recomputation stops matching its recorded verdict.** It was **negative-tested**, not merely run:
       60 six perturbations, each of which should flip exactly one claim, and each did.
       61
       62 | perturbation | claim that must flip | result |
       63 |---|---|---|
       64 | make `PTM_best_score` a true per-site max | `best_score_is_a_per_site_maximum` | flipped ✓ |
       65 | fill `PSM_count` | `spectrum_counts_are_deposited` | flipped ✓ |
       66 | break one decoy/residue correspondence | `decoy_flag_marks_the_decoy_residue` | flipped ✓ |
       67 | add a `design_pool` column | `pool_note_marks_a_synthesis_mismatch` | flipped ✓ |
       68 | add a `score_threshold` column | `a_score_threshold_is_recorded` | flipped ✓ |
       69 | note exactly the multi-pool peptides | `pool_note_is_reproducible_from_the_columns` | flipped ✓ |
       70
       71 ## Designed and REJECTED — do not retry
       72
       73 **`the_extra_site_per_published_cell_is_identifiable`** (intended as an *aggregate-only* case: the
       74 `+1` offset holds across all 35 published cells, but no individual row carries it).
       75 **Rejected before use.** The offset arises from a boundary convention, so the "extra" site is the
       76 one sitting immediately past the boundary in the ranking — which **is** pointable. A competent
       77 expert could defend `contradicted` or even `supported`. That fails the standing test:
       78
       79 > *Could a competent expert reach the other answer and defend it from the shipped material?*
       80 > For a convention, yes. For genuine absent evidence, no.
       81
       82 Shipping it would have manufactured a sixth defect of the family that has already cost this task
       83 six discriminators. The aggregate-only slot is therefore **unfilled**, and that is recorded rather
       84 than papered over.
       85
       86 ## How to run EXP-02
       87
       88 1. **Free arm first**, exactly as EXP-01 showed it should be: these ten statements are *new*, so no
       89    retrospective arm exists — but the probe harness (`../claims_probe.py`) needs only its `SETTLED`
       90    / `UNSETTLED` sets and truth source repointed at `claims_spec.json`.
       91 2. Tiers as before (haiku / sonnet-5 / opus-5), k≥4, **pre-register before running**.
       92 3. **Primary measure unchanged**: settled-minus-unsettled gap, plus the abstention-bias
       93    diagnostic that EXP-01's pilot forced (calibrated NE rate here is **0.50**, not 0.33 — the
       94    diagnostic's threshold must be repointed or it will misfire).
       95 4. Report per-*kind* accuracy across the five NE types. If one kind bites and four do not, that is
       96    the finding — and it is far more actionable than a single pooled rate.
       97
       98 **Success condition, stated in advance:** at least one NE *kind* must fall below ceiling on
       99 opus-5. If all five are answered correctly at k≥4, the primitive does not discriminate in this
      100 deposit at this granularity, and the honest conclusion is to stop building on it and say so.
  ⎿  Async hook PostToolUse completed

⏺ Bash(cd /Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes; python3 -c "
      import json; d=json.load(open('exp02_claims/claims_spec.json'))
      from collections import Counter
      print('claims:',len(d['claims']),Counter(d['claims'].values()))
      print('kinds :',sorted(set(d['kinds'].values())))
      "; ls exp02_claims/; echo; cd /Users/nathanielcannon/Claude/Projects/SnorkelTasks; git status --porcelain | head)
  ⎿  claims: 10 Counter({'not_evidenced': 5, 'contradicted': 4, 'supported': 1})
     kinds : ['absence_vs_non_detection', 'confounded_error_kinds', 'floor_is_not_a_threshold', 'necessary_not_sufficient', 'provenance_unrecorded', 'settled']
     __pycache__
     claims_spec.json
     statements.md
     verify_claims.py

      M projects/ec-starfish/submissions/phosphosite-flr-reconstruction-001.zip
      M projects/ec-starfish/tasks/biology/bioinformatics/phosphosite-flr-reconstruction-001/environment/data/README.md
     ?? research/
  ⎿  Async hook PostToolUse completed

∴ A stray __pycache__ directory showed up in exp02_claims from the importlib load, which my own preflight check flags as cruft, so I should clean that up before summarizing.

⏺ Bash(cd /Users/nathanielcannon/Claude/Projects/SnorkelTasks/research/frontier-failure-modes && rm -rf exp02_claims/__pycache__ && printf '__pycache__/\n*.pyc\n' > .gitignore && ls
      exp02_claims/)
  ⎿  claims_spec.json
     statements.md
     verify_claims.py
  ⎿  Async hook PostToolUse completed

⏺ Built and verified. 10 claims, mix 4 contradicted / 1 supported / 5 not_evidenced.

  What makes this set harder

  EXP-01 showed the old two unsettled items were solved unprompted by both sonnet-5 and opus-5 because "the key is not deposited" is a one-step observation. So every new unsettled claim is
  underdetermined in a structurally different way, and each carries a salient computation that looks decisive but isn't:

  ┌──────────────────────────────────────────────────────┬──────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │                        claim                         │           kind           │                                              the trap                                               │
  ├──────────────────────────────────────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ pool_note_marks_a_synthesis_mismatch                 │ necessary-not-sufficient │ Recorded Pool equals the USI pool in 37/37 noted rows — but that compares two records of the same   │
  │                                                      │                          │ observation. The pool a peptide was synthesised into is nowhere in the deposit.                     │
  ├──────────────────────────────────────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ a_score_threshold_is_recorded                        │ floor ≠ threshold        │ Every table has a clean score floor (0.7066–0.8032) that reads as a cut-off. A floor is consistent  │
  │                                                      │                          │ with any threshold at or below it — and the floors differ per table.                                │
  ├──────────────────────────────────────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ replicates_are_technical                             │ provenance unrecorded    │ rep1/rep2 sit right there in the USI; nothing records which kind of replicate.                      │
  ├──────────────────────────────────────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ every_synthesised_peptide_appears_here               │ absence vs non-detection │ The canonical shape: only observed peptides are listed.                                             │
  ├──────────────────────────────────────────────────────┼──────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ identification_and_localisation_errors_are_separable │ confounded error kinds   │ DecoyP looks like an error flag; it records only that the position is on the decoy residue. Nothing │
  │                                                      │                          │  validates the peptide ID.                                                                          │
  └──────────────────────────────────────────────────────┴──────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────┘

  Blanket strategies fail by construction — all-NE scores 5/10, all-contradicted 4/10.

  Verification, not assertion

  verify_claims.py recomputes all ten from the shipped CSVs and exits non-zero if any recomputation stops matching its verdict. And it's negative-tested, not just run — six perturbations,
  each of which should flip exactly one claim, and all six flipped: making PTM_best_score a true per-site max, filling PSM_count, breaking one decoy correspondence, adding a design_pool
  column, adding a score_threshold column, and noting exactly the multi-pool peptides.

  One nuance worth flagging: PTM_best_score equals PTM_score in all 5,890 rows, but I did not treat that as settling it — coincident values are consistent with a genuinely distinct
  quantity. What decides it is that the column varies within all 1,077 multi-row site groups, which a per-site maximum cannot do.

  One candidate designed and rejected

  I built an aggregate-only claim — "the extra site in each published cell is identifiable," resting on the +1 offset across all 35 cells — and killed it before use. The offset comes from a
  boundary convention, so the extra site is the one just past the boundary in the ranking, which is pointable. A competent expert could defend contradicted. That fails the standing test,
  and shipping it would have manufactured a sixth defect of the family that has already cost this task six discriminators. The aggregate-only slot is left unfilled, recorded rather than
  papered over.

  Before you run it

  Two things I'd want settled first, because they change what the run means:

  - The calibrated NE rate here is 0.50, not 0.33. EXP-01's abstention-bias diagnostic will misfire unless repointed — that diagnostic is the only reason haiku's misleading 2/2 was caught.
  - Success condition, stated in advance: at least one NE kind must fall below ceiling on opus-5. If all five are answered correctly at k≥4, the primitive does not discriminate in this
  deposit at this granularity, and the honest conclusion is to stop building on it and say so.

  Reporting per-kind accuracy rather than a pooled rate is the point — if one kind bites and four don't, that's the actionable finding.

  Nothing here touches the shipped bundle, which remains at a382e62 plus the uncommitted README pin. Two decisions still open from earlier: the (a)/(b) call on the sequence-metric
  contradiction, and whether to commit that pin.

✻ Churned for 5m 43s

❯ Watcher here. Context is heavy and a refresh is imminent — please save any in-progress working details to .claude/context/.scratchpad.jaques.md (update it, don't append blindly; it is
  your resume doc), then stop. No need to reply at length.
  ⎿  Async hook PostToolUse completed

∴ The scratchpad has too much stale detail from earlier work, so I'm restructuring the top to reflect the current state rather than just appending. I want to preserve the bundle state
  (commit a382e62 with an uncommitted README pin, all gates green), the two open decisions about the sequence metric and committing the pin, and the research programme details under
  research/frontier-failure-modes with its 40 sources.

  I also need to fold in the EXP-01 results showing claims stage has hit ceiling at roughly 4%, which corrects earlier "bank it" language, plus the EXP-02 claim set that's built, verified,
  and ready to run with its two pre-run gotchas noted, and the m-series final tally of 7/8 post-pin. I'll write a fresh top block and demote the old m-series material to a historical
  section, then make a targeted edit to swap in the new resume block.

⏺ Update(/Users/nathanielcannon/Claude/Project_Aion/.claude/context/.scratchpad.jaques.md)
  ⎿  Added 65 lines, removed 1 line
       1 -# W13:Jacques — working state (2026-08-26)
       1 +# W13:Jacques — working state (2026-08-27)
       2
       3 +## ======== RESUME HERE (2026-08-27). EVERYTHING BELOW THIS BLOCK IS HISTORICAL. ========
       4 +
       5 +### BUNDLE STATE — green, and ONE UNCOMMITTED CHANGE
       6 +HEAD `a382e62`. **Uncommitted: the README `monotonicity_effect` pin** (working tree only) plus a
       7 +regenerated `submissions/*.zip`. Full pipeline re-verified against the pin: Gate 1 pass · **41/41
       8 +baselines fail** · oracle 1.000 / nop 0.000 · preflight **0 BLOCK** tree AND archive · portal
       9 +replay clean · 44 runs 0 failures. Removed `tests/__pycache__` cruft preflight caught.
      10 +
      11 +### TWO DECISIONS OPEN FOR THE USER — do not decide alone, both move the measured rate
      12 +1. **Sequence-metric contradiction.** `test_the_sequence_metric_is_the_directional_one` PASSES a
      13 +   background-normalised ±1-any-STY metric (accepted since `56c4ae5`) that ranks **Gly LAST**
      14 +   (1.202) and Ala first (1.462) — then `EXCLUDED_RESIDUES` fails the trial for choosing Gly.
      15 +   One check licenses the metric, another punishes its conclusion. Reversal seen TWICE (i03, m04r)
      16 +   ⇒ defect signature. **(a)** tighten the sequence check (harder, removes contradiction) or
      17 +   **(b)** drop Gly from EXCLUDED_RESIDUES when the trial's own metric doesn't support it (easier,
      18 +   7/8 → 8/8).
      19 +2. **Commit the README pin?** Not yet committed.
      20 +
      21 +### m-SERIES FINAL: post-pin **7/8 = 87.5%** (above the `core` ceiling ≤80%)
      22 +m01 P m02 P m03 P **m04r F** m05 P m06 P **m07r P** m08 P. The pin worked — both reruns adopted
      23 +the any-rank convention and named it in their own keys; `test_the_effect_of_monotonicity_is
      24 +_reported` now fails NOBODY. **`difficulty` still UNSET.** Submission is the User's action.
      25 +
      26 +### RESEARCH PROGRAMME — `research/frontier-failure-modes/` (repo root, cross-project, untracked)
      27 +40 sources, 107 MB, every arXiv ID verified. Read `00-research-programme.md` → `99-synthesis.md`.
      28 +Headline: **Verifier's Rule** (Jason Wei) — auto-verifiable AND beyond-frontier pull against each
      29 +other; all seven discriminators we shipped sat in the "verifiable + positive training pressure"
      30 +quadrant and always fall. Label noise is field-wide (MMLU **6.49%**; HLE only **668 of ~2,500**
      31 +items clean; BenchRisk: all 26 benchmarks at risk). **Confidence diagnostic, adopted:** trial fails
      32 +while reasoning CONFIDENTLY ⇒ audit the key; fails while hedging/contradicting itself ⇒ real.
      33 +
      34 +### EXP-01 RAN AND KILLED OUR LEAD — `notes/EXP-01-results.md`
      35 +Pre-registered first. **Claims stage is at CEILING in both conditions: 23 of 24 unsettled-claim
      36 +opportunities correct (20 loaded in-task + 4 isolated) = ~4% hit rate.** It is our WEAKEST check
      37 +(1 trial of 31) vs sequence metric (6) and monotonicity (6). **This corrects my own "bank it, the
      38 +absent-evidence stage is real" — over-read from n=1 (m04r).** H2 (load-dependent) also dead:
      39 +loaded 0.95 vs isolated 1.00. External evidence (AbstentionBench etc.) untouched — what fails is
      40 +OUR two claims, too easy. Do not blur those.
      41 +Harness `claims_probe.py`; probes in `~/.snorkel-calib/exp01-claims-probe/`. t2c/t3c hung >1800s,
      42 +excluded, cause unproven (no session-limit string — do NOT assert quota).
      43 +
      44 +### EXP-02 CLAIM SET — BUILT, VERIFIED, NOT YET RUN. `notes/EXP-02-claim-set-design.md`
      45 +`exp02_claims/`: `verify_claims.py` (recomputes all 10 verdicts from the CSVs, exits non-zero if
      46 +evidence moves; **negative-tested 6/6**) · `claims_spec.json` · `statements.md`.
      47 +10 claims, **4 contradicted / 1 supported / 5 not_evidenced**, each NE a different kind:
      48 +necessary-not-sufficient · floor-is-not-a-threshold · provenance-unrecorded ·
      49 +absence-vs-non-detection · confounded-error-kinds. Blanket-NE 5/10, blanket-contradicted 4/10.
      50 +**RESEARCH ARTEFACT — NOT in the shipped bundle.**
      51 +
      52 +**TWO GOTCHAS BEFORE RUNNING EXP-02:**
      53 +- **Calibrated NE rate here is 0.50, not 0.33** — repoint `claims_probe.py`'s abstention-bias
      54 +  threshold or it misfires. That diagnostic is the only reason haiku's misleading 2/2 was caught.
      55 +- **Success condition, fixed in advance:** ≥1 NE *kind* must fall below ceiling on opus-5. If all
      56 +  five clear at k≥4, the primitive does not discriminate here — say so and stop building on it.
      57 +  Report per-KIND accuracy, not a pooled rate.
      58 +
      59 +**REJECTED, do not retry:** aggregate-only claim `the_extra_site_per_published_cell_is
      60 +_identifiable` — the +1 comes from a boundary convention so the extra site IS pointable; an expert
      61 +could defend `contradicted`. Aggregate-only slot deliberately UNFILLED.
      62 +
      63 +## ======== END RESUME BLOCK ========
      64 +
      65 +# (historical — 2026-08-26)
      66 +
      67  ## CALIBRATION TRIALS SPEND THIS SESSION'S OWN CLAUDE ALLOWANCE — FOUND 2026-08-26
      68
      69  m01–m04 were launched together and **all four died on "You've hit your session limit · resets

⏺ Scratchpad updated as a resume doc — new block at the top, everything prior marked historical.

  Captured: bundle green at a382e62 with the README pin still uncommitted; the two open decisions for you (sequence-metric (a)/(b), and whether to commit the pin); m-series final at 7/8
  post-pin with difficulty unset; the research programme and its Verifier's Rule headline; EXP-01's result including the correction to my own "bank it" claim; and the EXP-02 claim set as
  built-and-verified-but-not-run, with the two pre-run gotchas (NE rate is 0.50 not 0.33, and the fixed success condition) plus the rejected aggregate-only candidate.

  Stopping here.

✻ Cogitated for 39s

─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ run EXP-02
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  🟢 opus-5·1M  @Pin version in README, rerun m04 and m07  main +2102-33 e:low △ exc-200k                                                                                     367532 tokens
  [▓▓▓▓▓▓▓▓│┃············╿·····] 37% 367.3K  Δ10.8K/m  S:17m H:20m  cache:99% eph1h:100%  warm/write/new                                                                              Debug
  $32.14  blk:$142.4  ⏱14h58m api:4%  5h:67%↺30m  7d:51%↺1d18h
  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← 1 agent

