# EPUB Reader (Core)

Minimal EPUB reader core built with a TypeScript-first layout and a lightweight HTML UI.

## Run locally
Serve the folder with a local server (recommended for file access):

```bash
cd D:/shaun/Projects/epub_reader
python -m http.server 8000
```

Then open http://localhost:8000 in your browser and load an `.epub`.

## Project structure
- `index.html`: UI shell
- `styles.css`: basic styling
- `src/app.ts`: TypeScript source
- `src/app.js`: compiled JS for now
- `vendor/`: third-party libraries (epub.js, jszip)
