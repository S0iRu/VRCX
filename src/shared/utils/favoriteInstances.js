import { parseLocation } from './locationParser';

/**
 * Favorite group metadata for a user.
 *
 * @typedef {{ key: string; label: string; order: number }} FavoriteGroupInfo
 */

/**
 * @typedef {object} FriendEntry
 * @property {string} id
 * @property {string} [name]
 * @property {string} [state] 'online' | 'active' | 'offline'
 * @property {object} [ref] User ref ({ location, $location_at, travelingToLocation, ... })
 */

const UNKNOWN_GROUP_ORDER = Number.MAX_SAFE_INTEGER;

/**
 * @param {FriendEntry} friend
 * @returns {number}
 */
export function getJoinedAt(friend) {
    const at = getStayStart(friend);
    return at > 0 ? at : Date.now();
}

/**
 * Start time for the stay timer, using the same rule as the sidebar's FriendItem
 * (traveling -> $travelingToTime, otherwise $location_at). Reads the live user ref
 * when available because VRCX writes these timestamps asynchronously. A feed-DB
 * arrival time for the current location is preferred when it is earlier (restores
 * real stay times after an app restart).
 *
 * @param {FriendEntry & { live?: { ref?: object }; arrival?: { location: string; at: number } | null }} friend
 * @returns {number} Epoch ms, or 0 when unknown
 */
export function getStayStart(friend) {
    const ref = friend?.live?.ref ?? friend?.ref;
    if (!ref) return 0;
    if (ref.location === 'traveling') {
        return ref.$travelingToTime || 0;
    }
    let at = ref.$location_at || 0;
    const arrival = friend.arrival;
    if (arrival && arrival.location === ref.location && (!at || arrival.at < at)) {
        at = arrival.at;
    }
    return at;
}

/**
 * Sort members of one instance: instance owner first, then longest stay first.
 *
 * @param {FriendEntry[]} list
 * @param {string | null} ownerId
 * @returns {FriendEntry[]}
 */
export function sortInstanceMembers(list, ownerId) {
    return [...list].sort((a, b) => {
        if (ownerId) {
            if (a.id === ownerId && b.id !== ownerId) return -1;
            if (b.id === ownerId && a.id !== ownerId) return 1;
        }
        return getJoinedAt(a) - getJoinedAt(b);
    });
}

/**
 * Where to list a friend: a traveling friend is shown at their destination,
 * the same way the sidebar's Friends list does (with a spinner).
 *
 * @param {FriendEntry} friend
 * @returns {string}
 */
export function getDisplayLocation(friend) {
    const location = friend?.ref?.location ?? '';
    if (location === 'traveling') {
        return friend.ref.travelingToLocation || location;
    }
    return location;
}

/**
 * Group friends into "favorite friend instances" in the same manner as
 * VRC Social's Favorites page.
 *
 * - Only instances with at least one favorite are listed; non-favorite friends in those instances are reported as
 *   `others`.
 * - Order: lowest favorite group order -> more favorites -> earliest join.
 * - Traveling friends are listed at their destination.
 * - Favorites in a private world or offline are returned separately.
 *
 * @param {object} params
 * @param {FriendEntry[]} params.friends All friends
 * @param {(userId: string) => FavoriteGroupInfo | null} params.getFavoriteGroup
 * @returns {{
 *     instances: Array<{
 *         location: string;
 *         ownerId: string | null;
 *         favorites: FriendEntry[];
 *         others: FriendEntry[];
 *         groupOrder: number;
 *         earliestJoin: number;
 *     }>;
 *     privateByGroup: Array<{ key: string; label: string; order: number; friends: FriendEntry[] }>;
 *     offlineByGroup: Array<{ key: string; label: string; order: number; friends: FriendEntry[] }>;
 * }}
 */
