# AudioBookShelf Library Conventions

Reference document for ABS librarian and task-investigator personas.
Both personas should use these rules to make autonomous decisions about
audiobook library structure without requiring human input.

## Expected Directory Structure

```
${AUDIOBOOKS_PATH}/
  Author Name/
    Book Title/
      audio files...
    Book Title {Narrator Name}/
      audio files...
    Series Name/
      Book 1/
        audio files...
      Book 2/
        audio files...
```

## Naming Rules

| Rule | Example Before | Example After |
|------|---------------|---------------|
| Author at root level | `Brandon Sanderson/` | Correct |
| Title as direct child of author | `Brandon Sanderson/Skyward/` | Correct |
| Narrator in curly braces | `Title {Jane Doe}/` | Correct |
| No author prefix in title | `Brandon Sanderson/Brandon Sanderson - Skyward/` | `Brandon Sanderson/Skyward/` |
| No format tags | `Title (Unabridged)/` or `Title [MP3]/` | `Title/` |
| No metadata tags | `Title [32k]/` | `Title/` |
| Series books go in series folder | `Brandon Sanderson/Cytonic Skyward, Book 3/` | `Brandon Sanderson/Skyward/Cytonic/` |
| Square brackets become curly for narrators | `Title [Jane Doe]/` | `Title {Jane Doe}/` |

## Decision Rules for Restructuring

These rules allow the investigator to promote restructure tasks without human input:

1. **Duplicate author folders**: If `Author/Author - Title/` exists alongside `Author/Title/`, merge contents into `Author/Title/` and delete the duplicate wrapper. This is ALWAYS safe.

2. **Typo author folders**: If folder name is a misspelling of the parent author (e.g., `Brand Sanderson` inside `Brandon Sanderson/`), treat it as a restructure — move contents to correct location.

3. **Series consolidation**: If a book title contains "Book N" or a series name that matches an existing sibling folder, move it into that series folder. Example: "Cytonic Skyward, Book 3" belongs in the existing `Skyward/` folder.

4. **Root-level loose files**: Files or folders at the AudioBooks root that clearly belong to an author should be moved to `Author/Title/` structure. Use ABS API or folder contents to determine the author.

5. **Multi-disc preservation**: NEVER flatten multi-disc structures (`Disc 1/`, `CD 2/`, `Part 1/`). Keep them as-is within their parent title folder.

## When to Still Block (Needs Human)

- Ambiguous author (can't determine correct author from filename)
- Multiple valid destinations (book could belong to 2+ series)
- Content files that might be duplicates (same book, different format)
- Encrypted files (.aax) — keep as-is, don't delete or move
- Folders with `metadata.json` (ABS-managed, don't touch)
