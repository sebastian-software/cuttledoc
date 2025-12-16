/**
 * Get the correct asset path including the base URL
 * This is needed for static assets like images that are referenced in JSX
 */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  // Remove leading slash from path if base has trailing slash
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `${base}${cleanPath}`
}

