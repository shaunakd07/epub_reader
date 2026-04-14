const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const prevBtn = document.getElementById("prevBtn") as HTMLButtonElement;
const nextBtn = document.getElementById("nextBtn") as HTMLButtonElement;
const fontDec = document.getElementById("fontDec") as HTMLButtonElement;
const fontInc = document.getElementById("fontInc") as HTMLButtonElement;
const singleBtn = document.getElementById("singleBtn") as HTMLButtonElement;
const spreadBtn = document.getElementById("spreadBtn") as HTMLButtonElement;
const darkToggle = document.getElementById("darkToggle") as HTMLButtonElement;
const lineToggle = document.getElementById("lineToggle") as HTMLButtonElement;
const marginRange = document.getElementById("marginRange") as HTMLInputElement;
const marginValue = document.getElementById("marginValue") as HTMLInputElement;
const viewer = document.getElementById("viewer") as HTMLElement;
const tocList = document.getElementById("tocList") as HTMLElement;
const status = document.getElementById("status") as HTMLElement;

declare const ePub: any;

type ContentsHandle = any;

let book: any = null;
let rendition: any = null;
let fontSize = 100;
let darkMode = false;
let lineReaderEnabled = false;
let marginPx = 24;
let activeContents: ContentsHandle | null = null;
let resizeFrame = 0;

const READER_MEASURE_CH = 72;
const READER_TOP_PADDING_PX = 40;
const READER_BOTTOM_PADDING_PX = 56;

const lineReaderCss = `
:root {
  --lr-top: 0px;
  --lr-height: 24px;
}
body.line-reader-on {
  text-shadow: 0 1px 0 rgba(255,255,255,0.15), 0 -1px 0 rgba(0,0,0,0.35);
}
#line-reader-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  mask: linear-gradient(
    #000 0,
    #000 calc(var(--lr-top)),
    transparent calc(var(--lr-top)),
    transparent calc(var(--lr-top) + var(--lr-height)),
    #000 calc(var(--lr-top) + var(--lr-height)),
    #000 100%
  );
  -webkit-mask: linear-gradient(
    #000 0,
    #000 calc(var(--lr-top)),
    transparent calc(var(--lr-top)),
    transparent calc(var(--lr-top) + var(--lr-height)),
    #000 calc(var(--lr-top) + var(--lr-height)),
    #000 100%
  );
}
`;

function setStatus(text: string) {
  status.textContent = text;
}

function clearViewer() {
  if (resizeFrame) {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
  }
  viewer.innerHTML = "";
  activeContents = null;
}

function updateControls() {
  singleBtn.classList.add("active");
  spreadBtn.classList.remove("active");
  spreadBtn.disabled = true;
  spreadBtn.title = "Two-page spreads are disabled in the scrolling layout.";
  darkToggle.classList.toggle("active", darkMode);
  lineToggle.classList.toggle("active", lineReaderEnabled);
}

function renderToc(nav: { toc: Array<{ label: string; href: string }> }) {
  tocList.innerHTML = "";
  if (!nav || !nav.toc || nav.toc.length === 0) {
    tocList.textContent = "No table of contents found.";
    return;
  }
  for (const item of nav.toc) {
    const link = document.createElement("a");
    link.textContent = item.label;
    link.href = "#";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      if (rendition) {
        rendition.display(item.href);
      }
    });
    tocList.appendChild(link);
  }
}

function updatePageStatus(location: any) {
  if (!book || !book.locations) {
    return;
  }
  const cfi = location && location.start ? location.start.cfi : null;
  if (!cfi) {
    return;
  }
  const current = book.locations.locationFromCfi(cfi);
  const total = book.locations.total;
  if (current === null || !total) {
    return;
  }
  setStatus(`Page ${current + 1} / ${total}`);
}

function applyTheme() {
  document.body.classList.toggle("dark", darkMode);
  if (!rendition) {
    return;
  }
  rendition.themes.select(darkMode ? "dark" : "light");
  const bg = darkMode ? "#111" : "#fbf7f0";
  const fg = darkMode ? "#e7e1d8" : "#2d251a";
  rendition.themes.override("body", "background", bg);
  rendition.themes.override("body", "color", fg);
  rendition.themes.override("html", "background", bg);
  rendition.themes.override("html", "color", fg);
}

function applyReadingLayout() {
  if (!rendition) {
    return;
  }
  const loc = rendition.location && rendition.location.start ? rendition.location.start.cfi : null;
  if (typeof rendition.flow === "function") {
    rendition.flow("scrolled-doc");
  }
  rendition.spread("none");
  if (loc) {
    rendition.display(loc);
  }
}

