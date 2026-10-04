# Alchemist Detailing

The website and booking platform for Alchemist Detailing, Parker, Texas.

## See the site on your computer

1. Open a terminal in this folder.
2. Run `npx serve site`, or, if you have Python, `python3 -m http.server 8080 --directory site`.
3. Open the address it prints, usually http://localhost:3000 or http://localhost:8080.

You can also double-click `site/index.html`. The fonts and the moving backgrounds still load.

## Continue with Claude Code

1. Put this folder somewhere permanent, for example `Documents/alchemist-detailing`.
2. Open Claude Code in this folder: the desktop app's Code tab, or `claude` in a terminal. Setup: https://code.claude.com/docs/en/overview
3. Claude Code reads `CLAUDE.md` automatically. Paste the prompt from `START-HERE.md` as your first message.

## What's where

- `site/`: the website
- `supabase/`: the database (Migration 001) and server functions
- `docs/`: every decision, report and plan, numbered in order
- `brand/`: the logo files
- `db-tests/`: the database tests
- `tools/`: preview and screenshot helpers
