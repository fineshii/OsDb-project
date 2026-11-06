/**
 * Preprocesses a single record / object according to the standard rules:
 * - normalise keys (trim, lower_case)
 * - trim strings
 * - lowercase emails
 * - strip phone formatting (retain digits and leading +)
 * - parse price / numeric fields
 * - add processed_at and processed_by
 *
 * @param {object} record
 * @param {string} workerName
 * @returns {object}
 */
export function preprocessRecord(record, workerName) {
  if (typeof record !== 'object' || record === null) {
    return record;
  }

  const cleaned = {};

  for (const [key, value] of Object.entries(record)) {
    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');

    if (typeof value === 'string') {
      const trimmed = value.trim();

      // Email field detection and normalization
      if (cleanKey.includes('email') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        cleaned[cleanKey] = trimmed.toLowerCase();
      }
      // Phone field detection: strip non-digits (preserving leading + if present)
      else if (
        cleanKey.includes('phone') ||
        cleanKey.includes('mobile') ||
        cleanKey.includes('tel')
      ) {
        const hasPlus = trimmed.startsWith('+');
        const digitsOnly = trimmed.replace(/\D/g, '');
        cleaned[cleanKey] = hasPlus ? `+${digitsOnly}` : digitsOnly;
      }
      // Price / currency field detection: parse to numeric
      else if (
        cleanKey.includes('price') ||
        cleanKey.includes('cost') ||
        cleanKey.includes('amount') ||
        cleanKey.includes('salary')
      ) {
        const numStr = trimmed.replace(/[^0-9.-]/g, '');
        const parsedNum = parseFloat(numStr);
        cleaned[cleanKey] = isNaN(parsedNum) ? trimmed : parsedNum;
      } else {
        // Plain string: keep trimmed (do NOT uppercase every other string field)
        cleaned[cleanKey] = trimmed;
      }
    } else if (typeof value === 'number') {
      cleaned[cleanKey] = value;
    } else if (Array.isArray(value)) {
      cleaned[cleanKey] = value.map((item) =>
        typeof item === 'object' && item !== null ? preprocessRecord(item, workerName) : item
      );
    } else if (typeof value === 'object' && value !== null) {
      cleaned[cleanKey] = preprocessRecord(value, workerName);
    } else {
      cleaned[cleanKey] = value;
    }
  }

  cleaned.processed_at = new Date().toISOString();
  cleaned.processed_by = workerName || 'worker';

  return cleaned;
}

/**
 * Main preprocess function. Accepts raw text content (JSON array/object or text lines).
 * @param {string} content
 * @param {string} workerName
 * @returns {object}
 */
export function preprocessData(content, workerName) {
  if (!content) {
    return { count: 0, rows: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // If not JSON, treat as lines of text
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const rows = lines.map((line, idx) => ({
      line_number: idx + 1,
      text: line.trim(),
      processed_at: new Date().toISOString(),
      processed_by: workerName || 'worker',
    }));
    return { count: rows.length, rows };
  }

  if (Array.isArray(parsed)) {
    const cleanedRows = parsed.map((row) => preprocessRecord(row, workerName));
    return { count: cleanedRows.length, rows: cleanedRows };
  } else if (typeof parsed === 'object' && parsed !== null) {
    const cleaned = preprocessRecord(parsed, workerName);
    return { count: 1, rows: [cleaned] };
  }

  return { count: 0, rows: [] };
}
