// scraper.js — job detail extraction
// Strategy: JSON-LD → site-specific selectors → heuristic regex → empty string.
// Never throws. Always returns all keys.

function scrapeJobDetails() {
  const url = window.location.href;
  const host = window.location.hostname;
  const ld = parseJsonLd(); // JSON-LD available on ~10 platforms

  let result = {
    jobTitle: "",
    company: "",
    location: "",
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
    result.location =
      text(".job-details-jobs-unified-top-card__bullet") ||
      text(".topcard__flavor--bullet");
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
    result.location =
      text("[data-testid='job-location']") ||
      text(".icl-u-xs-mt--xs.icl-u-textColor--secondary");
    result.salary =
      text("[data-testid='attribute_snippet_testid']") ||
      text("#salaryInfoAndJobType span");
    result.postedDate =
      parseRelativeDate(text("[data-testid='myJobsStateDate']"));

  } else if (host.includes("greenhouse.io")) {
    result.jobTitle =
      text("h1.app-title") ||
      text("h1") ||
      parseGreenhouseTitle(metaContent("og:title") || document.title);
    result.company =
      parseCompanyFromTitle(document.title) ||
      attr("img[alt*='Logo']", "alt").replace(/\s*Logo\s*$/i, "").trim() ||
      metaContent("og:site_name");
    result.location = text(".job__location") || text(".location");
    result.postedDate = attr("time[datetime]", "datetime");

  } else if (host.includes("lever.co")) {
    result.jobTitle = text(".posting-headline h2") || text("h2");
    result.company =
      parseCompanyFromTitle(document.title) ||
      metaContent("og:site_name") ||
      attr(".main-header-logo img", "alt");
    result.location =
      text(".posting-categories .location") ||
      text(".sort-by-location");
    result.postedDate = attr("time[datetime]", "datetime");

  } else if (host.includes("icims.com")) {
    // Title pattern: "Job Title in Location, Province | Careers at Office Name"
    const iCIMSTitleMatch = document.title.match(/^(.+?)\s+in\s+(.+?)\s*[|–]/);
    result.jobTitle = iCIMSTitleMatch?.[1]?.trim() || text("h1");
    result.location = iCIMSTitleMatch?.[2]?.trim() || "";
    result.company =
      document.querySelector('[class*="company"]')?.textContent?.trim() ||
      metaContent("og:site_name") ||
      host.replace(/^careers[-.]/, "").replace(/\.icims\.com$/, "");
    result.postedDate = parseRelativeDate(text(".iCIMS_PostedDate, [class*='posteddate']"));

  } else if (host.includes("sciencecoop.ubc.ca") || host.includes("engineering.coop.ubc.ca") || isOrbisPortal()) {
    // Orbis Career / Co-op Portal (many Canadian universities)
    result.jobTitle = labelValue("Job Title") || text("h1");
    result.company  = labelValue("Organization") || labelValue("Employer") || labelValue("Company");
    result.location = labelValue("Job Location") || labelValue("Location") || labelValue("Work Location");
    result.salary   = labelValue("Salary") || salaryFromPage();
    result.postedDate = parseRelativeDate(labelValue("Posting Date") || labelValue("Date Posted"));
    result.deadline   = labelValue("Application Deadline") || labelValue("Deadline") || deadlineFromPage();

  } else if (host.includes("myworkdayjobs.com") || host.includes("workday.com")) {
    result.jobTitle =
      text("[data-automation-id='jobPostingHeader']") || text("h1");
    result.company =
      text("[data-automation-id='company']") || metaContent("og:site_name");
    result.location =
      text("[data-automation-id='locations']") ||
      text("[data-automation-id='location']");
    result.salary   = text("[data-automation-id='salary']") || "";
    result.postedDate = parseRelativeDate(text("[data-automation-id='postedOn']"));
    result.deadline   = text("[data-automation-id='closingDate']") || "";

  } else if (host.includes("ashbyhq.com")) {
    // JSON-LD preferred; falls back to DOM
    result.jobTitle = ld.title || text("h1") || metaContent("og:title");
    result.company  = ld.company || metaContent("og:site_name");
    result.location = ld.location || text("[data-testid='location']");
    result.salary   = ld.salary;
    result.postedDate = ld.postedDate || attr("time[datetime]", "datetime");

  } else if (host.includes("smartrecruiters.com")) {
    // Uses schema.org microdata (meta content attributes)
    result.jobTitle =
      metaAttr("[itemprop='title']", "content") ||
      text("h1[itemprop='title']") || text("h1");
    result.company =
      metaAttr("[itemprop='hiringOrganization'] [itemprop='name']", "content") ||
      text("[itemprop='hiringOrganization'] [itemprop='name']") ||
      metaContent("og:site_name");
    result.location =
      metaAttr("[itemprop='addressLocality']", "content") ||
      text("[itemprop='addressLocality']");
    result.postedDate =
      metaAttr("[itemprop='datePosted']", "content") ||
      attr("[itemprop='datePosted']", "content");

  } else if (host.includes("jobvite.com")) {
    result.jobTitle = ld.title || text("h1.jv-header") || text("h1");
    result.company  = ld.company || metaContent("og:site_name") ||
      host.replace(/^careers\./, "").replace(/\.jobvite\.com$/, "");
    result.location = ld.location || text(".jv-job-detail-location") ||
      text(".jv-job-detail-meta li:first-child");
    result.salary   = ld.salary;
    result.postedDate = ld.postedDate;

  } else if (host.includes("bamboohr.com")) {
    // CSS classes are hashed (MUI Fabric) — use h1 and subdomain
    result.jobTitle = text("h1") || text("h2");
    result.company  = metaContent("og:site_name") ||
      host.replace(/\.bamboohr\.com$/, "");
    result.location = text("[data-fabric-component='Text']") ||
      text("[class*='location']");

  } else if (host.includes("teamtailor.com")) {
    result.jobTitle = ld.title || text("h1");
    result.company  = ld.company || metaContent("og:site_name");
    result.location = ld.location || text("[data-testid='job-location']");
    result.salary   = ld.salary;
    result.postedDate = ld.postedDate || attr("time[datetime]", "datetime");

  } else if (host.includes("jazzhr.com") || host.includes("applytojob.com")) {
    result.jobTitle = ld.title || text("h1.job_title") || text("h1");
    result.company  = ld.company || text("h2.job_company") || metaContent("og:site_name");
    result.location = ld.location || text("h3.job_meta");
    result.salary   = ld.salary;
    result.postedDate = ld.postedDate;

  } else if (host.includes("wellfound.com")) {
    // og:title format: "Job Title at Company • City"
    const ogTitle = metaContent("og:title");
    const wfMatch = ogTitle.match(/^(.+?) at (.+?) [•·] (.+)$/);
    result.jobTitle = ld.title || wfMatch?.[1] || text("h1");
    result.company  = ld.company || wfMatch?.[2] || metaContent("og:site_name");
    result.location = ld.location || wfMatch?.[3] || "";
    result.salary   = ld.salary;
    result.postedDate = ld.postedDate;

  } else if (host.includes("rippling-ats.com") || host.includes("ats.rippling.com")) {
    // No JSON-LD, no stable selectors — derive company from URL
    result.jobTitle = text("h2") || text("h1") || metaContent("og:title");
    result.company  = metaContent("og:site_name") ||
      window.location.pathname.split("/").filter(Boolean)[0] || "";
    result.location = text("li:nth-child(2)") || "";

  } else if (host.includes("workable.com")) {
    result.jobTitle = ld.title || text("[data-ui='job-title']") || text("h1");
    result.company  = ld.company || text("[data-ui='company-name']") || metaContent("og:site_name");
    result.location = ld.location || text("[data-ui='job-location']") || text(".whr-location");
    result.salary   = ld.salary;
    result.postedDate = ld.postedDate || parseRelativeDate(text("[data-ui='posted-date']"));

  } else if (host.includes("breezy.hr")) {
    result.jobTitle = ld.title || text("h1.title") || text("h1");
    result.company  = ld.company || text(".company-name") || metaContent("og:site_name");
    result.location = ld.location || text("ul.meta li.location span") || text(".location");
    result.salary   = ld.salary || text("ul.meta li.salary-range");
    result.postedDate = ld.postedDate;

  } else if (host.includes("pinpointhq.com")) {
    result.jobTitle = ld.title || text("h1.external-panel__title") || text("h1");
    result.company  = ld.company || metaContent("og:site_name");
    result.location = ld.location || dtValue("Location") || text("[class*='location']");
    result.salary   = ld.salary || dtValue("Compensation");
    result.postedDate = ld.postedDate || attr("time[datetime]", "datetime");

  } else if (host.includes("recruitee.com")) {
    result.jobTitle = ld.title || text("h1");
    result.company  = ld.company || metaContent("og:site_name");
    result.location = ld.location || text("[data-testid*='location']") || text("[class*='location']");
    result.salary   = ld.salary || text("[class*='salary'], [class*='compensation']");
    result.postedDate = ld.postedDate;

  } else if (host.includes("careerpuck.com")) {
    result.jobTitle = text("h1") || metaContent("og:title");
    result.company  = metaContent("og:site_name") || text("[class*='company']");
    result.location = text("[class*='location']");

  } else if (host.includes("trinethire.com")) {
    result.jobTitle = text("h1") || metaContent("og:title");
    result.company  = metaContent("og:site_name") || text("[class*='company']");
    result.location = text("[class*='location']");

  } else if (host.includes("ultipro") || host.includes("ultipro.ca") || host.includes("ukg.com")) {
    result.jobTitle = text("[data-automation='title']") || text("h1");
    result.company  = metaContent("og:site_name") || text("[class*='company']");
    result.location = text("[data-automation='location']") || text("[class*='location']");

  } else if (host.includes("paylocity.com")) {
    result.jobTitle = ld.title || text("main h1") || text("h1");
    result.company  = ld.company || metaContent("og:site_name");
    result.location = ld.location || text("[aria-label*='location']") || text("[class*='location']");
    result.salary   = ld.salary;
    result.postedDate = ld.postedDate;

  } else if (host.includes("keka.com")) {
    result.jobTitle = text("h1") || metaContent("og:title");
    result.company  = metaContent("og:site_name") || text("[class*='company']");
    result.location = text("[class*='location']");

  } else if (host.includes("oraclecloud.com")) {
    // Oracle Recruiting Cloud — Knockout.js, uses data-qa attributes
    result.jobTitle = text("[data-qa='requisitionTitle']") || text("h1");
    result.company  = text("[data-qa='company']") || metaContent("og:site_name");
    result.location = text("[data-qa='location']") || text("[data-bind*='location'] span");
    result.postedDate = parseRelativeDate(text("[data-qa='postedDate']"));
  }

  // ── Generic fallbacks for any site ──────────────────────────

  if (!result.jobTitle) result.jobTitle = ld.title || text("h1") || document.title;
  if (!result.company)  result.company  = ld.company || parseCompanyFromTitle(document.title) || metaContent("og:site_name") || "";
  if (!result.location) result.location = ld.location || text("[data-testid*='location']") || "";
  if (!result.salary)   result.salary   = ld.salary || salaryFromPage();
  if (!result.postedDate) result.postedDate = ld.postedDate || dateFromPage();
  if (!result.deadline)   result.deadline   = deadlineFromPage();

  return result;
}

