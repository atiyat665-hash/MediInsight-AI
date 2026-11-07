/**
 * trendStore.js
 *
 * Persists analyzed reports to localStorage so we can show per-biomarker
 * trend lines when the user has uploaded more than one report over time.
 *
 * Storage schema (key: "mediinsight_reports"):
 * [
 *   {
 *     id:         string  (uuid-ish timestamp)
 *     savedAt:    string  (ISO date)
 *     reportType: string
 *     testDate:   string | null
 *     biomarkers: [{ test, abbreviation, measuredValue, numericValue, unit,
 *                    referenceRange, status, isAbnormal }]
 *   },
 *   ...
 * ]
 *
 * We keep at most MAX_REPORTS entries (oldest dropped first).
 */

const STORAGE_KEY  = 'mediinsight_reports'
const MAX_REPORTS  = 20

/** Parse a value string to a float, handling common formats like "3.4 g/dL" */
export function parseNumeric(value) {
  if (value == null) return null
  const s = String(value).trim()
  // Extract the first number (integer or decimal, possibly negative)
  const match = s.match(/^-?\d+(\.\d+)?/)
  if (!match) return null
  const n = parseFloat(match[0])
  return isNaN(n) ? null : n
}

/** Load all saved reports from localStorage */
export function loadReports() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

/** Save a new analysis result into the history */
export function saveReport(analysis) {
  try {
    const reports = loadReports()

    const entry = {
      id:         `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      savedAt:    new Date().toISOString(),
      reportType: analysis.reportType || 'Unknown',
      testDate:   analysis.testDate   || null,
      biomarkers: (analysis.biomarkers || analysis.findings || []).map(b => ({
        test:          b.test,
        abbreviation:  b.abbreviation  || null,
        measuredValue: b.measuredValue || null,
        numericValue:  parseNumeric(b.measuredValue),
        unit:          b.unit          || null,
        referenceRange:b.referenceRange|| null,
        status:        b.status        || 'not_available',
        isAbnormal:    b.isAbnormal    || false,
      })),
    }

    // Append and trim to max
    const updated = [...reports, entry].slice(-MAX_REPORTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    return entry.id
  } catch {
    return null
  }
}

/**
 * Returns trend data for a specific test name across all saved reports.
 * Matches by exact test name or abbreviation (case-insensitive).
 *
 * Returns:
 * [{ date: string, value: number, status: string, reportType: string }]
 * sorted oldest → newest, only entries where numericValue is available.
 */
export function getTrendForTest(testName, abbreviation) {
  const reports = loadReports()
  const nameLower = testName.toLowerCase()
  const abbrLower = abbreviation?.toLowerCase() || ''

  const points = []
  for (const report of reports) {
    for (const b of report.biomarkers) {
      const tl = b.test?.toLowerCase() || ''
      const al = b.abbreviation?.toLowerCase() || ''
      if (tl === nameLower || (abbrLower && al === abbrLower)) {
        if (b.numericValue !== null) {
          points.push({
            date:       report.testDate || report.savedAt.slice(0, 10),
            savedAt:    report.savedAt,
            value:      b.numericValue,
            status:     b.status,
            unit:       b.unit,
            reportType: report.reportType,
          })
        }
        break
      }
    }
  }

  // Sort oldest first
  return points.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt))
}

/** Clear all saved report history */
export function clearReports() {
  localStorage.removeItem(STORAGE_KEY)
}
