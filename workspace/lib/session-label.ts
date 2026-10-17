/**
 * The sidebar's sign-in label. While the session check is in flight nothing is known yet, so the
 * label stays neutral instead of reading as signed out on every full page load.
 */
export function sessionLabel({ canWrite, isLoading }: { canWrite: boolean; isLoading: boolean }): string {
  if (isLoading) return 'Checking sign-in';
  return canWrite ? 'Owner' : 'Read only';
}
