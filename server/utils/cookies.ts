export function readCookie(header: string | undefined, name: string): string | null {
  const prefix = `${name}=`;
  for (const item of header?.split(';') ?? []) {
    const cookie = item.trim();
    if (cookie.startsWith(prefix)) {
      return cookie.slice(prefix.length) || null;
    }
  }

  return null;
}
