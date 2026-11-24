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
 * @param {string} a
 * @param {string} b
 * @returns {number} Positive when a is newer, negative when b is newer, 0 if equal
 */
export function compareReleaseNames(a, b) {
    const x =
        String(a ?? '')
            .match(/\d+/g)
            ?.map(Number) ?? [];
    const y =
        String(b ?? '')
            .match(/\d+/g)
            ?.map(Number) ?? [];
    if (!x.length || !y.length) {
        const sa = String(a);
        const sb = String(b);
        return sa === sb ? 0 : sa > sb ? 1 : -1;
    }
    const len = Math.max(x.length, y.length);
    for (let i = 0; i < len; i++) {
        const p = x[i] ?? 0;
        const q = y[i] ?? 0;
        if (p !== q) {
            return p > q ? 1 : -1;
        }
    }
    return 0;
}

/**
 * @param {string} candidate
 * @param {string} current
 * @returns {boolean} True when candidate is newer than current
 */
export function isNewerRelease(candidate, current) {
    return compareReleaseNames(candidate, current) > 0;
}
