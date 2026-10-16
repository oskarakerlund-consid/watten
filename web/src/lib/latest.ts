/**
 * Tracks overlapping async calls so that only the most recently started one applies its result.
 * Call the returned function when a call starts; it returns a check that tells whether that call is still the latest.
 */
export function trackLatest(): () => () => boolean {
  let latest = 0;
  return () => {
    const call = ++latest;
    return () => call === latest;
  };
}
