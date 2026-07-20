/**
 * @audebase/event-bus - Wildcard subject matching
 *
 * '*' matches exactly one dot-separated segment.
 *   'order.*'       matches 'order.created', 'order.updated'
 *   'order.*'       does NOT match 'order' or 'order.created.confirmed'
 *   '*'             matches everything (single segment)
 *   'order.created' matches exactly 'order.created' (no wildcard)
 */

/** Match a subject against a pattern that may contain '*' wildcard segments. */
export function matchSubject(pattern: string, subject: string): boolean {
  if (pattern === '*') {
    return true
  }

  const patternParts = pattern.split('.')
  const subjectParts = subject.split('.')

  if (patternParts.length !== subjectParts.length) {
    return false
  }

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]
    if (p === '*') {
      continue
    }
    if (p !== subjectParts[i]) {
      return false
    }
  }

  return true
}