// ── JSON-LD helper ────────────────────────────────────────────

// Parses the first schema.org JobPosting JSON-LD block on the page.
// Returns a normalised object with: title, company, location, salary, postedDate.
function parseJsonLd() {
  const empty = { title: "", company: "", location: "", salary: "", postedDate: "" };
  try {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const s of scripts) {
      let data;
      try { data = JSON.parse(s.textContent); } catch { continue; }
      // Handle arrays or @graph wrappers
      const items = Array.isArray(data) ? data : (data["@graph"] ?? [data]);
      const job = items.find(
        (item) => item["@type"] === "JobPosting" || item["@type"]?.includes?.("JobPosting")
      );
      if (!job) continue;

      const title    = job.title || job.name || "";
      const company  = job.hiringOrganization?.name || "";
      const location = formatJsonLdLocation(job.jobLocation) || job.jobLocation?.address?.addressLocality || "";
      const salary   = formatJsonLdSalary(job.baseSalary) || "";
      const postedDate = job.datePosted ? toISO(new Date(job.datePosted)) : "";

      return { title, company, location, salary, postedDate };
    }
  } catch { /* never throw */ }
  return empty;
}

function formatJsonLdLocation(loc) {
  if (!loc) return "";
  const l = Array.isArray(loc) ? loc[0] : loc;
  const addr = l?.address;
  if (!addr) return l?.name || "";
  const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
  return parts.join(", ");
}

