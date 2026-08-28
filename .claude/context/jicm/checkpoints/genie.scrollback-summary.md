# Pre-/clear Scrollback Capture
# Captured: 2026-08-27T17:39:27Z | key: genie | session: b6bd39d2-0b1c-4cfa-af9c-d87d20a7e2de

                              "column_index": c,
                              "header": heads[c] if c < len(heads) else "",
                              "row_label": grid[r][0]["text"],
                              "cell": cell["text"][:60],
                          })
          return hits''',
      '''def locate(pmcid: str, value: float) -> list[dict]:
          """Every data cell holding `value`, with its column header AND row label.

          Three constraints, each added after it produced a false positive:

          * **Only cells that read as data.** A bare `NUM` search finds the 1 in
            "Salinity (g L-1)", so a rate of exactly 1.0 matched 39 cells in
            PMC6109700, most of them unit strings.
          * **Never column 0.** That column holds row labels, not measurements.
          * **The row label is part of the context.** PMC4929095's Table 3 is
            transposed -- quantities run down the rows ("ARA (nmol mg-1 protein
            h-1)") and treatments across the columns ("Temperature / 43 C"). Reading
            only the column header calls a correctly-extracted ARA value a
            misalignment.
          """
          hits = []
          for label, tbl in tables_of(pmcid):
              grid = build_grid(tbl)
              if not grid:
                  continue
              n_head = split_header(grid)
              heads = header_paths(grid, n_head)
              for r in range(n_head, len(grid)):
                  for c, cell in enumerate(grid[r]):
                      if c == 0 or not cell["text"] or not DATA_CELL.match(cell["text"]):
                          continue
                      if any(abs(v - value) < 1e-9 for v in cell_values(cell["text"])):
                          hits.append({
                              "table": label,
                              "column_index": c,
                              "header": heads[c] if c < len(heads) else "",
                              "row_label": grid[r][0]["text"],
                              "cell": cell["text"][:60],
                          })
          return hits

      #: Above this many matching cells the value is too common to localise -- a rate
      #: of exactly 1.0 or 10.0 will appear all over a table by coincidence, and the
      #: header of an arbitrary match says nothing.
      MAX_LOCALISABLE_HITS = 8''')
      t=t.replace('''def verdict_for(hits: list[dict]) -> str:
          if not hits:
              return "not_in_tables"
          rate = [h for h in hits if RATE_HEAD.search(h["header"])]
          other = [h for h in hits if OTHER_HEAD.search(h["header"])
                   and not RATE_HEAD.search(h["header"])]''',
      '''def verdict_for(hits: list[dict]) -> str:
          if not hits:
              return "not_in_tables"
          if len(hits) > MAX_LOCALISABLE_HITS:
              return "too_common_to_localise"

          def ctx(h: dict) -> str:
              # Row label counts as context: in a transposed table it carries the
              # quantity while the column header carries only the treatment.
              return f"{h['header']} / {h['row_label']}"

          rate = [h for h in hits if RATE_HEAD.search(ctx(h))]
          other = [h for h in hits if OTHER_HEAD.search(ctx(h))
                   and not RATE_HEAD.search(ctx(h))]''')
      open(p,'w').write(t); print("ok")
      PY
      .venv/bin/python scripts/audit_table_column_alignment.py 2>&1 | tail -24)
  ⎿  ok
     audited 451 accepted rates across 103 papers

       confirmed               206  (45.7%)
       not_in_tables           130  (28.8%)
       header_uninformative     64  (14.2%)
       suspect                  50  (11.1%)
       ambiguous                 1  (0.2%)

     50 SUSPECT rates (value sits under a non-rate heading):
        PMC7236179      22 rates -> re_extract_the_rate_column
             under: IAA (μ g mL− 1) / P-Tryptophan
        PMC7727330      21 rates -> DROP -- no rate column exists in this paper
             under: IAA production (μg/mL)
        PMC7536287       3 rates -> re_extract_the_rate_column
             under: ACC (nmol α-ketobutyrate mg–1 h–1)
             under: IAA (μg mL–1)
        PMC7835727       2 rates -> re_extract_the_rate_column
             under: IAA (μ g mL–1)
        PMC9607798       2 rates -> re_extract_the_rate_column
             under: IAA Production (mg/L)

     wrote /Users/nathanielcannon/Claude/Projects/WVU/data/processed/table_column_alignment_audit.json

∴ Good, three false positives are resolved now, so I want to verify those changes are correct. This leaves 50 suspect rates across 5 papers, all under IAA or ACC columns — a coherent
  single-signature finding: 5 PGPR-screening papers where the "ARA rate" is actually mislabeled as IAA production data. I still need to verify the two remaining new candidates, PMC7835727
  and PMC9607798.

⏺ The three false positives are gone. Verifying they reclassified for the right reasons, and spot-checking the remaining suspects.

⏺ Bash(.venv/bin/python - <<'PY'
      import json
      d=json.load(open('data/processed/table_column_alignment_audit.json'))
      P={p['pmcid']:p for p in d['papers']}
      for pm in ('PMC4929095','PMC6109700','PMC6181149'):
          print(pm, P[pm]['verdicts'])
          for r in P[pm]['rates'][:2]:
              h=r['hits'][0] if r['hits'] else None
              print(f"    {r['value']} -> {r['verdict']}"+(f"  row='{h['row_label'][:40]}'" if h else ""))
      print()
      for pm in ('PMC7835727','PMC9607798','PMC7236179'):
          p=P[pm]; print("═══",pm,p['verdicts'])
          for r in p['rates'][:2]:
              if r['verdict']!='suspect': continue
              h=r['hits'][0]
              print(f"    {r['value']} {r['unit']}  | {r['organism']}")
              print(f"      -> {h['table']} col{h['column_index']} hdr='{h['header'][:50]}' row='{h['row_label'][:26]}' cell='{h['cell'][:20]}'")
      PY)
  ⎿  PMC4929095 {'confirmed': 2, 'not_in_tables': 1}
         10.25 -> not_in_tables
         3.21 -> confirmed  row='ARA (nmol mmg−1 protein h−1)'
     PMC6109700 {'not_in_tables': 2}
         1 -> not_in_tables
     PMC6181149 {'not_in_tables': 4}
         8.49 -> not_in_tables
         11.77 -> not_in_tables

     ═══ PMC7835727 {'confirmed': 2, 'suspect': 2}
         195.6 nmoL C2H4 mg protein h-1  | Pantoea dispersa-AA7
           -> TABLE 2 col2 hdr='IAA (μ g mL–1)' row='AA7' cell='195.60 ± 0.93g'
         570.47 nmoL C2H4 mg protein h-1  | Enterobacter asburiae-BY4
           -> TABLE 2 col2 hdr='IAA (μ g mL–1)' row='BY4' cell='570.47 ± 5.19f'
     ═══ PMC9607798 {'suspect': 2}
         22.88 nmol of Ethylene mg Protein−1 h−1  | A1501
           -> Table 1 col5 hdr='IAA Production (mg/L)' row='A1501' cell='22.88 ± 1.17 a'
         29.26 nmol of Ethylene mg Protein−1 h−1  | A1501
           -> Table 1 col5 hdr='IAA Production (mg/L)' row='A1501' cell='29.26 ± 2.47 b'
     ═══ PMC7236179 {'suspect': 22}
         36.35 n mol C2H4 mg protein h-1  | CoY3
           -> Table 2 col2 hdr='IAA (μ g mL− 1) / P-Tryptophan' row='CoY3' cell='36.35 ± 0.10nm'
         44.82 n mol C2H4 mg protein h-1  | CoY7
           -> Table 2 col2 hdr='IAA (μ g mL− 1) / P-Tryptophan' row='CoY7' cell='44.82 ± 0.61k'

∴ All 50 suspects share the same pattern: the accepted ARA rate is actually the IAA production value for the same organism, pulled from the adjacent column. I notice PMC7835727 has a mix of
  confirmed and suspect cases, while PMC9607798 has only suspect ones. Now I want to verify the true ARA values for papers where I can re-extract them, so I can demonstrate what the
  correction should look like—starting with PMC7236179 where column 3 holds the real ARA data.

  Since the user asked me to run the parser across all 32 papers and produce a full audit, the natural next step is generating corrected values for the four re-extractable papers, totaling
  29 rates across PMC7236179, PMC7536287, PMC7835727, and PMC9607798. This isn't really scope creep since the parser's whole purpose is re-extraction, so I'll write a function that pulls
  the correct rate-column value for each suspect row by matching on the row label.

⏺ All 50 suspects share one signature: the accepted "ARA rate" is the same organism's IAA value from an adjacent column. Since a rate column exists in four of these papers, let me recover
  the correct values — that's what running the parser is for.

⏺ Bash(.venv/bin/python - <<'PY'
      p='scripts/audit_table_column_alignment.py'; t=open(p).read()
      t=t.replace('''def accepted_rates() -> dict[str, list[dict]]:''',
      '''def correct_value(pmcid: str, row_label: str) -> dict | None:
          """The value in the genuine rate column, on the row the wrong value came from.

          Recovery is only possible because the misextraction stayed on the correct
          ROW -- it took the right organism's wrong assay. So the fix is to read
          across to the rate column of that same row.
          """
          for label, tbl in tables_of(pmcid):
              grid = build_grid(tbl)
              if not grid:
                  continue
              n_head = split_header(grid)
              heads = header_paths(grid, n_head)
              rate_cols = [c for c, h in enumerate(heads) if RATE_HEAD.search(h) and c]
              if not rate_cols:
                  continue
              for r in range(n_head, len(grid)):
                  if grid[r][0]["text"].strip() != row_label.strip():
                      continue
                  for c in rate_cols:
                      if c >= len(grid[r]):
                          continue
                      cell = grid[r][c]["text"]
                      if DATA_CELL.match(cell):
                          vals = cell_values(cell)
                          if vals:
                              return {"table": label, "column": heads[c],
                                      "cell": cell, "value": vals[0]}
          return None

      def accepted_rates() -> dict[str, list[dict]]:''')
      t=t.replace('''    for s in suspects:
              s["remedy"] = remedy[s["pmcid"]]''',
      '''    for s in suspects:
              s["remedy"] = remedy[s["pmcid"]]
          # Recover the true value for suspects whose paper does have a rate column.
          for p in papers:
              for r in p["rates"]:
                  if r["verdict"] != "suspect" or not r["hits"]:
                      continue
                  if remedy.get(p["pmcid"], "").startswith("DROP"):
                      continue
                  fix = correct_value(p["pmcid"], r["hits"][0]["row_label"])
                  if fix:
                      r["corrected"] = fix
          for s in suspects:
              src = next((r for p in papers if p["pmcid"] == s["pmcid"]
                          for r in p["rates"]
                          if r["value"] == s["value"] and r["organism"] == s["organism"]), None)
              if src and src.get("corrected"):
                  s["corrected_value"] = src["corrected"]["value"]
                  s["corrected_from_column"] = src["corrected"]["column"]''')
      t=t.replace('''            for h in heads[:2]:
                      print(f"        under: {h[:80]}")''',
      '''            for h in heads[:2]:
                      print(f"        under: {h[:80]}")
                  fixed = [s for s in suspects if s["pmcid"] == pm and "corrected_value" in s]
                  if fixed:
                      print(f"        recovered {len(fixed)}/{n}: "
                            + ", ".join(f"{s['value']}->{s['corrected_value']}"
                                        for s in fixed[:5])
                            + (" ..." if len(fixed) > 5 else ""))''')
      open(p,'w').write(t); print("ok")
      PY
      .venv/bin/python scripts/audit_table_column_alignment.py 2>&1 | tail -22)
  ⎿  ok
       header_uninformative     64  (14.2%)
       suspect                  50  (11.1%)
       ambiguous                 1  (0.2%)

     50 SUSPECT rates (value sits under a non-rate heading):
        PMC7236179      22 rates -> re_extract_the_rate_column
             under: IAA (μ g mL− 1) / P-Tryptophan
             recovered 22/22: 36.35->10.04, 44.82->16.65, 49.26->17.65, 42.14->5.53, 51.84->16.74 ...
        PMC7727330      21 rates -> DROP -- no rate column exists in this paper
             under: IAA production (μg/mL)
        PMC7536287       3 rates -> re_extract_the_rate_column
             under: ACC (nmol α-ketobutyrate mg–1 h–1)
             under: IAA (μg mL–1)
             recovered 3/3: 732.93->29.6, 517.19->29.6, 1096.1->29.6
        PMC7835727       2 rates -> re_extract_the_rate_column
             under: IAA (μ g mL–1)
             recovered 2/2: 195.6->24.82, 570.47->28.97
        PMC9607798       2 rates -> re_extract_the_rate_column
             under: IAA Production (mg/L)
             recovered 2/2: 22.88->1618.2, 29.26->1618.2

∴ 29 out of 50 recovered so far, and PMC7536287's value of 29.6 matches the independently-written re-extraction, which is a good cross-check. But PMC9607798 looks suspicious — both rates
  map to the same A1501 row and recover the same 1618.2 value, so I need to check whether that paper actually has two distinct conditions being conflated.

⏺ 29 of 50 recovered — and PMC7536287 independently recovers 29.6, matching the dedicated re-extraction written separately. Two independent parsers agreeing is good cross-validation. But
  PMC9607798 mapping both rates to 1618.2 needs a look.

⏺ Bash(.venv/bin/python - <<'PY'
      import sys; sys.path.insert(0,'scripts')
      from audit_table_column_alignment import tables_of, build_grid, split_header, header_paths
      for lab,t in tables_of('PMC9607798'):
          g=build_grid(t); n=split_header(g); h=header_paths(g,n)
          if not any('thylene' in x or 'itrogenase' in x for x in h): continue
          print(lab,"headers:")
          for i,x in enumerate(h): print(f"   col{i}: {x[:64]}")
          for r in range(n,min(n+6,len(g))): print("   ",[c['text'][:16] for c in g[r]])
      PY)
  ⎿  Table 1 headers:
        col0: Strains
        col1: Mannitol-Treated Condition
        col2: Phosphate Solubilization Ability / Diameter of Halo (cm)
        col3: Phosphate Solubilization Ability / Diameter of Colony (cm)
        col4: Phosphate Solubilization Ability / PSI
        col5: IAA Production (mg/L)
        col6: ACC Deaminase Activity (μmol a-Ketobutyrate mg Protein−1 h−1)
        col7: Nitrogenase Activity (nmol of Ethylene mg Protein−1 h−1)
        col8: Extracellular Ammonium Concentration (μM)
         ['1568/pVA3', '0', '1.70 ± 0.01 a', '1.11 ± 0.02 a', '1.53 ± 0.04 a', '28.61 ± 1.11 b', '3.88 ± 0.10 a', '1792.3 ± 98.7 b', '20.3 ± 0.4 b']
         ['1568/pVA3', '200 mM', '1.74 ± 0.02 a', '1.13 ± 0.02 a', '1.54 ± 0.06 a', '32.67 ± 0.99 c', '3.74 ± 0.06 a', '1675.1 ± 112.9 a', '18.2 ± 0.2 a']
         ['A1501', '0', '1.68 ± 0.04 a', '1.06 ± 0.03 a', '1.59 ± 0.12 a', '22.88 ± 1.17 a', '3.80 ± 0.09 a', '1618.2 ± 101.4 a', 'n.d.']
         ['A1501', '200 mM', '1.72 ± 0.02 a', '1.10 ± 0.02 a', '1.57 ± 0.07 a', '29.26 ± 2.47 b', '3.85 ± 0.11 a', '1564.8 ± 90.6 a', 'n.d.']
         ['nifH-mutant', '0', '1.69 ± 0.03 a', '1.12 ± 0.01 a', '1.51 ± 0.05 a', '24.79 ± 2.30 a', '3.76 ± 0.05 a', 'n.d.', 'n.d.']
         ['nifH-mutant', '200 mM', '1.73 ± 0.03 a', '1.12 ± 0.04 a', '1.55 ± 0.10 a', '28.14 ± 1.03 b', '3.81 ± 0.07 a', 'n.d.', 'n.d.']

∴ I notice a flaw in my recovery approach: PMC9607798's table has two rows both labeled 'A1501', differing only by the Mannitol-Treated Condition column (0 vs 200 mM), so matching on row
  label alone pulls the wrong value for one of them—the correct pair should be 1618.2 for 0 mM and 1564.8 for 200 mM, corresponding to accepted IAA values of 22.88 and 29.26.

  I need to fix this by disambiguating via row index rather than label—having the locate step record the row position and table, then having correct_value take the table label plus row
  index to pull the exact cell. I also note the nifH-mutant's n.d. nitrogenase reading serves as a useful internal control in this paper. Now I'm implementing the row-index-based fix.

⏺ A real bug in my recovery: PMC9607798 has two rows both labelled A1501 (0 mM and 200 mM mannitol), and matching on label alone returns the first for both. The correct values are 1618.2
  and 1564.8. Recovering by row index instead.

⏺ Bash(.venv/bin/python - <<'PY'
      p='scripts/audit_table_column_alignment.py'; t=open(p).read()
      t=t.replace('''                    hits.append({
                              "table": label,
                              "column_index": c,''',
      '''                    hits.append({
                              "table": label,
                              "row_index": r,
                              "column_index": c,''')
      t=t.replace('''def correct_value(pmcid: str, row_label: str) -> dict | None:
          """The value in the genuine rate column, on the row the wrong value came from.

          Recovery is only possible because the misextraction stayed on the correct
          ROW -- it took the right organism's wrong assay. So the fix is to read
          across to the rate column of that same row.
          """
          for label, tbl in tables_of(pmcid):
              grid = build_grid(tbl)
              if not grid:
                  continue
              n_head = split_header(grid)
              heads = header_paths(grid, n_head)
              rate_cols = [c for c, h in enumerate(heads) if RATE_HEAD.search(h) and c]
              if not rate_cols:
                  continue
              for r in range(n_head, len(grid)):
                  if grid[r][0]["text"].strip() != row_label.strip():
                      continue
                  for c in rate_cols:
                      if c >= len(grid[r]):
                          continue
                      cell = grid[r][c]["text"]
                      if DATA_CELL.match(cell):
                          vals = cell_values(cell)
                          if vals:
                              return {"table": label, "column": heads[c],
                                      "cell": cell, "value": vals[0]}
          return None''',
      '''def correct_value(pmcid: str, table_label: str, row_index: int) -> dict | None:
          """The value in the genuine rate column, on the exact row the bad value came from.

          Recovery works only because the misextraction stayed on the correct ROW --
          it took the right organism's wrong assay -- so the fix reads across to the
          rate column of that same row.

          Keyed on row INDEX, not row label. PMC9607798's table carries two rows both
          labelled `A1501`, distinguished only by a treatment column (0 and 200 mM
          mannitol). Matching by label returned the first row for both rates and gave
          them the same corrected value, 1618.2, when the second is 1564.8.
          """
          for label, tbl in tables_of(pmcid):
              if label != table_label:
                  continue
              grid = build_grid(tbl)
              if not grid or row_index >= len(grid):
                  continue
              heads = header_paths(grid, split_header(grid))
              for c, head in enumerate(heads):
                  if not c or not RATE_HEAD.search(head) or c >= len(grid[row_index]):
                      continue
                  cell = grid[row_index][c]["text"]
                  if DATA_CELL.match(cell):
                      vals = cell_values(cell)
                      if vals:
                          return {"table": label, "column": head, "cell": cell,
                                  "value": vals[0], "row_index": row_index}
          return None''')
      t=t.replace('''            fix = correct_value(p["pmcid"], r["hits"][0]["row_label"])''',
      '''            h0 = r["hits"][0]
                  fix = correct_value(p["pmcid"], h0["table"], h0["row_index"])''')
      open(p,'w').write(t); print("ok")
      PY
      .venv/bin/python scripts/audit_table_column_alignment.py 2>&1 | tail -18)
  ⎿  ok
     50 SUSPECT rates (value sits under a non-rate heading):
        PMC7236179      22 rates -> re_extract_the_rate_column
             under: IAA (μ g mL− 1) / P-Tryptophan
             recovered 22/22: 36.35->10.04, 44.82->16.65, 49.26->17.65, 42.14->5.53, 51.84->16.74 ...
        PMC7727330      21 rates -> DROP -- no rate column exists in this paper
             under: IAA production (μg/mL)
        PMC7536287       3 rates -> re_extract_the_rate_column
             under: ACC (nmol α-ketobutyrate mg–1 h–1)
             under: IAA (μg mL–1)
             recovered 3/3: 732.93->29.6, 517.19->29.6, 1096.1->29.6
        PMC7835727       2 rates -> re_extract_the_rate_column
             under: IAA (μ g mL–1)
             recovered 2/2: 195.6->24.82, 570.47->28.97
        PMC9607798       2 rates -> re_extract_the_rate_column
             under: IAA Production (mg/L)
             recovered 2/2: 22.88->1618.2, 29.26->1564.8

∴ I double-check the second cross-reference value against the table row and confirm it's correct. Now I'm moving on to writing tests that pin down the grid-building behavior with
  rowspan/colspan and the transposed table case where row labels carry the quantity.

  I still need to cover excluding column 0, handling duplicate row labels as distinct corrections, and the five suspect papers before writing the test file, updating docs, and
  committing—plus a final pass to verify the counts.

⏺ Correct now. Pinning all of it with tests — every one of these came from a real false positive or bug in this session.

  ⎿  Wrote 155 lines to /Users/nathanielcannon/Claude/Projects/WVU/tests/test_table_column_alignment.py
        1 """Table-grid resolution and the column-alignment verdicts.
        2
        3 Every case below came from a real false positive or bug produced while running
        4 this audit over the corpus. The audit's own errors all pointed the same way --
        5 calling a correct extraction a defect -- which is why each is pinned.
        6
        7     .venv/bin/python -m pytest tests/test_table_column_alignment.py -q
        8 """
        9
       10 from __future__ import annotations
       11
       12 import json
       13 import sys
       14 import xml.etree.ElementTree as ET
       15 from pathlib import Path
       16
       17 sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
       18
       19 from audit_table_column_alignment import (  # noqa: E402
       20     DATA_CELL, build_grid, correct_value, header_paths, locate, split_header,
       21     verdict_for,
       22 )
       23
       24 ROOT = Path(__file__).resolve().parent.parent
       25 AUDIT = ROOT / "data/processed/table_column_alignment_audit.json"
       26
       27
       28 def grid_of(xml: str):
       29     return build_grid(ET.fromstring(xml))
       30
       31
       32 # --- grid resolution -------------------------------------------------------
       33
       34 ROWSPAN = """<table>
       35 <tr><th rowspan="2">Strain</th><th>Non-fixing</th><th colspan="2">N-fixing</th></tr>
       36 <tr><th>DT (h)</th><th>Nitrogenase</th><th>Hydrogen</th></tr>
       37 <tr><td>CGA009</td><td>4.8</td><td>107.7</td><td>110.7</td></tr>
       38 </table>"""
       39
       40
       41 def test_rowspan_offsets_the_subheader():
       42     """`Strain` spans two rows, so the sub-header starts at column 1. A
       43     colspan-only parse puts `DT (h)` at column 0 and shifts every heading."""
       44     g = grid_of(ROWSPAN)
       45     heads = header_paths(g, split_header(g))
       46     assert heads[0] == "Strain"
       47     assert heads[1].endswith("DT (h)")
       48     assert "Nitrogenase" in heads[2]
       49     assert "Hydrogen" in heads[3]
       50
       51
       52 def test_colspan_and_rowspan_together_give_a_rectangular_grid():
       53     g = grid_of(ROWSPAN)
       54     assert len({len(r) for r in g}) == 1, "all rows same width"
       55     assert len(g[0]) == 4
       56
       57
       58 TD_SUBHEADER = """<table>
       59 <tr><th>Strains</th><th colspan="2">IAA production</th><th>Nitrogen fixation</th></tr>
       60 <tr><td>Strains</td><td>Spectrophotometric</td><td>HPLC</td><td>Growth on N2 free medium</td></tr>
       61 <tr><td>ESR9</td><td>48.83</td><td>44.1</td><td>+</td></tr>
       62 </table>"""
       63
       64
       65 def test_subheader_written_as_td_is_still_a_header():
       66     """PMC7727330 writes its sub-heading row as `td`. An all-`th` rule stops at
       67     one row and misreads the sub-headings as data. Note "N2 free" contains a
       68     digit, so the header test must not treat any digit as data."""
       69     g = grid_of(TD_SUBHEADER)
       70     assert split_header(g) == 2
       71     assert "Spectrophotometric" in header_paths(g, 2)[1]
       72
       73
       74 def test_data_cell_rejects_text_containing_digits():
       75     assert not DATA_CELL.match("Growth on N2 free medium")
       76     assert not DATA_CELL.match("Salinity (g L-1)")
       77     assert not DATA_CELL.match("Expression of nifH")
       78     assert DATA_CELL.match("48.83")
       79     assert DATA_CELL.match("29.60a")
       80     assert DATA_CELL.match("1618.2 ± 101.4 a")
       81
       82
       83 # --- verdicts --------------------------------------------------------------
       84
       85
       86 def test_transposed_table_is_confirmed_not_suspect():
       87     """PMC4929095's Table 3 runs quantities down the rows and treatments across
       88     the columns, so the column header reads `Temperature / 43 C` over a
       89     correctly-extracted ARA value. Reading only the column header calls a good
       90     extraction a defect."""
       91     hits = [{"header": "Temperature / 43 °C",
       92              "row_label": "ARA (nmol mg−1 protein h−1)"}]
       93     assert verdict_for(hits) == "confirmed"
       94
       95
       96 def test_value_matching_too_many_cells_is_not_localisable():
       97     """A rate of exactly 1.0 matched 39 cells in PMC6109700. The header of an
       98     arbitrary one of those says nothing."""
       99     hits = [{"header": "x", "row_label": "y"}] * 39
      100     assert verdict_for(hits) == "too_common_to_localise"
      101
      102
      103 def test_iaa_header_over_a_rate_is_suspect():
      104     hits = [{"header": "IAA (μ g mL− 1) / P-Tryptophan", "row_label": "CoY3"}]
      105     assert verdict_for(hits) == "suspect"
      106
      107
      108 def test_no_hits_is_not_a_defect():
      109     assert verdict_for([]) == "not_in_tables"
      110
      111
      112 # --- recovery --------------------------------------------------------------
      113
      114 DUP_LABELS = """<table>
      115 <tr><th>Strains</th><th>Condition</th><th>IAA Production (mg/L)</th>
      116     <th>Nitrogenase Activity (nmol of Ethylene mg Protein-1 h-1)</th></tr>
      117 <tr><td>A1501</td><td>0</td><td>22.88</td><td>1618.2</td></tr>
      118 <tr><td>A1501</td><td>200 mM</td><td>29.26</td><td>1564.8</td></tr>
      119 </table>"""
      120
      121
      122 def test_duplicate_row_labels_recover_distinct_values(tmp_path, monkeypatch):
      123     """PMC9607798 has two rows both labelled `A1501`, differing only by
      124     treatment. Recovering by label gave both rates the same value, 1618.2."""
      125     import audit_table_column_alignment as m
      126     el = ET.fromstring(DUP_LABELS)
      127     monkeypatch.setattr(m, "tables_of", lambda pmcid: [("Table 1", el)])
      128     assert m.correct_value("X", "Table 1", 1)["value"] == 1618.2
      129     assert m.correct_value("X", "Table 1", 2)["value"] == 1564.8
      130
      131
      132 def test_row_label_column_is_never_searched_for_values(monkeypatch):
      133     """Column 0 holds labels, not measurements."""
      134     import audit_table_column_alignment as m
      135     el = ET.fromstring(
      136         '<table><tr><th>Strain</th><th>ARA</th></tr>'
      137         '<tr><td>12.21</td><td>5.5</td></tr></table>')
      138     monkeypatch.setattr(m, "tables_of", lambda pmcid: [("T", el)])
      139     assert m.locate("X", 12.21) == []
      140     assert len(m.locate("X", 5.5)) == 1
      141
      142
      143 # --- the shipped audit -----------------------------------------------------
      144
      145
      146 def test_shipped_audit_reproduces_the_known_paper():
      147     """PMC7536287 was adjudicated by hand and re-extracted by a separate script;
      148     this audit must land on the same answer independently."""
      149     if not AUDIT.exists():
      150         return
      151     a = json.loads(AUDIT.read_text())
      152     s = [x for x in a["suspects"] if x["pmcid"] == "PMC7536287"]
      153     assert len(s) == 3
      154     assert {x["value"] for x in s} == {732.93, 517.19, 1096.1}
      155     assert {x.get("corrected_value") for x in s} == {29.6}

  ⎿  ...........                                                              [100%]
     11 passed in 0.02s
  ⎿  tests/test_table_column_alignment.py (/Users/nathanielcannon/Claude/Projects/WVU/tests/test_table_column_alignment.py):
  ⎿    ✘ [Line 19:6] Import "audit_table_column_alignment" could not be resolved [reportMissingImports] (Pyright)
  ⎿    ✘ [Line 125:12] Import "audit_table_column_alignment" could not be resolved [reportMissingImports] (Pyright)
  ⎿    ✘ [Line 134:12] Import "audit_table_column_alignment" could not be resolved [reportMissingImports] (Pyright)
  ⎿    ★ [Line 20:28] "correct_value" is not accessed (Pyright)
  ⎿    ★ [Line 20:57] "locate" is not accessed (Pyright)
  ⎿    ★ [Line 127:48] "pmcid" is not accessed (Pyright)
  ⎿    ★ [Line 122:55] "tmp_path" is not accessed (Pyright)
  ⎿    ★ [Line 138:48] "pmcid" is not accessed (Pyright)

⏺ Bash(.venv/bin/python - <<'PY'
      p='tests/test_table_column_alignment.py'; t=open(p).read()
      t=t.replace('''from audit_table_column_alignment import (  # noqa: E402
          DATA_CELL, build_grid, correct_value, header_paths, locate, split_header,
          verdict_for,
      )''','''from audit_table_column_alignment import (  # noqa: E402
          DATA_CELL, build_grid, header_paths, split_header, verdict_for,
      )''')
      t=t.replace("def test_duplicate_row_labels_recover_distinct_values(tmp_path, monkeypatch):",
                  "def test_duplicate_row_labels_recover_distinct_values(monkeypatch):")
      t=t.replace('lambda pmcid: [("Table 1", el)]','lambda _pmcid: [("Table 1", el)]')
      t=t.replace('lambda pmcid: [("T", el)]','lambda _pmcid: [("T", el)]')
      open(p,'w').write(t); print("ok")
      PY
      .venv/bin/python -m pytest tests/ -q 2>&1 | tail -3)
  ⎿  ok
     ........................................................................ [ 60%]
     ...............................................                          [100%]
     119 passed in 100.79s (0:01:40)
  ⎿  (timeout 10m)

⏺ 119 tests pass. Documenting the audit.

  Bash(.venv/bin/python - <<'PY'
      p='docs/12_genomic_track_methods.md'; t=open(p).read()
      old="""**This does not retroactively convict PGPR screening as a whole**"""
      new="""#### The audit of all 451 rates — 50 more misaligned, in 5 papers

      `scripts/audit_table_column_alignment.py` → `data/processed/table_column_alignment_audit.json`,
      11 tests in `tests/test_table_column_alignment.py`.

      **The question is inverted deliberately.** Re-reading each paper's ARA column
      would require correctly identifying the rate table and column in 33 papers of
      wildly different shape, failing silently whenever it guessed wrong — and many
      flagged tables are not rate tables at all (PMC12843690's is genome statistics,
      PMC11220614's a photosensitiser review). Instead: take the value **already
      accepted**, find where it sits, and read the heading above it. An accepted rate
      sitting under `IAA` is a misalignment demonstrated, not inferred.

      *Colspan alone is insufficient.* In PMC12016538 the `Strain` heading carries
      `rowspan=2`, so the second header row starts at column 1 and a colspan-only
      parse shifts every sub-heading one column left. The audit resolves a full
      occupancy grid over both spans.

      | verdict | rates | |
      |---|---|---|
      | `confirmed` | **206 (45.7%)** | value sits under a rate heading |
      | `not_in_tables` | 130 (28.8%) | absent from all tables — likely from prose, not a defect |
      | `header_uninformative` | 64 (14.2%) | heading names neither |
      | **`suspect`** | **50 (11.1%)** | **sits under a non-rate heading** |
      | `too_common_to_localise` / `ambiguous` | 1 | — |

      **All 50 suspects share one signature: the accepted "ARA rate" is the same
      organism's IAA production value.**

      | paper | rates | sits under | remedy |
      |---|---|---|---|
      | PMC7236179 | **22** | `IAA / P-Tryptophan` | re-extract — 22/22 recovered |
      | PMC7727330 | **21** | `IAA production` | **DROP — no ARA in the paper** |
      | PMC7536287 | 3 | `IAA`, `ACC` | re-extract — 3/3 recovered |
      | PMC7835727 | 2 | `IAA` | re-extract — 2/2 recovered |
      | PMC9607798 | 2 | `IAA Production` | re-extract — 2/2 recovered |

      **29 of the 50 are recovered automatically**, because the misextraction stayed
      on the correct *row* — it took the right organism's wrong assay — so the fix
      reads across to the rate column of that same row. PMC7236179's 36.35 → **10.04**;
      PMC7835727's 195.6 → **24.82**. Independent cross-check: this audit recovers
      PMC7536287's ED5 as **29.60**, the same answer the separately written
      `reextract_jats_table_rates.py` reached.

      **PMC7727330's 21 rates must be dropped, not corrected.** That paper runs **no
      acetylene reduction assay at all** — every ARA mention is introduction,
      discussion or references. Its nitrogen-fixation columns are qualitative,
      "Growth on N₂-free medium" and "Expression of *nifH*", holding `+` symbols. Its
      21 "rates" are IAA values for a measurement the paper never made. A heading
      match alone would have sent a re-extraction after a rate that does not exist,
      so a rate column must be *named* like a rate **and** hold numbers.

      **The audit's own false positives, all pointing the same way — toward calling a
      correct extraction a defect.** Each is now a test:

      * **Transposed tables.** PMC4929095's Table 3 runs quantities down the rows and
        treatments across the columns, so a correct ARA value sits under
        `Temperature / 43 °C`. The row label is part of the context; 2 rates
        reclassified `suspect` → `confirmed`.
      * **Promiscuous values.** A rate of exactly `1` matched 39 cells in PMC6109700,
        mostly digits inside unit strings like `Salinity (g L⁻¹)`. Only cells that
        read as data are matched, column 0 (row labels) never is, and beyond 8 hits a
        value is `too_common_to_localise`.
      * **Duplicate row labels.** PMC9607798 has two rows both labelled `A1501`,
        differing only by mannitol treatment; recovering by label gave both the same
        corrected value. Recovery is keyed on row **index**.
      * **`td` sub-headers.** PMC7727330 writes its sub-heading row as `td`, so an
        all-`th` rule reports only the group heading. A following row with no data
        cells also counts as header — and "N₂-free medium" contains a digit, so the
        data test cannot treat any digit as a number.

      **What `confirmed` does and does not mean.** It is evidence the extraction read
      the right column. It says nothing about the number's scientific validity, which
      the unit canonicalisation and evidence-class work handle separately. And
      `not_in_tables` plus `header_uninformative` — **194 rates, 43%** — are neither
      confirmed nor refuted here; they are simply outside this method's reach.

      **Net effect on the corpus: 451 accepted rates → 21 to drop, 29 to correct.**
      The 29 corrections change values by up to 20×, and every one moves a rate that
      was too high downward.

      **This does not retroactively convict PGPR screening as a whole**"""
      assert old in t; t=t.replace(old,new,1); open(p,'w').write(t); print("ok")
      PY)
  ⎿  ok

⏺ Bash(.venv/bin/python - <<'PY'
      import json
      d=json.load(open('data/processed/table_column_alignment_audit.json'))
      doc=open('docs/12_genomic_track_methods.md').read()
      v=d['verdicts']; bad=0
      def ck(n,a,e):
          global bad
          if a!=e: print("MISMATCH",n,a,e); bad+=1
      ck("total",d['n_rates'],451); ck("papers",d['n_papers'],103)
      ck("confirmed",v['confirmed'],206); ck("not_in_tables",v['not_in_tables'],130)
      ck("uninformative",v['header_uninformative'],64); ck("suspect",v['suspect'],50)
      ck("n suspects",len(d['suspects']),50)
      rec=[s for s in d['suspects'] if 'corrected_value' in s]
      ck("recovered",len(rec),29)
      drop=[s for s in d['suspects'] if s['remedy'].startswith('DROP')]
      ck("drop",len(drop),21)
      ck("drop paper",{s['pmcid'] for s in drop},{'PMC7727330'})
      import collections
      c=collections.Counter(s['pmcid'] for s in d['suspects'])
      ck("per paper",dict(c),{'PMC7236179':22,'PMC7727330':21,'PMC7536287':3,'PMC7835727':2,'PMC9607798':2})
      ck("7536287 corrected",{s['corrected_value'] for s in rec if s['pmcid']=='PMC7536287'},{29.6})
      mx=max(s['value']/s['corrected_value'] for s in rec if s['corrected_value'])
      print(f"max correction ratio: {mx:.1f}x ; all downward: {all(s['value']>s['corrected_value'] for s in rec)}")
      for txt in ["206 (45.7%)","50 (11.1%)","**22**","**21**","36.35 → **10.04**","29.60","194 rates, 43%","21 to drop, 29 to correct"]:
          if txt not in doc: print("DOC MISSING:",txt); bad+=1
      print("mismatches:",bad)
      PY)
  ⎿  max correction ratio: 37.0x ; all downward: False
     mismatches: 0

∴ I caught two errors in my draft: the actual max change is 37×, not 20×, and PMC9607798's shift from 22.88 to 1618.2 actually moves upward, contradicting my claim that everything moved
  down. I need to fix both and recompute the direction breakdown properly.

⏺ Two claims I wrote are wrong — the max ratio is 37×, not 20×, and corrections are not all downward (PMC9607798's 22.88 → 1618.2 goes up). Getting the real numbers.

⏺ Bash(.venv/bin/python - <<'PY'
      import json,collections
      d=json.load(open('data/processed/table_column_alignment_audit.json'))
      rec=[s for s in d['suspects'] if 'corrected_value' in s]
      down=[s for s in rec if s['value']>s['corrected_value']]
      up=[s for s in rec if s['value']<s['corrected_value']]
      print(f"recovered {len(rec)}: downward {len(down)}, upward {len(up)}")
      print("upward:",[(s['pmcid'],s['value'],s['corrected_value']) for s in up])
      r=[max(s['value'],s['corrected_value'])/min(s['value'],s['corrected_value']) for s in rec]
      print(f"fold-change: min {min(r):.1f}x  median {sorted(r)[len(r)//2]:.1f}x  max {max(r):.1f}x")
      print("largest:",sorted(((max(s['value'],s['corrected_value'])/min(s['value'],s['corrected_value']),s['pmcid'],s['value'],s['corrected_value']) for s in rec),reverse=True)[:3])
      PY)
  ⎿  recovered 29: downward 27, upward 2
     upward: [('PMC9607798', 22.88, 1618.2), ('PMC9607798', 29.26, 1564.8)]
     fold-change: min 1.5x  median 7.6x  max 70.7x
     largest: [(70.72552447552448, 'PMC9607798', 22.88, 1618.2), (53.47915242652084, 'PMC9607798', 29.26, 1564.8), (37.0304054054054, 'PMC7536287', 1096.1, 29.6)]

⏺ Bash(.venv/bin/python - <<'PY'
      p='docs/12_genomic_track_methods.md'; t=open(p).read()
      old="""**Net effect on the corpus: 451 accepted rates → 21 to drop, 29 to correct.**
      The 29 corrections change values by up to 20×, and every one moves a rate that
      was too high downward."""
      new="""**Net effect on the corpus: 451 accepted rates → 21 to drop, 29 to correct.**
      The corrections are large — median **7.6×**, maximum **70.7×** — and they do not
      all run the same way: **27 move downward, 2 upward.** Both upward cases are
      PMC9607798, where the IAA value (22.88) was standing in for a nitrogenase
      activity of 1618.2. So this defect is not a systematic inflation that could be
      spotted by looking for implausibly high rates; it substitutes one assay's
      numbers for another's in whichever direction the table happens to run."""
      assert old in t; t=t.replace(old,new,1); open(p,'w').write(t)
      doc=t
      for s in ["median **7.6×**","**70.7×**","27 move downward, 2 upward"]:
          assert s in doc, s
      print("ok")
      PY
      .venv/bin/python -m pytest tests/ -q 2>&1 | tail -2)
  ⎿  ok
     ...............................................                          [100%]
     119 passed in 41.57s
  ⎿  (timeout 10m)

  Bash(git add -A scripts/ tests/ docs/ && git commit -q -F - <<'MSG' && git log --oneline -1
      Audit all 451 accepted rates for column misalignment: 50 more found

      The question is inverted rather than answered directly. Re-reading each
      paper's ARA column would mean correctly identifying the rate table and
      column in 33 papers of very different shape, failing silently wherever
      it guessed wrong, and many flagged tables are not rate tables at all --
      PMC12843690's is genome statistics, PMC11220614's a photosensitiser
      review. So instead each already-accepted value is located in the paper's
      tables and the heading above it is read. A rate sitting under IAA is a
      misalignment demonstrated rather than inferred, and no guess about which
      column should have been read is needed.

      Colspan alone is not enough for this. In PMC12016538 the Strain heading
      carries rowspan 2, so the second header row begins at column 1 and a
      colspan-only parse shifts every sub-heading one column left. The audit
      resolves a full occupancy grid over both spans.

      Of 451 rates: 206 confirmed, 130 absent from any table and so probably
      taken from prose, 64 under uninformative headings, and 50 suspect. All
      50 share one signature: the accepted ARA rate is the same organism's IAA
      production value. They fall in five papers, PMC7236179 with 22,
      PMC7727330 with 21, PMC7536287 with 3, and PMC7835727 and PMC9607798
      with 2 each.

      29 of the 50 are recovered automatically, because the misextraction
      stayed on the correct row and took the right organism's wrong assay, so
      the fix reads across to the rate column of that row. As an independent
      check this audit recovers PMC7536287's ED5 as 29.60, the same answer the
      separately written reextract_jats_table_rates.py reached.

      PMC7727330's 21 must be dropped rather than corrected. That paper runs
      no acetylene reduction assay at all; every ARA mention is introduction,
      discussion or references, and its nitrogen-fixation columns are
      qualitative, growth on N2-free medium and nifH expression, holding plus
      symbols. Its 21 rates are IAA values for a measurement never made.
      Matching a heading alone would have sent a re-extraction after a rate
      that does not exist, so a rate column must now be named like a rate and
      also hold numbers.

      The corrections are large, median 7.6x and maximum 70.7x, and they do
      not all run the same way: 27 move downward and 2 upward. Both upward
      cases are PMC9607798, where an IAA value of 22.88 stood in for a
      nitrogenase activity of 1618.2. The defect is therefore not a systematic
      inflation that could be caught by looking for implausibly high rates.

      The audit's own false positives all pointed toward calling a correct
      extraction a defect, and each is now a test. Transposed tables:
      PMC4929095 runs quantities down the rows and treatments across the
      columns, so a correct ARA value sits under "Temperature / 43 C" -- the
      row label is part of the context, and two rates move from suspect back
      to confirmed. Promiscuous values: a rate of exactly 1 matched 39 cells
      in PMC6109700, mostly digits inside unit strings like "Salinity (g
      L-1)", so only cells that read as data are matched, column zero never
      is, and beyond eight hits a value is not localisable. Duplicate row
      labels: PMC9607798 has two rows both labelled A1501 differing only by
      treatment, and recovering by label gave both the same corrected value,
      so recovery is keyed on row index. And td sub-headers: PMC7727330 writes
      its sub-heading row as td, so a following row with no data cells now
      counts as header, which in turn requires that a digit inside a word like
      "N2-free medium" not be read as data.

      Confirmed means the extraction read the right column and says nothing
      about a number's scientific validity. The 194 rates that are absent from
      tables or sit under uninformative headings are neither confirmed nor
      refuted; they are outside this method's reach.

      Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
      MSG)
  ⎿  c2c73c4 Audit all 451 accepted rates for column misalignment: 50 more found

  Bash(.venv/bin/python - <<'PY'
      p='.claude/context/.scratchpad.genie.md'; t=open(p).read()
      t=t.replace("""⚠️  **EXPOSURE BOUND (NOT a defect count): 33/103 papers, 191/451 rates (42%)**
      have a colspan'd multi-row header **on the rate-bearing table**.""",
      """**EXPOSURE BOUND was 33/103 papers, 191/451 rates — NOW AUDITED, see below.**""")
      t=t.replace("""### NEGATIVE CONTROL — REPLACED 2026-08-27 (`7308012`). Tier 1 numbers UNCHANGED.""",
      """### FULL COLUMN-ALIGNMENT AUDIT — 2026-08-27 (`c2c73c4`). 50 MORE MISALIGNED.

      `scripts/audit_table_column_alignment.py` → `data/processed/table_column_alignment_audit.json`;
      **11 tests** in `tests/test_table_column_alignment.py`.

      ⚠️ **INVERT THE QUESTION — do NOT try to find each paper's ARA column.** That
      needs the right table+column in 33 papers of wildly different shape and fails
      SILENTLY. Many flagged tables aren't rate tables (PMC12843690 = genome stats,
      PMC11220614 = photosensitiser review). **Instead: locate the ALREADY-ACCEPTED
      value and read the heading above it.** Misalignment demonstrated, not inferred.

      ⚠️ **COLSPAN ALONE IS NOT ENOUGH — need a full rowspan+colspan occupancy grid.**
      PMC12016538's `Strain` has **rowspan=2** → row 1 starts at col **1**; a
      colspan-only parse shifts every sub-heading one column left.

      **451 rates: confirmed 206 (45.7%) · not_in_tables 130 · header_uninformative 64
      · SUSPECT 50 (11.1%) · ambiguous 1.**

      **ALL 50 SUSPECTS = the same signature: the "ARA rate" is that organism's IAA value.**
      | PMC7236179 **22** | PMC7727330 **21** | PMC7536287 3 | PMC7835727 2 | PMC9607798 2 |

      ✅ **29/50 RECOVERED AUTOMATICALLY** — the misextraction stayed on the correct
      **ROW** (right organism, wrong assay), so read across to the rate column of that
      row. **Cross-validated: this audit gets ED5 = 29.60, same as the independently
      written `reextract_jats_table_rates.py`.**

      ⚠️ **PMC7727330's 21 rates must be DROPPED, not corrected — that paper runs NO
      ARA AT ALL.** Every ARA mention is intro/discussion/refs; its N-fixation columns
      are **qualitative** (`Growth on N2-free medium`, `Expression of nifH`, `+` symbols).
      **A rate column must be NAMED like a rate AND HOLD NUMBERS** — heading-match
      alone sent a re-extraction after a rate that doesn't exist.

      ⚠️ **CORRECTIONS ARE NOT A SYSTEMATIC INFLATION.** median **7.6×**, max **70.7×**,
      **27 down / 2 UP** (PMC9607798 22.88 → **1618.2**). **You CANNOT find this defect
      by looking for implausibly high rates.**

      ⚠️ **MY OWN AUDIT'S 4 FALSE POSITIVES — all pointed at calling GOOD extractions
      defects. Each now a test:**
      1. **TRANSPOSED TABLES** — PMC4929095 has quantities in ROWS, treatments in
         columns → correct ARA sat under `Temperature / 43 °C`. **Row label is part of
         the context.** 2 rates suspect→confirmed.
      2. **PROMISCUOUS VALUES** — a rate of exactly `1` matched **39 cells** in
         PMC6109700, mostly digits inside unit strings (`Salinity (g L−1)`). Match only
         DATA cells, **never col 0**, and >8 hits ⇒ `too_common_to_localise`.
      3. **DUPLICATE ROW LABELS** — PMC9607798 has TWO `A1501` rows (0 / 200 mM).
         Recovering by label gave both the same value. **Key on row INDEX.**
      4. **`td` SUB-HEADERS** — PMC7727330's sub-header row is `td`. A no-data row
         after a header counts as header — and **`N2-free` contains a digit**, so the
         data test must not treat any digit as a number.

      **`confirmed` ≠ scientifically valid** (that's the unit/evidence-class work).
      **194 rates (43%) are `not_in_tables`/`header_uninformative` — NEITHER confirmed
      NOR refuted, outside this method's reach.**

      **NET: 451 rates → 21 DROP, 29 CORRECT.** Not yet applied to the rate files.

      ### NEGATIVE CONTROL — REPLACED 2026-08-27 (`7308012`). Tier 1 numbers UNCHANGED.""")
      t=t.replace('HEAD = **`2f8c28b`** "Re-extract PMC7536287: a colspan failure, and bound how far\nit reaches" (parents:',
       'HEAD = **`c2c73c4`** "Audit all 451 accepted rates for column misalignment: 50 more\nfound" (parents: `2f8c28b` PMC7536287 re-extract,')
      t=t.replace("""Next = **Tier 2 (COG categories)**, #3 trait imputation, or **re-extract the
      other 32 colspan-exposed papers** (191 rates). Several open questions need the User.""",
      """Next = **APPLY the audit (21 drop / 29 correct) to the rate files**, then Tier 2
      (COG categories) or #3 trait imputation. Several open questions need the User.""")
      open(p,'w').write(t)
      open('/Users/nathanielcannon/Claude/Project_Aion/.claude/context/.scratchpad.genie.md','w').write(t)
      print("ok")
      PY
      git status --short | grep -v '^??' ; git log --oneline -3)
  ⎿  ok
     c2c73c4 Audit all 451 accepted rates for column misalignment: 50 more found
     2f8c28b Re-extract PMC7536287: a colspan failure, and bound how far it reaches
     7308012 Replace the invalid negative control, and measure what it was masking

⏺ Done and committed (c2c73c4). 119 tests pass, tree clean.

  I inverted the question rather than pointing the parser at 32 papers directly. Finding each paper's ARA column would mean correctly identifying the right table and column in 33 papers of
  very different shape, failing silently whenever it guessed wrong — and many flagged tables aren't rate tables at all (PMC12843690's is genome statistics, PMC11220614's a photosensitiser
  review). Instead I located each already-accepted value and read the heading above it. That demonstrates misalignment rather than inferring it.

  Colspan alone was insufficient: in PMC12016538 the Strain heading carries rowspan=2, so the second header row starts at column 1 and a colspan-only parse shifts every sub-heading one
  column left. The audit resolves a full occupancy grid over both spans.

  Of all 451 rates: 206 confirmed (45.7%), 130 absent from tables (likely from prose), 64 under uninformative headings, and 50 suspect (11.1%). All 50 share one signature — the accepted
  "ARA rate" is the same organism's IAA production value:

  ┌────────────┬───────┬──────────────────────────────┐
  │   paper    │ rates │            remedy            │
  ├────────────┼───────┼──────────────────────────────┤
  │ PMC7236179 │ 22    │ re-extract — 22/22 recovered │
  ├────────────┼───────┼──────────────────────────────┤
  │ PMC7727330 │ 21    │ DROP — no ARA in the paper   │
  ├────────────┼───────┼──────────────────────────────┤
  │ PMC7536287 │ 3     │ recovered (29.60)            │
  ├────────────┼───────┼──────────────────────────────┤
  │ PMC7835727 │ 2     │ recovered                    │
  ├────────────┼───────┼──────────────────────────────┤
  │ PMC9607798 │ 2     │ recovered                    │
  └────────────┴───────┴──────────────────────────────┘

  29 of 50 recovered automatically, because the misextraction stayed on the correct row — right organism, wrong assay — so the fix reads across to that row's rate column. Independent
  cross-check: this audit recovers ED5 as 29.60, matching the separately written re-extraction script.

  PMC7727330's 21 must be dropped, not corrected. That paper runs no acetylene reduction assay at all — every ARA mention is intro, discussion, or references, and its nitrogen-fixation
  columns are qualitative (Growth on N₂-free medium, Expression of nifH, holding + symbols). Its 21 "rates" are IAA values for a measurement never made. Matching a heading alone would have
  sent a re-extraction after a rate that doesn't exist, so a rate column must now be named like a rate and hold numbers.

  Two things worth flagging:

  1. This defect is not a systematic inflation. Corrections run median 7.6×, max 70.7×, and 27 go down, 2 go up — PMC9607798's IAA value of 22.88 was standing in for a nitrogenase activity
  of 1618.2. You cannot find this class of error by looking for implausibly high rates.
  2. My own audit produced four false positives, all pointing the same way — toward calling a correct extraction a defect. Transposed tables (PMC4929095 puts quantities in rows, so correct
  ARA sat under Temperature / 43 °C); promiscuous values (a rate of exactly 1 matched 39 cells, mostly digits inside unit strings like Salinity (g L⁻¹)); duplicate row labels (two A1501
  rows gave both rates the same correction); and td sub-headers. Each is now a test.

  Two honest limits: confirmed means the right column was read, not that the number is scientifically valid; and 194 rates (43%) are neither confirmed nor refuted — they're outside this
  method's reach.

  Net: 451 accepted rates → 21 to drop, 29 to correct. I have not applied those to the rate files — that changes the corpus of record and the 65-species ML core set downstream, so I'd
  rather you confirm before I touch it. That's the obvious next step; otherwise Tier 2 or trait imputation.

✻ Crunched for 10m 19s

❯ Watcher here. Context is heavy and a refresh is imminent — please save any in-progress working details to .claude/context/.scratchpad.genie.md (update it, don't append blindly; it is

∴ The scratchpad already reflects the latest commit from my last update. I just need to double-check it's current and note the remaining open decision about applying the audit, then quickly
  peek at the top of the file to confirm.

  ⎿  # Genie — resume doc (WVU / DOE GENESIS)

     Updated 2026-08-26. Replace wholesale on refresh.

     > Two copies exist (`Project_Aion/.claude/context/` and `Projects/WVU/.claude/context/`).
     > Both are written together. The WVU one is what the hook loads.

     ---

     ## STATE — 2026-08-27

     **NOTHING MID-FLIGHT. Tree clean.** Genomes local + verified; assembly features
     + true coding density done and published (§8.5); **genomic track Tier 1 run,
     Q4 answered, Route B ADJUDICATED + PULLED + RESCANNED**
     (`docs/12_genomic_track_methods.md`).
     Next = **APPLY the audit (21 drop / 29 correct) to the rate files**, then Tier 2
     (COG categories) or #3 trait imputation. Several open questions need the User.
     **Panel controls are now sound — Tier 1 results are quotable.**

     ### ⚠️ TWO CLAIMS CORRECTED 2026-08-27 — do not re-quote the old ones
     ...
     192:### FULL COLUMN-ALIGNMENT AUDIT — 2026-08-27 (`c2c73c4`). 50 MORE MISALIGNED.
     246:**NET: 451 rates → 21 DROP, 29 CORRECT.** Not yet applied to the rate files.
     308:HEAD = **`c2c73c4`** "Audit all 451 accepted rates for column misalignment: 50 more

∴ The scratchpad is current through c2c73c4. I need to fix the date line, which incorrectly reads "Updated 2026-08-26," and make sure the state explicitly notes the pending user decision —
  just those two small edits.

⏺ Scratchpad is already current through c2c73c4. Two small corrections — the stale date line and making the pending decision explicit.

⏺ Bash(.venv/bin/python - <<'PY'
      p='.claude/context/.scratchpad.genie.md'; t=open(p).read()
      t=t.replace("Updated 2026-08-26. Replace wholesale on refresh.",
                  "Updated 2026-08-27. Replace wholesale on refresh.")
      t=t.replace("""Next = **APPLY the audit (21 drop / 29 correct) to the rate files**, then Tier 2
      (COG categories) or #3 trait imputation. Several open questions need the User.
      **Panel controls are now sound — Tier 1 results are quotable.**""",
      """⏸ **AWAITING A USER DECISION — DO NOT APPLY UNASKED.** The column-alignment
      audit says **21 rates DROP + 29 CORRECT**, but applying it rewrites the corpus of
      record (`corpus_full_6k.jsonl` / `chunked_rates.jsonl`) and moves everything
      downstream: the 451 count, the 89 species, the **65-species ML core set**, the
      unit-canonicalisation pools. I surfaced it and stopped rather than editing.
      Next after that = Tier 2 (COG categories) or #3 trait imputation.
      **Panel controls are now sound — Tier 1 results are quotable.**

      **Five sessions of work landed 2026-08-26/27, all committed, tree clean:**
      `406fd04` Route B adjudication → `496dc1f` pull+rescan (27 genomes) →
      `3a0de6d` PGPR adjudication (6 rates quarantined) → `7308012` negative-control
      replacement → `2f8c28b` PMC7536287 re-extract → `c2c73c4` full 451-rate audit.
      **119 tests pass.** Only untracked files are `.claude/logs/genome_pull.*`.""")
      open(p,'w').write(t)
      open('/Users/nathanielcannon/Claude/Project_Aion/.claude/context/.scratchpad.genie.md','w').write(t)
      print("saved + synced both copies")
      PY
      git status --short | grep -v '^??' || echo "tree clean (only untracked genome_pull logs)")
  ⎿  saved + synced both copies
     tree clean (only untracked genome_pull logs)

⏺ Saved and synced to both copies. Stopping here.

  State: nothing in flight, tree clean, 119 tests pass. Six commits landed this session (406fd04 → c2c73c4), all documented in docs/12_genomic_track_methods.md.

  One decision waiting for you: the column-alignment audit says 21 rates to drop and 29 to correct, but applying it rewrites the corpus of record and moves the 451 count, the 89 species,
  and the 65-species ML core set. I've flagged it in the resume doc as awaiting your call rather than acting on it.

✻ Crunched for 21s

❯ apply the audit
  🟢 opus-5·1M  @Resume work from Genie checkpoint  main +2428-142 e:low △ exc-200k                                                                                           362384 tokens
  $35.95  blk:$142.4  ⏱13h18m api:5%  5h:67%↺30m  7d:51%↺1d18h
  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← 1 agent
