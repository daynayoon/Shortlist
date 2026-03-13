// scraper.js — job detail extraction
// Multi-strategy: site-specific selectors → heuristic regex → empty string.
// Never throws. Always returns all 6 keys.

function scrapeJobDetails() {
  const url = window.location.href;
  const host = window.location.hostname;

  let result = {
    jobTitle: "",
    company: "",
    salary: "",
    postedDate: "",
    deadline: "",
    url,
  };

  // ── Site-specific selectors ──────────────────────────────────

  if (host.includes("linkedin.com")) {
    result.jobTitle =
      text(".job-details-jobs-unified-top-card__job-title") ||
      text("h1.t-24");
    result.company =
      text(".job-details-jobs-unified-top-card__company-name") ||
      text(".topcard__org-name-link");
    result.salary =
      text(".compensation__salary") ||
      text("[class*='salary']");
    result.postedDate =
      parseRelativeDate(
        text(".job-details-jobs-unified-top-card__posted-date") ||
        text(".topcard__flavor--metadata span")
      );

  } else if (host.includes("indeed.com")) {
    result.jobTitle =
      text("[data-testid='jobsearch-JobInfoHeader-title'] span") ||
      text("h1.jobsearch-JobInfoHeader-title");
    result.company =
      text("[data-testid='inlineHeader-companyName'] a") ||
      text(".icl-u-lg-mr--sm");
    result.salary =
      text("[data-testid='attribute_snippet_testid']") ||
      text("#salaryInfoAndJobType span");
    result.postedDate =
      parseRelativeDate(text("[data-testid='myJobsStateDate']"));

  } else if (host.includes("greenhouse.io")) {
    result.jobTitle = text("h1.app-title") || text("h1");
    result.company = metaContent("og:site_name") || text(".company-name");
    result.postedDate = attr("time[datetime]", "datetime");

  } else if (host.includes("lever.co")) {
    result.jobTitle = text(".posting-headline h2") || text("h2");
    result.company = metaContent("og:site_name") || text(".main-header-logo img", "alt");
    result.postedDate = attr("time[datetime]", "datetime");

  } else if (host.includes("myworkdayjobs.com") || host.includes("workday.com")) {
    result.jobTitle =
      text("[data-automation-id='jobPostingHeader']") ||
      text("h1");
    result.company =
      text("[data-automation-id='company']") ||
      metaContent("og:site_name");
    result.salary =
      text("[data-automation-id='salary']") || "";
    result.postedDate =
      parseRelativeDate(text("[data-automation-id='postedOn']"));
    result.deadline =
      text("[data-automation-id='closingDate']") || "";
  }

  // ── Generic fallbacks for any site ──────────────────────────

  if (!result.jobTitle) result.jobTitle = text("h1") || document.title;
  if (!result.company) result.company = metaContent("og:site_name") || "";
  if (!result.salary) result.salary = salaryFromPage();
  if (!result.postedDate) result.postedDate = dateFromPage();
  if (!result.deadline) result.deadline = deadlineFromPage();

  return result;
}

// ── DOM helpers ──────────────────────────────────────────────

function text(selector, fallback = "") {
  return document.querySelector(selector)?.textContent?.trim() || fallback;
}

function attr(selector, attribute, fallback = "") {
  return document.querySelector(selector)?.getAttribute(attribute)?.trim() || fallback;
}

function metaContent(property, fallback = "") {
  return (
    document.querySelector(`meta[property="${property}"]`)?.content?.trim() ||
    document.querySelector(`meta[name="${property}"]`)?.content?.trim() ||
    fallback
  );
}

// ── Heuristic extractors ─────────────────────────────────────

function salaryFromPage() {
  const body = document.body.innerText;
  const match = body.match(
    /(?:£|US\$|\$|CAD\s?\$?|AUD\s?\$?)[\d,]+(?:\s?[-–]\s?(?:£|US\$|\$|CAD\s?\$?|AUD\s?\$?)?[\d,]+)?(?:\s?(?:per\s+(?:year|annum|month|hour)|\/(?:yr|mo|hr)))?/i
  );
  return match ? match[0].trim() : "";
}

function dateFromPage() {
  const body = document.body.innerText;
  const match = body.match(
    /posted\s+(?:(\d+)\s+(day|week|month)s?\s+ago|today|just now)/i
  );
  if (!match) return "";
  return parseRelativeDate(match[0]);
}

function deadlineFromPage() {
  const body = document.body.innerText;
  const match = body.match(
    /(?:apply\s+by|closing\s+date|application\s+deadline)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i
  );
  return match ? match[1].trim() : "";
}

// Converts "3 days ago" / "2 weeks ago" → YYYY-MM-DD
function parseRelativeDate(str) {
  if (!str) return "";
  const s = str.toLowerCase().trim();
  const now = new Date();

  if (s.includes("today") || s.includes("just now")) {
    return toISO(now);
  }

  const m = s.match(/(\d+)\s+(day|week|month)s?\s+ago/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (m[2] === "day") now.setDate(now.getDate() - n);
    else if (m[2] === "week") now.setDate(now.getDate() - n * 7);
    else if (m[2] === "month") now.setMonth(now.getMonth() - n);
    return toISO(now);
  }

  // Already a parseable date string?
  const parsed = new Date(str);
  if (!isNaN(parsed)) return toISO(parsed);

  return str; // return as-is if we can't parse
}

function toISO(date) {
  return date.toISOString().split("T")[0];
}
