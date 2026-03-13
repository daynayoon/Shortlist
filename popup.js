// popup.js — popup logic
// 1. On open: scrape the active tab → pre-fill fields
// 2. On submit: send to background → show toast

const fields = {
  jobTitle:   document.getElementById("job-title-input"),
  company:    document.getElementById("company-input"),
  location:   document.getElementById("location-input"),
  salary:     document.getElementById("salary-input"),
  postedDate: document.getElementById("posted-input"),
  deadline:   document.getElementById("deadline-input"),
};

const btn        = document.getElementById("shortlist-btn");
const status     = document.getElementById("status");
const openSheet  = document.getElementById("open-sheet");

// ── On popup open: scrape active tab ─────────────────────────

async function init() {
  document.body.classList.add("loading");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject content scripts on-demand for sites not in manifest matches
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["scraper.js", "content.js"],
      });
    } catch {
      // Scripts already injected — that's fine
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: "scrape" });

    if (response?.ok && response.data) {
      const d = response.data;
      fields.jobTitle.value   = d.jobTitle   ?? "";
      fields.company.value    = d.company    ?? "";
      fields.location.value   = d.location   ?? "";
      fields.salary.value     = d.salary     ?? "";
      fields.postedDate.value = d.postedDate ?? "";
      fields.deadline.value   = d.deadline   ?? "";
    }
  } catch (err) {
    setStatus("Could not scrape page — fill in manually.", "error");
  } finally {
    document.body.classList.remove("loading");
  }
}

// ── Submit ────────────────────────────────────────────────────

btn.addEventListener("click", async () => {
  btn.disabled = true;
  setStatus("");

  const data = {
    jobTitle:   fields.jobTitle.value.trim(),
    company:    fields.company.value.trim(),
    location:   fields.location.value.trim(),
    salary:     fields.salary.value.trim(),
    postedDate: fields.postedDate.value.trim(),
    deadline:   fields.deadline.value.trim(),
    url:        await getActiveTabUrl(),
  };

  if (!data.jobTitle) {
    setStatus("Job title is required.", "error");
    btn.disabled = false;
    return;
  }

  try {
    const res = await chrome.runtime.sendMessage({ action: "shortlist", data });
    if (res?.ok) {
      setStatus("✓ Added to Shortlist!", "success");
      btn.textContent = "Shortlisted ✓";
    } else {
      throw new Error(res?.error ?? "Unknown error");
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
    btn.disabled = false;
  }
});

// ── Open sheet ────────────────────────────────────────────────

openSheet.addEventListener("click", () => {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/edit`;
  chrome.tabs.create({ url });
});

// ── Helpers ───────────────────────────────────────────────────

function setStatus(msg, type = "") {
  status.textContent = msg;
  status.className = type;
}

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? "";
}

// ── Boot ──────────────────────────────────────────────────────

init();
