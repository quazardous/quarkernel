/**
 * Wildcard pattern matching for event names
 *
 * Supports:
 * - * (single segment wildcard): matches any single segment
 * - ** (multi-segment wildcard): matches any number of segments
 * - Prefix patterns: user:* matches user:login, user:logout
 * - Suffix patterns: *:created matches user:created, post:created
 *
 * Uses RegExp compilation with LRU caching for performance.
 */

/**
 * Cache for compiled wildcard patterns
 * Maps pattern string to compiled RegExp
 */
const patternCache = new Map<string, RegExp>();

/**
 * Maximum cache size before eviction (LRU)
 */
const MAX_CACHE_SIZE = 100;

/**
 * Convert wildcard pattern to RegExp
 *
 * @param pattern - Wildcard pattern (e.g., "user:*", "**:created")
 * @param delimiter - Event name delimiter (default: ":")
 * @returns Compiled RegExp that matches event names
 */
const patternToRegex = (pattern: string, delimiter: string = ':'): RegExp => {
  // Escape delimiter for regex
  const escapedDelimiter = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Handle special case: just "*" should match single segment (non-empty)
  // Handle special case: just "**" should match any path (including empty)
  if (pattern === '*') {
    return new RegExp(`^[^${escapedDelimiter}]+$`);
  }
  if (pattern === '**') {
    return new RegExp('^.*$');
  }

  // Replace ** with regex for multiple segments (including zero segments)
  // Replace * with regex for single segment (must be non-empty)
  const regexPattern = pattern
    .replace(/\*\*/g, '___DOUBLE_WILDCARD___')
    .replace(/\*/g, `[^${escapedDelimiter}]+`)
    .replace(/___DOUBLE_WILDCARD___/g, '.*');

  // Anchor to start and end
  return new RegExp(`^${regexPattern}$`);
};

/**
 * Check if a pattern contains wildcards
 *
 * @param pattern - Event name pattern
 * @returns true if pattern contains * or **
 */
export const hasWildcard = (pattern: string): boolean => {
  return pattern.includes('*');
};

/**
 * Get compiled RegExp for a wildcard pattern (with caching)
 *
 * @param pattern - Wildcard pattern
 * @param delimiter - Event name delimiter
 * @returns Compiled and cached RegExp
 */
export const getPatternRegex = (pattern: string, delimiter: string = ':'): RegExp => {
  const cacheKey = `${pattern}::${delimiter}`;

  // Check cache first
  let regex = patternCache.get(cacheKey);

  if (!regex) {
    // Compile and cache
    regex = patternToRegex(pattern, delimiter);

    // LRU eviction: if cache is full, remove oldest entry
    if (patternCache.size >= MAX_CACHE_SIZE) {
      const firstKey = patternCache.keys().next().value;
      if (firstKey !== undefined) {
        patternCache.delete(firstKey);
      }
    }

    patternCache.set(cacheKey, regex);
  }

  return regex;
};

/**
 * Test if an event name matches a wildcard pattern
 *
 * @param eventName - Event name to test
 * @param pattern - Wildcard pattern
 * @param delimiter - Event name delimiter
 * @returns true if event name matches pattern
 */
export const matchesPattern = (
  eventName: string,
  pattern: string,
  delimiter: string = ':'
): boolean => {
  // Exact match (no wildcard)
  if (!hasWildcard(pattern)) {
    return eventName === pattern;
  }

  // Wildcard match
  const regex = getPatternRegex(pattern, delimiter);
  return regex.test(eventName);
};

/**
 * Find all wildcard patterns that match an event name
 *
 * @param eventName - Event name to test
 * @param patterns - Array of patterns (may include wildcards)
 * @param delimiter - Event name delimiter
 * @returns Array of matching patterns
 */
export const findMatchingPatterns = (
  eventName: string,
  patterns: string[],
  delimiter: string = ':'
): string[] => {
  return patterns.filter(pattern => matchesPattern(eventName, pattern, delimiter));
};

/**
 * Clear the pattern cache
 * Useful for testing or when patterns change frequently
 */
export const clearPatternCache = (): void => {
  patternCache.clear();
};

/**
 * Get current cache size
 * Useful for monitoring and testing
 */
export const getCacheSize = (): number => {
  return patternCache.size;
};
