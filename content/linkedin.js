// content/linkedin.js — LinkedIn job detail / search-results side panel

(function () {
  if (document.getElementById("shortlist-btn")) return;

  const btn = createButton();
  document.body.appendChild(btn);

  btn.addEventListener("click", async () => {
    setState(btn, "loading");
    await new Promise((r) => setTimeout(r, 600));

    // === DEBUG: paste this output in the chat ===
    console.log("[Shortlist DEBUG] document.title:", document.title);
    console.log("[Shortlist DEBUG] h1 elements:", [...document.querySelectorAll("h1")].map(e => e.textContent.trim()));
    console.log("[Shortlist DEBUG] company links:", [...document.querySelectorAll("a[href*='/company/']")].slice(0, 5).map(e => e.textContent.trim()));
    const params = new URLSearchParams(location.search);
    const currentJobId = params.get("currentJobId");
    console.log("[Shortlist DEBUG] currentJobId:", currentJobId);
    // Find job card for this ID
    const card = currentJobId ? document.querySelector(
      `[data-job-id="${currentJobId}"], [data-occludable-job-id="${currentJobId}"], li[data-id="${currentJobId}"]`
    ) : null;
    console.log("[Shortlist DEBUG] job card found:", !!card, card?.className?.slice(0, 100));
    if (card) {
      console.log("[Shortlist DEBUG] card text:", card.textContent.trim().slice(0, 200));
    }
    // ============================================

    const jobTitle = parseJobTitle(currentJobId);
    const company = parseCompany(currentJobId);

    if (!jobTitle) {
      console.error("[Shortlist] LinkedIn: could not parse job title");
      setState(btn, "error", "❌ Parse failed");
      return;
    }
    if (!company) {
      console.error("[Shortlist] LinkedIn: could not parse company. jobTitle was:", jobTitle);
      setState(btn, "error", "❌ Parse failed");
      return;
    }

    const date = getTodayDate();
    const link = buildPermalink(currentJobId);

    const response = await chrome.runtime.sendMessage({
      type: "SHORTLIST",
      payload: { jobTitle, company, date, link },
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

  function parseFromTitle() {
    let title = document.title.trim();
    title = title.replace(/^\(\d+\)\s*/, "");           // strip "(3) "
    title = title.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim(); // strip "| LinkedIn"

    // Format: "Job Title | Company"  (most common on search-results)
    const parts = title.split(/\s*\|\s*/);
    if (parts.length >= 2) {
      return { jobTitle: parts[0].trim(), company: parts[1].trim() };
    }

    // Format: "Job Title at Company"
    let match = title.match(/^(.+?)\s+at\s+(.+)$/i);
    if (match) return { jobTitle: match[1].trim(), company: match[2].trim() };

    // Format: "Job Title - Company"
    match = title.match(/^(.+?)\s+-\s+(.+)$/);
    if (match) return { jobTitle: match[1].trim(), company: match[2].trim() };

    return null;
  }

  function parseJobTitle(currentJobId) {
    // 1. document.title  (works when LinkedIn updates it for the focused job)
    const fromTitle = parseFromTitle();
    if (fromTitle?.jobTitle) return fromTitle.jobTitle;

    // 2. Job card in the left-rail list (regular DOM, not shadow)
    if (currentJobId) {
      const card = document.querySelector(
        `[data-job-id="${currentJobId}"], [data-occludable-job-id="${currentJobId}"]`
      );
      if (card) {
        const titleEl = card.querySelector(
          "strong, .job-card-list__title, [class*='job-card-list__title'], [class*='title']"
        );
        const text = titleEl?.textContent?.trim();
        if (text) return text;
      }
    }

    // 3. DOM selectors (works on /jobs/view/ direct pages)
    const selectors = [
      ".job-details-jobs-unified-top-card__job-title h1",
      ".jobs-unified-top-card__job-title h1",
      "h1.t-24",
      "h1[class*='job-title']",
      "h1",
    ];
    for (const sel of selectors) {
      const text = document.querySelector(sel)?.textContent?.trim();
      if (text) return text;
    }
    return null;
  }

  function parseCompany(currentJobId) {
    // 1. document.title
    const fromTitle = parseFromTitle();
    if (fromTitle?.company) return fromTitle.company;

    // 2. Job card in the left-rail list
    if (currentJobId) {
      const card = document.querySelector(
        `[data-job-id="${currentJobId}"], [data-occludable-job-id="${currentJobId}"]`
      );
      if (card) {
        const compEl = card.querySelector(
          ".job-card-container__primary-description, [class*='company'], [class*='subtitle']"
        );
        const text = compEl?.textContent?.trim();
        if (text) return text;
      }
    }

    // 3. DOM selectors
    const selectors = [
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name a",
      "[class*='company-name'] a",
      "[class*='company-name']",
      ".topcard__org-name-link",
    ];
    for (const sel of selectors) {
      const text = document.querySelector(sel)?.textContent?.trim();
      if (text) return text;
    }

    // 4. Any /company/ link
    for (const link of document.querySelectorAll("a[href*='/company/']")) {
      const text = link.textContent.trim();
      if (text && text.length < 100) return text;
    }
    return null;
  }

  function buildPermalink(currentJobId) {
    if (location.pathname.startsWith("/jobs/view/")) return location.href;
    if (currentJobId) return `https://www.linkedin.com/jobs/view/${currentJobId}/`;
    return location.href;
  }

  function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function createButton() {
    const btn = document.createElement("button");
    btn.id = "shortlist-btn";
    btn.textContent = "📌 Shortlist";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "9999",
      padding: "12px 20px",
      fontSize: "14px",
      fontWeight: "600",
      background: "#b91c1c",
      color: "#f5f0e8",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(185,28,28,0.35)",
      letterSpacing: "0.01em",
    });
    return btn;
  }

  function setState(btn, state, customLabel) {
    const labels = {
      default: "📌 Shortlist",
      loading: "⏳ Saving…",
      success: "✅ Saved!",
      error: customLabel || "❌ Failed",
    };
    btn.textContent = labels[state] || labels.default;
    btn.disabled = state === "loading";
    if (state === "success") setTimeout(() => setState(btn, "default"), 2000);
    else if (state === "error") setTimeout(() => setState(btn, "default"), 3000);
  }
})();
