// Settings specific to the S0iRu/VRCX fork build.
//
// The fork is installed side by side with the official VRCX and shares its data
// directory (%APPDATA%\VRCX) and config DB. To keep both updaters independent the
// fork reads releases from its own GitHub repository and stores updater state under
// its own config keys.

export const FORK_BUILD = true;

export const FORK_REPO = 'S0iRu/VRCX';

export const FORK_BRANCH = 'Fork';

export const FORK_BRANCH_INFO = {
    name: FORK_BRANCH,
    urlReleases: `https://api.github.com/repos/${FORK_REPO}/releases`,
    urlLatest: `https://api.github.com/repos/${FORK_REPO}/releases/latest`
};

/**
 * Compare release names such as "VRCX 2026.11.14.2" numerically
 * (plain string comparison breaks at "...14.10" vs "...14.9").
 *
 * @param {string} candidate
 * @param {string} current
 * @returns {boolean} True when candidate is newer than current
 */
export function isNewerRelease(candidate, current) {
    const a =
        String(candidate ?? '')
            .match(/\d+/g)
            ?.map(Number) ?? [];
    const b =
        String(current ?? '')
            .match(/\d+/g)
            ?.map(Number) ?? [];
    if (!a.length || !b.length) {
        return String(candidate) > String(current);
    }
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        if (x !== y) {
            return x > y;
        }
    }
    return false;
}
