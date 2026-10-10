/** Path globs: `**` crosses directories, `*` stays inside one segment. Everything else is literal. */
export function globMatches(glob: string, path: string): boolean {
  const pattern = glob
    .replace(/^\.\//, '')
    .split(/(\*\*\/|\*\*|\*)/)
    .map(part => (part === '**/' ? '(?:.*/)?' : part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${pattern}$`).test(path.replace(/^\.\//, ''));
}