function formatJsonLdSalary(base) {
  if (!base) return "";
  const val = base.value;
  if (!val) return "";
  const currency = base.currency || "";
  const symbol = currency === "CAD" ? "CA$" : currency === "GBP" ? "£" : "$";
  const unit = val.unitText ? `/${val.unitText.toLowerCase().replace("year","yr").replace("month","mo").replace("hour","hr")}` : "";
  if (val.minValue != null && val.maxValue != null) {
    return `${symbol}${val.minValue.toLocaleString()}–${symbol}${val.maxValue.toLocaleString()}${unit}`;
  }
  if (val.value != null) return `${symbol}${val.value.toLocaleString()}${unit}`;
  return "";
}

// ── DOM helpers ──────────────────────────────────────────────

// Detects Orbis Career/Co-op Portal by footer text or URL path
function isOrbisPortal() {
  const footer = document.body?.innerText ?? "";
  if (footer.includes("Orbis Career") || footer.includes("Co-op Portal Professional")) return true;
  if (window.location.pathname.includes("/myAccount/co-op/")) return true;
  return false;
}

// Finds a <td>/<th> matching label text and returns the next <td>'s text
function labelValue(label) {
  const labelLower = label.toLowerCase();
  for (const cell of document.querySelectorAll("td, th")) {
    const cellText = cell.textContent?.trim().replace(/:$/, "").toLowerCase();
    if (cellText === labelLower) {
      const next = cell.nextElementSibling;
      if (next?.tagName === "TD") return next.textContent?.trim() || "";
      const row = cell.closest("tr");
      if (row) {
        const tds = [...row.querySelectorAll("td")];
        const idx = tds.indexOf(cell);
        if (idx >= 0 && tds[idx + 1]) return tds[idx + 1].textContent?.trim() || "";
      }
    }
  }
  return "";
}