export function buildFavoriteInstances({ friends, getFavoriteGroup }) {
    /** @type {Map<string, { location: string; favorites: FriendEntry[]; others: FriendEntry[] }>} */
    const byLocation = new Map();
    const privateGroups = new Map();
    const offlineGroups = new Map();

    const pushGrouped = (map, info, friend) => {
        const key = info?.key ?? '';
        if (!map.has(key)) {
            map.set(key, {
                key,
                label: info?.label ?? '',
                order: info?.order ?? UNKNOWN_GROUP_ORDER,
                friends: []
            });
        }
        map.get(key).friends.push(friend);
    };

    for (const friend of friends) {
        const favGroup = getFavoriteGroup(friend.id);
        const isFavorite = Boolean(favGroup);
        const isInGame = friend.state === 'online';
        const location = getDisplayLocation(friend);

        if (!isInGame) {
            if (isFavorite) {
                pushGrouped(offlineGroups, favGroup, friend);
            }
            continue;
        }

        const L = parseLocation(location);
        if (L.isPrivate || L.isOffline || L.isTraveling || !location) {
            if (isFavorite) pushGrouped(privateGroups, favGroup, friend);
            continue;
        }

        if (!byLocation.has(location)) {
            byLocation.set(location, { location, favorites: [], others: [] });
        }
        const bucket = byLocation.get(location);
        (isFavorite ? bucket.favorites : bucket.others).push(friend);
    }

    const instances = [];
    for (const bucket of byLocation.values()) {
        if (bucket.favorites.length === 0) continue;
        const L = parseLocation(bucket.location);
        const ownerId = L.userId ?? null;
        let groupOrder = UNKNOWN_GROUP_ORDER;
        let earliestJoin = Infinity;
        for (const f of bucket.favorites) {
            groupOrder = Math.min(groupOrder, getFavoriteGroup(f.id)?.order ?? UNKNOWN_GROUP_ORDER);
            earliestJoin = Math.min(earliestJoin, getJoinedAt(f));
        }
        instances.push({
            location: bucket.location,
            ownerId,
            favorites: sortInstanceMembers(bucket.favorites, ownerId),
            others: sortInstanceMembers(bucket.others, ownerId),
            groupOrder,
            earliestJoin
        });
    }
    instances.sort(
        (a, b) =>
            a.groupOrder - b.groupOrder || b.favorites.length - a.favorites.length || a.earliestJoin - b.earliestJoin
    );

    const sortGroups = (map) =>
        Array.from(map.values())
            .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
            .map((g) => ({
                ...g,
                friends: [...g.friends].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
            }));

    return {
        instances,
        privateByGroup: sortGroups(privateGroups),
        offlineByGroup: sortGroups(offlineGroups)
    };
}

/**
 * Group the user's group instances by group and attach friends present there.
 * Sort: groups by friend count desc then name; instances by friend count desc
 * then user count desc.
 *
 * @param {object} params
 * @param {{ group: object; instance: object }[]} params.groupInstances
 * @param {FriendEntry[]} params.friends
 * @param {(userId: string) => boolean} params.isFavorite
 * @returns {{
 *     groupId: string;
 *     group: object;
 *     friendCount: number;
 *     instances: { instance: object; location: string; favorites: FriendEntry[]; others: FriendEntry[] }[];
 * }[]}
 */
export function buildGroupInstanceSections({ groupInstances, friends, isFavorite }) {
    const friendsByLocation = new Map();
    for (const friend of friends) {
        if (friend.state !== 'online') continue;
        const loc = getDisplayLocation(friend);
        if (!loc) continue;
        if (!friendsByLocation.has(loc)) friendsByLocation.set(loc, []);
        friendsByLocation.get(loc).push(friend);
    }

    const sections = new Map();
    for (const entry of groupInstances) {
        const group = entry?.group;
        const instance = entry?.instance;
        if (!group || !instance) continue;
        if (instance.active === false) continue;
        if (instance.closedAt && Date.parse(instance.closedAt) < Date.now()) continue;
        const groupId = group.id ?? group.groupId ?? instance.ownerId ?? '';
        const location = instance.location ?? instance.id ?? '';
        if (!sections.has(groupId)) {
            sections.set(groupId, { groupId, group, friendCount: 0, instances: [] });
        }
        const present = friendsByLocation.get(location) ?? [];
        const ownerId = parseLocation(location).userId ?? null;
        const favorites = sortInstanceMembers(
            present.filter((f) => isFavorite(f.id)),
            ownerId
        );
        const others = sortInstanceMembers(
            present.filter((f) => !isFavorite(f.id)),
            ownerId
        );
        const section = sections.get(groupId);
        section.friendCount += present.length;
        section.instances.push({ instance, location, favorites, others });
    }

    const result = Array.from(sections.values());
    for (const section of result) {
        section.instances.sort(
            (a, b) =>
                b.favorites.length + b.others.length - (a.favorites.length + a.others.length) ||
                (b.instance.userCount ?? b.instance.n_users ?? 0) - (a.instance.userCount ?? a.instance.n_users ?? 0)
        );
    }
    result.sort(
        (a, b) => b.friendCount - a.friendCount || String(a.group.name ?? '').localeCompare(String(b.group.name ?? ''))
    );
    return result;
}