function applyMarginToContents(contents: ContentsHandle) {
  const doc = contents.document as Document;
  if (!doc) {
    return;
  }
  const pad = `${marginPx}px`;
  const bodyWidth = `min(100%, calc(${READER_MEASURE_CH}ch + (${pad} * 2)))`;
  let styleEl = doc.getElementById("epub-margin-style") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = doc.createElement("style");
    styleEl.id = "epub-margin-style";
    if (doc.head) {
      doc.head.appendChild(styleEl);
    } else {
      doc.documentElement.appendChild(styleEl);
    }
  }
  styleEl.textContent = `
    html {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      overflow-x: hidden !important;
      column-width: auto !important;
      column-gap: 0 !important;
      overflow-wrap: break-word !important;
      word-break: normal !important;
      word-wrap: break-word !important;
    }
    body {
      margin: 0 auto !important;
      padding: ${READER_TOP_PADDING_PX}px ${pad} ${READER_BOTTOM_PADDING_PX}px !important;
      width: ${bodyWidth} !important;
      min-width: 0 !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      overflow-x: hidden !important;
      overflow-wrap: break-word !important;
      word-break: normal !important;
      word-wrap: break-word !important;
      hyphens: auto !important;
    }
    body > * {
      max-width: 100% !important;
    }
    p, li, blockquote, dd, dt, figcaption {
      max-width: 100% !important;
      overflow-wrap: break-word !important;
      word-break: normal !important;
    }
    img, svg, video, audio, canvas, iframe, table {
      max-width: 100% !important;
      height: auto !important;
    }
    table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
    }
    th, td {
      overflow-wrap: break-word !important;
      word-break: break-word !important;
    }
    pre, code {
      max-width: 100% !important;
      white-space: pre-wrap !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
  `;
}

function scheduleRenditionResize() {
  if (!rendition || typeof rendition.resize !== "function") {
    return;
  }
  if (rendition.settings && rendition.settings.flow === "scrolled-doc") {
    return;
  }
  if (resizeFrame) {
    cancelAnimationFrame(resizeFrame);
  }
  const targetRendition = rendition;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    if (targetRendition !== rendition) {
      return;
    }
    if (!viewer.clientWidth || !viewer.clientHeight) {
      return;
    }
    if (!targetRendition.manager || typeof targetRendition.manager.resize !== "function") {
      return;
    }
    targetRendition.resize(viewer.clientWidth, viewer.clientHeight);
  });
}

function applyMargin() {
  if (!rendition) {
    return;
  }
  const contents = rendition.getContents();
  contents.forEach((c: ContentsHandle) => applyMarginToContents(c));
  scheduleRenditionResize();
}

function setLineReaderPosition(contents: ContentsHandle, top: number, height: number) {
  const doc = contents.document as Document;
  const maxH = Math.max(0, (doc.documentElement.clientHeight || doc.body.clientHeight) - height);
  const clamped = Math.min(Math.max(0, top), maxH);
  doc.documentElement.style.setProperty("--lr-top", `${clamped}px`);
  doc.documentElement.style.setProperty("--lr-height", `${height}px`);
  contents.__lineReaderTop = clamped;
  contents.__lineReaderHeight = height;
  activeContents = contents;
}

function applyLineReaderToContents(contents: ContentsHandle, enabled: boolean) {
  const doc = contents.document as Document;
  if (!doc || !doc.body || !doc.documentElement) {
    return;
  }
  const body = doc.body;
  const head = doc.head || doc.documentElement;

  let styleEl = doc.getElementById("line-reader-style") as HTMLStyleElement | null;
  if (!styleEl && enabled) {
    styleEl = doc.createElement("style");
    styleEl.id = "line-reader-style";
    styleEl.textContent = lineReaderCss;
    head.appendChild(styleEl);
  }

  let overlay = doc.getElementById("line-reader-overlay") as HTMLDivElement | null;
  if (!overlay && enabled) {
    overlay = doc.createElement("div");
    overlay.id = "line-reader-overlay";
    body.appendChild(overlay);
  }

  const handler = (event: MouseEvent) => {
    const x = event.clientX;
    const y = event.clientY;
    let range: Range | null = null;
    const docAny = doc as any;
    if (docAny.caretRangeFromPoint) {
      range = docAny.caretRangeFromPoint(x, y) as Range | null;
    } else if (docAny.caretPositionFromPoint) {
      const pos = docAny.caretPositionFromPoint(x, y);
      if (pos) {
        range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset + 1);
      }
    }
    if (!range) {
      return;
    }
    const rects = range.getClientRects();
    if (!rects || rects.length === 0) {
      return;
    }
    const rect = rects[0];
    const top = Math.max(0, rect.top);
    const height = Math.max(18, rect.height || 24);
    setLineReaderPosition(contents, top, height);
  };

  if (enabled) {
    body.classList.add("line-reader-on");
    doc.addEventListener("mousemove", handler);
    doc.addEventListener("click", handler);
    contents.__lineReaderHandler = handler;
  } else {
    body.classList.remove("line-reader-on");
    const existing = contents.__lineReaderHandler as ((e: MouseEvent) => void) | null;
    if (existing) {
      doc.removeEventListener("mousemove", existing);
      doc.removeEventListener("click", existing);
      contents.__lineReaderHandler = null;
    }
    if (overlay) {
      overlay.remove();
    }
    if (styleEl) {
      styleEl.remove();
    }
  }
}

