# MTG Card Sales Analysis Project

## Overview
Data analysis project to optimize Magic: The Gathering card sales across three buyer platforms.

## Location
- **Project Root**: `/Users/nathanielcannon/Claude/Projects/mtg-card-sales/`
- **Jarvis Reference**: `/Users/nathanielcannon/Claude/Jarvis/projects/mtg-card-sales/`

## Quick Start
```bash
cd /Users/nathanielcannon/Claude/Projects/mtg-card-sales
./run_dashboard.sh
# Then open http://127.0.0.1:8050 in browser
```

## Objective
Compare buylist prices from three sites to determine optimal selling strategy:
1. **CardKingdom** (https://www.cardkingdom.com/)
2. **CardConduit** (https://cardconduit.com/)
3. **StarCityGames** (https://sellyourcards.starcitygames.com/)

## Data Sources
- `data/raw/Sell List_Edit.csv` - TCGPlayer export with 176 cards, market values
- `data/raw/card_kingdom_example.csv` - CardKingdom CSV format example
- `data/raw/Estimate XU-KVNCP Items - Card Conduit.html` - Card Conduit price estimates (page 1 of 2)
- `data/raw/CSV Upload #4419 Star City Games Sell Your Cards.html` - SCG price estimates (36 matched)

## Key Decisions
- **Price Comparison**: Per-card unit prices (not total value)
- **Condition**: All cards Near Mint
- **MVP Features**: Price comparison table + Export recommendations

## Analysis Results (as of initial build)
- **Total Cards**: 176 cards (193 total quantity)
- **TCG Market Value**: $1,289.92
- **Best Buylist Value**: $778.65
- **Cards with Prices**: 138 from CardConduit, 36 from SCG
- **Cards to Sell**: 84
- **Cards to Keep**: 55 (LoTR < $5 or others < $1)
- **Cards to Proxy**: 27 (LoTR/D&D themed with buy > $5)

## Tech Stack
- Python 3.9+ with Pandas 2.x
- Plotly Dash for interactive dashboard
- BeautifulSoup for HTML parsing
- Dash Bootstrap Components for styling

## Project Structure
```
mtg-card-sales/
├── app/
│   ├── __init__.py
│   └── dashboard.py      # Dash interactive dashboard
├── data/
│   ├── raw/              # Source files (CSVs, HTMLs)
│   ├── processed/        # Merged analysis CSV
│   └── exports/          # Generated upload CSVs
├── src/
│   ├── __init__.py
│   ├── data_loader.py    # Load TCGPlayer data, export formatters
│   ├── html_parser.py    # Parse CardConduit/SCG HTML
│   ├── analysis.py       # Merge sources, recommendations
│   └── generate_exports.py
├── requirements.txt
├── run_dashboard.sh      # Launch script
└── venv/                 # Python virtual environment
```

## Status
- [x] Project infrastructure
- [x] TCGPlayer data parsing
- [x] Export formatters (3 sites)
- [x] HTML price extraction
- [x] Merged analysis table
- [x] Interactive dashboard

## Next Steps (Future Iterations)
1. Upload generated CSVs to each site and save new HTML results
2. Refine export formats based on matching errors
3. Add CardKingdom price parsing when HTML available
4. Add scatterplots comparing prices across sites
5. Add bulk export by buyer (all cards best sold to CardConduit, etc.)