// Finds a <dd> following a <dt> whose text matches label — for Pinpoint and similar
function dtValue(label) {
  const labelLower = label.toLowerCase();
  for (const dt of document.querySelectorAll("dt")) {
    if (dt.textContent?.trim().toLowerCase().includes(labelLower)) {
      return dt.nextElementSibling?.textContent?.trim() || "";
    }
  }
  return "";
}

function text(selector, fallback = "") {
  return document.querySelector(selector)?.textContent?.trim() || fallback;
}

function attr(selector, attribute, fallback = "") {
  return document.querySelector(selector)?.getAttribute(attribute)?.trim() || fallback;
}

// Gets the `content` attribute from a meta/microdata element
function metaAttr(selector, attribute = "content", fallback = "") {
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
    /(?:£|US\$|\$|CAD\s?\$?|AUD\s?\$?)[\d,]+(?:\.\d+)?(?:\s?[-–]\s?(?:£|US\$|\$|CAD\s?\$?|AUD\s?\$?)?[\d,]+(?:\.\d+)?)?(?:\s?(?:per\s+(?:year|annum|month|hour|week)|\/(?:yr|mo|hr|wk)))?/i
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

  if (s.includes("today") || s.includes("just now")) return toISO(now);

  const m = s.match(/(\d+)\s+(day|week|month)s?\s+ago/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (m[2] === "day")   now.setDate(now.getDate() - n);
    else if (m[2] === "week")  now.setDate(now.getDate() - n * 7);
    else if (m[2] === "month") now.setMonth(now.getMonth() - n);
    return toISO(now);
  }

  const parsed = new Date(str);
  if (!isNaN(parsed)) return toISO(parsed);
  return str;
}

function toISO(date) {
  return date.toISOString().split("T")[0];
}

// "Job Application for TITLE at COMPANY" → TITLE
function parseGreenhouseTitle(str) {
  if (!str) return "";
  const m = str.match(/^Job Application for (.+?) at .+$/i);
  return m ? m[1].trim() : "";
}

// Extract company from Greenhouse page title pattern only
function parseCompanyFromTitle(str) {
  if (!str) return "";
  const m = str.match(/^Job Application for .+? at (.+)$/i);
  return m ? m[1].trim() : "";
}