function applyLineReaderAll(enabled: boolean) {
  if (!rendition) {
    return;
  }
  const contents = rendition.getContents();
  contents.forEach((c: ContentsHandle) => applyLineReaderToContents(c, enabled));
}

function stepLineReader(direction: number) {
  if (!lineReaderEnabled) {
    return;
  }
  let contents = activeContents;
  if (!contents && rendition) {
    const list = rendition.getContents();
    if (list.length > 0) {
      contents = list[0];
    }
  }
  if (!contents) {
    return;
  }
  const height = contents.__lineReaderHeight || 24;
  const top = typeof contents.__lineReaderTop === "number" ? contents.__lineReaderTop : 0;
  setLineReaderPosition(contents, top + height * direction, height);
}

async function openBook(file: File) {
  try {
    clearViewer();
    if (book) {
      book.destroy();
      book = null;
    }
    rendition = null;
    setStatus(`Loading ${file.name}...`);
    book = ePub(file);
    await book.ready;
    await book.locations.generate(1600);
    rendition = book.renderTo("viewer", {
      width: "100%",
      height: "100%",
      manager: "continuous",
      flow: "scrolled-doc",
      spread: "none",
      minSpreadWidth: 999999
    });

    rendition.themes.register("light", {
      body: { background: "#fbf7f0", color: "#2d251a" },
      html: { background: "#fbf7f0", color: "#2d251a" }
    });
    rendition.themes.register("dark", {
      body: { background: "#111", color: "#e7e1d8" },
      html: { background: "#111", color: "#e7e1d8" }
    });

    applyTheme();
    applyReadingLayout();

    rendition.on("relocated", (location: any) => {
      updatePageStatus(location);
    });

    rendition.on("rendered", (_section: any, contents: ContentsHandle) => {
      applyMarginToContents(contents);
      applyLineReaderToContents(contents, lineReaderEnabled);
    });

    rendition.display().then(() => {
      applyMargin();
    });

    const nav = await book.loaded.navigation;
    renderToc(nav);
    updateControls();
    setStatus(`Loaded ${file.name}`);
  } catch (err) {
    console.error(err);
    setStatus("Failed to load book. Check console for details.");
  }
}

fileInput.addEventListener("change", (e) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    openBook(target.files[0]);
  }
});

prevBtn.addEventListener("click", () => {
  if (rendition) {
    rendition.prev();
  }
});

nextBtn.addEventListener("click", () => {
  if (rendition) {
    rendition.next();
  }
});

fontDec.addEventListener("click", () => {
  if (rendition) {
    fontSize = Math.max(60, fontSize - 10);
    rendition.themes.fontSize(`${fontSize}%`);
    scheduleRenditionResize();
  }
});

fontInc.addEventListener("click", () => {
  if (rendition) {
    fontSize = Math.min(200, fontSize + 10);
    rendition.themes.fontSize(`${fontSize}%`);
    scheduleRenditionResize();
  }
});

singleBtn.addEventListener("click", () => {
  applyReadingLayout();
  updateControls();
});

darkToggle.addEventListener("click", () => {
  darkMode = !darkMode;
  applyTheme();
  updateControls();
});

lineToggle.addEventListener("click", () => {
  lineReaderEnabled = !lineReaderEnabled;
  applyLineReaderAll(lineReaderEnabled);
  updateControls();
});

marginRange.addEventListener("input", (e) => {
  const target = e.target as HTMLInputElement;
  marginPx = Number(target.value);
  marginValue.value = String(marginPx);
  applyMargin();
});

marginValue.addEventListener("input", (e) => {
  const target = e.target as HTMLInputElement;
  const val = Number(target.value);
  if (Number.isFinite(val)) {
    marginPx = Math.max(0, Math.min(120, val));
    marginRange.value = String(marginPx);
    applyMargin();
  }
});

window.addEventListener("keydown", (e) => {
  if (lineReaderEnabled && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    stepLineReader(e.key === "ArrowUp" ? -1 : 1);
    return;
  }
  if (!rendition) {
    return;
  }
  if (e.key === "ArrowLeft") {
    rendition.prev();
  }
  if (e.key === "ArrowRight") {
    rendition.next();
  }
});

if (typeof ResizeObserver !== "undefined") {
  const viewerResizeObserver = new ResizeObserver(() => {
    scheduleRenditionResize();
  });
  viewerResizeObserver.observe(viewer);
}

window.addEventListener("resize", () => {
  scheduleRenditionResize();
});
