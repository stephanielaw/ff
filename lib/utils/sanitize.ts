import DOMPurify from "isomorphic-dompurify";

/**
 * Strip all HTML tags and script content from user input.
 * Uses isomorphic-dompurify so it works on both server and client.
 */
export function sanitizeText(input: string): string {
  if (!input) return "";
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

/**
 * Sanitize all string values in an object.
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key in result) {
    if (typeof result[key] === "string") {
      (result as Record<string, unknown>)[key] = sanitizeText(result[key] as string);
    }
  }
  return result;
}
