import {
    buildFavoriteInstances,
    buildGroupInstanceSections,
    getStayStart,
    sortInstanceMembers
} from '../favoriteInstances';

const LOC_A = 'wrld_aaa:12345~region(jp)';
const LOC_B = 'wrld_bbb:67890~friends(usr_owner)~region(us)';

function friend(id, location, joinedAt, state = 'online') {
    return { id, name: id, state, ref: { location, $location_at: joinedAt } };
}

const groups = {
    fav1: { key: 'friend:group_0', label: 'Group 1', order: 0 },
    fav2: { key: 'friend:group_1', label: 'Group 2', order: 1 },
    fav3: { key: 'friend:group_1', label: 'Group 2', order: 1 },
    usr_owner: { key: 'friend:group_1', label: 'Group 2', order: 1 },
    favOff: { key: 'friend:group_2', label: 'Group 3', order: 2 },
    favPriv: { key: 'friend:group_0', label: 'Group 1', order: 0 },
    favTravel: { key: 'friend:group_0', label: 'Group 1', order: 0 }
};
const getFavoriteGroup = (id) => groups[id] ?? null;

describe('buildFavoriteInstances', () => {
    const result = buildFavoriteInstances({
        friends: [
            friend('fav2', LOC_B, 300),
            friend('usr_owner', LOC_B, 500),
            friend('other1', LOC_B, 100),
            friend('fav1', LOC_A, 200),
            friend('other2', 'wrld_ccc:1', 100),
            friend('favPriv', 'private', 100),
            {
                ...friend('favTravel', 'traveling', 100),
                ref: { location: 'traveling', travelingToLocation: LOC_A, $location_at: 100 }
            },
            friend('favOff', 'offline', 0, 'offline')
        ],
        getFavoriteGroup
    });

    test('only instances with favorites, ordered by favorite group', () => {
        expect(result.instances.map((i) => i.location)).toEqual([LOC_A, LOC_B]);
    });

    test('owner first then longest stay; others separated', () => {
        const b = result.instances[1];
        expect(b.favorites.map((f) => f.id)).toEqual(['usr_owner', 'fav2']);
        expect(b.others.map((f) => f.id)).toEqual(['other1']);
    });

    test('traveling favorites are listed at their destination', () => {
        expect(result.instances[0].favorites.map((f) => f.id)).toContain('favTravel');
    });

    test('private and offline favorites are split out', () => {
        expect(result.privateByGroup.map((g) => g.friends.map((f) => f.id))).toEqual([['favPriv']]);
        expect(result.offlineByGroup[0].label).toBe('Group 3');
    });

    test('ties broken by favorite count then earliest join', () => {
        const r = buildFavoriteInstances({
            friends: [friend('fav2', LOC_A, 50), friend('fav3', LOC_B, 10), friend('usr_owner', LOC_B, 20)],
            getFavoriteGroup
        });
        expect(r.instances.map((i) => i.location)).toEqual([LOC_B, LOC_A]);
    });
});

describe('sortInstanceMembers', () => {
    test('keeps owner first', () => {
        const list = [friend('a', LOC_A, 1), friend('owner', LOC_A, 9)];
        expect(sortInstanceMembers(list, 'owner').map((f) => f.id)).toEqual(['owner', 'a']);
    });
});

describe('buildGroupInstanceSections', () => {
    test('groups and sorts by friends then name/userCount', () => {
        const sections = buildGroupInstanceSections({
            groupInstances: [
                { group: { id: 'grp_b', name: 'B' }, instance: { location: 'wrld_x:1', userCount: 5 } },
                { group: { id: 'grp_a', name: 'A' }, instance: { location: 'wrld_y:1', userCount: 3 } },
                { group: { id: 'grp_a', name: 'A' }, instance: { location: 'wrld_y:2', userCount: 9 } },
                {
                    group: { id: 'grp_c', name: 'C' },
                    instance: { location: 'wrld_z:1', closedAt: '2000-01-01T00:00:00Z' }
                }
            ],
            friends: [friend('f1', 'wrld_x:1', 1), friend('f2', 'wrld_y:1', 1)],
            isFavorite: (id) => id === 'f2'
        });
        expect(sections.map((s) => s.groupId)).toEqual(['grp_a', 'grp_b']);
        expect(sections[0].instances.map((i) => i.location)).toEqual(['wrld_y:1', 'wrld_y:2']);
        expect(sections[0].instances[0].favorites.map((f) => f.id)).toEqual(['f2']);
    });
});

describe('getStayStart', () => {
    test('prefers the live ref over the snapshot copy', () => {
        const f = {
            ref: { location: 'traveling', $travelingToTime: 1 },
            live: { ref: { location: 'traveling', $travelingToTime: 5 } }
        };
        expect(getStayStart(f)).toBe(5);
    });

    test('uses an earlier feed arrival only for the same location', () => {
        const ref = { location: LOC_A, $location_at: 1000 };
        expect(getStayStart({ ref, arrival: { location: LOC_A, at: 400 } })).toBe(400);
        expect(getStayStart({ ref, arrival: { location: LOC_B, at: 400 } })).toBe(1000);
        expect(getStayStart({ ref, arrival: { location: LOC_A, at: 2000 } })).toBe(1000);
    });

    test('returns 0 when unknown', () => {
        expect(getStayStart({})).toBe(0);
    });
});
