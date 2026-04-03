// content/scope.js — UBC Scope Portal job detail page parser

(function () {
  if (document.getElementById("shortlist-btn")) return;

  // ── helpers (defined before use) ──────────────────────────────────────────

  function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function createButton() {
    const b = document.createElement("button");
    b.id = "shortlist-btn";
    b.textContent = "📌 Shortlist";
    Object.assign(b.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "9999",
      padding: "12px 20px",
      fontSize: "14px",
      fontWeight: "600",
      background: "#f5f0e8",
      color: "#b91c1c",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(185,28,28,0.35)",
      letterSpacing: "0.01em",
    });
    return b;
  }

  function setState(b, state, customLabel) {
    const labels = {
      default: "📌 Shortlist",
      loading: "⏳ Saving…",
      success: "✅ Saved!",
      error: customLabel || "❌ Failed",
    };
    b.textContent = labels[state] || labels.default;
    b.disabled = state === "loading";
    if (state === "success") setTimeout(() => setState(b, "default"), 2000);
    else if (state === "error") setTimeout(() => setState(b, "default"), 3000);
  }

  // Find a table row by its label cell text, return the value cell text.
  // Scope uses <th>Label</th><td>Value</td> or <td>Label</td><td>Value</td> patterns.
  function findTableValue(labelText) {
    const cells = document.querySelectorAll("th, td");
    for (const cell of cells) {
      if (cell.textContent.trim().replace(/\s+/g, " ").toLowerCase()
          .startsWith(labelText.toLowerCase())) {
        // Value is in the next sibling td, or the next td in the parent tr
        const next = cell.nextElementSibling;
        if (next) return next.textContent.trim();
        const row = cell.closest("tr");
        if (row) {
          const tds = row.querySelectorAll("td");
          if (tds.length >= 2) return tds[tds.length - 1].textContent.trim();
        }
      }
    }
    return null;
  }

  function parseJobTitle() {
    // Prefer the "Job Title" table row (cleaner than h1)
    const fromTable = findTableValue("job title");
    if (fromTable) return cleanTitle(fromTable);

    // Fallback: h1 on the page
    const h1 = document.querySelector("h1");
    if (h1) return cleanTitle(h1.textContent.trim());

    return null;
  }

  // Remove Scope's prefix/suffix artifacts:
  //   "179469 - S26 Product Designer 179469" → "Product Designer"
  //   "S26 Product Designer 179469"          → "Product Designer"
  function cleanTitle(raw) {
    let t = raw.replace(/\s+/g, " ").trim();
    t = t.replace(/^\d+\s*-\s*/, "");          // strip leading "179469 - "
    t = t.replace(/\s+\d{5,}$/, "");           // strip trailing posting ID (5+ digits)
    t = t.replace(/^[A-Z]\d{2}\s+/, "");       // strip term code "S26 " / "W26 "
    return t.trim();
  }

  function parseCompany() {
    // "Organization:" row in ORGANIZATION INFORMATION section
    const fromOrg = findTableValue("organization");
    if (fromOrg) return fromOrg;

    // Sometimes labelled "Employer:" or "Company:"
    return findTableValue("employer") || findTableValue("company") || null;
  }

  function buildLink() {
    // Try to extract posting ID from the page title or a hidden field
    const h1Text = document.querySelector("h1")?.textContent?.trim() || "";
    const idMatch = h1Text.match(/\b(\d{5,})\b/);
    if (idMatch) {
      return `https://scope.sciencecoop.ubc.ca/myAccount/co-op/postings.htm?postingId=${idMatch[1]}`;
    }
    const idEl = document.querySelector("[name*='postingId'], [id*='postingId']");
    if (idEl) {
      const id = idEl.value || idEl.textContent?.trim();
      if (id) return `https://scope.sciencecoop.ubc.ca/myAccount/co-op/postings.htm?postingId=${id}`;
    }
    return location.href;
  }

  // ── main ──────────────────────────────────────────────────────────────────

  const btn = createButton();
  document.body.appendChild(btn);

  btn.addEventListener("click", async () => {
    setState(btn, "loading");
    await new Promise((r) => setTimeout(r, 300));

    const jobTitle = parseJobTitle();
    const company = parseCompany();

    console.log("[Shortlist DEBUG Scope] jobTitle:", jobTitle, "| company:", company);

    if (!jobTitle) {
      console.error("[Shortlist] Scope: could not parse job title");
      setState(btn, "error", "❌ Parse failed");
      return;
    }
    if (!company) {
      console.error("[Shortlist] Scope: could not parse company name");
      setState(btn, "error", "❌ Parse failed");
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "SHORTLIST",
      payload: { jobTitle, company, date: getTodayDate(), link: buildLink() },
    });

    if (response.error === "NO_SPREADSHEET_ID") {
      setState(btn, "error", "❌ Set Sheet ID");
      return;
    }
    if (response.success) {
      setState(btn, "success");
    } else {
      console.error("[Shortlist] Sheets error:", response.error);
      setState(btn, "error");
    }
  });
})();
