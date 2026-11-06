/**
 * Tokenises text, computes term frequencies (TF), and drops tokens shorter than 2 chars.
 * @param {string} content
 * @returns {{ terms: Record<string, number>, totalTokens: number }}
 */
export function indexFile(content) {
  if (!content || typeof content !== 'string') {
    return { terms: {}, totalTokens: 0 };
  }

  // Lowercase and split on non-alphanumerics
  const rawTokens = content.toLowerCase().split(/[^a-z0-9]+/);
  const terms = {};
  let totalTokens = 0;

  for (const token of rawTokens) {
    // Drop tokens shorter than 2 characters
    if (token.length >= 2) {
      terms[token] = (terms[token] || 0) + 1;
      totalTokens++;
    }
  }

  return {
    terms,
    totalTokens,
  };
}
