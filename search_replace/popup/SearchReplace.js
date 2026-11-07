// Runs inside the page (must be fully self-contained)
function sr(action, query, replacement) {
  const S = (window.__sr ||= { undo: [], redo: [] });
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);

  const nodes = () => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!SKIP.has(n.parentElement?.tagName) && n.nodeValue.trim()) out.push(n);
    }
    return out;
  };

  const re = query
    ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
    : null;

  CSS.highlights.clear();

  if (action === "find") {
    if (!re) return 0;
    const ranges = [];
    for (const node of nodes()) {
      for (const m of node.nodeValue.matchAll(re)) {
        const r = new Range();
        r.setStart(node, m.index);
        r.setEnd(node, m.index + m[0].length);
        ranges.push(r);
      }
    }
    CSS.highlights.set("sr-match", new Highlight(...ranges));
    if (!document.getElementById("sr-style")) {
      const s = document.createElement("style");
      s.id = "sr-style";
      s.textContent = "::highlight(sr-match){background:yellow;color:black;}";
      document.head.appendChild(s);
    }
    return ranges.length;
  }

  if (action === "replace" || action === "redact") {
    if (!re) return 0;
    const batch = [];
    let count = 0;
    for (const node of nodes()) {
      const before = node.nodeValue;
      const after = before.replace(re, (m) => {
        count++;
        return action === "redact" ? "█".repeat(m.length) : replacement;
      });
      if (after !== before) {
        node.nodeValue = after;
        batch.push({ node, before, after });
      }
    }
    if (batch.length) {
      S.undo.push(batch);
      S.redo = [];
    }
    return count;
  }

  if (action === "undo") {
    const batch = S.undo.pop();
    if (!batch) return 0;
    batch.forEach(({ node, before }) => (node.nodeValue = before));
    S.redo.push(batch);
    return batch.length;
  }

  if (action === "redo") {
    const batch = S.redo.pop();
    if (!batch) return 0;
    batch.forEach(({ node, after }) => (node.nodeValue = after));
    S.undo.push(batch);
    return batch.length;
  }
}

// Popup side
const resultEl = document.getElementById("result");

async function run(action) {
  const query = document.getElementById("search").value.trim();
  const replacement = document.getElementById("replace").value;

  if (["find", "replace", "redact"].includes(action) && !query) {
    resultEl.textContent = "Enter a word to search.";
    return;
  }

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      args: [action, query, replacement],
      func: sr,
    });

    const labels = {
      find: `${result} match(es) highlighted.`,
      replace: `${result} replacement(s) made.`,
      redact: `${result} word(s) redacted.`,
      undo: result ? "Undone." : "Nothing to undo.",
      redo: result ? "Redone." : "Nothing to redo.",
    };
    resultEl.textContent = labels[action];
  } catch (err) {
    resultEl.textContent = "Error: " + err.message;
  }
}

document.getElementById("find_button").addEventListener("click", () => run("find"));
document.getElementById("replace_button").addEventListener("click", () => run("replace"));
document.getElementById("redact_button").addEventListener("click", () => run("redact"));
document.getElementById("undo_button").addEventListener("click", () => run("undo"));
document.getElementById("redo_button").addEventListener("click", () => run("redo"));