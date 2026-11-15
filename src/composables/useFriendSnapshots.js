import { computed, onActivated, onMounted, ref, shallowRef, watch } from 'vue';
import { storeToRefs } from 'pinia';

import { database } from '../services/database';
import { debounce } from '../shared/utils';
import { useFriendStore } from '../stores';

/**
 * Reactive, render-safe snapshots of friends for instance views.
 *
 * VRCX user refs are not deeply reactive (they are mutated in place), so views
 * must depend on `sortedFriends` (re-assigned on every friend update) and pass
 * fresh copies to child components, otherwise location / status changes that
 * show up in the Feed never re-render the cards.
 *
 * `$location_at` is reset to app start for everyone after a restart; we
 * recover the real arrival time from the latest GPS/Online feed row when it
 * matches the friend's current location.
 */
export function useFriendSnapshots() {
    // These lists are all derived from the store's internal `sortedFriends`
    // shallowRef, which is re-assigned on every friend update (location, status…).
    const { vipFriends, onlineFriends, activeFriends, offlineFriends } = storeToRefs(useFriendStore());
    const sortedFriends = computed(() => [
        ...vipFriends.value,
        ...onlineFriends.value,
        ...activeFriends.value,
        ...offlineFriends.value
    ]);
    const arrivals = shallowRef(new Map());
    const version = ref(0);

    const snapshots = computed(() => {
        // eslint-disable-next-line no-unused-expressions
        version.value;
        const known = arrivals.value;
        return sortedFriends.value.map((ctx) => {
            const userRef = ctx.ref ? { ...ctx.ref } : null;
            const event = known.get(ctx.id);
            const arrivalAt = event ? Date.parse(event.createdAt) : NaN;
            return {
                id: ctx.id,
                name: ctx.name,
                state: ctx.state,
                pendingOffline: ctx.pendingOffline,
                isVIP: ctx.isVIP,
                $nickName: ctx.$nickName,
                ref: userRef,
                // Live context (same object the sidebar's FriendItem reads). Timestamps such as
                // $travelingToTime are written asynchronously after the list update fires, so
                // timers must read them from here rather than from the snapshot copy above.
                live: ctx,
                // Arrival time recovered from the feed DB, valid only while still at that location.
                arrival: Number.isFinite(arrivalAt) ? { location: event.location, at: arrivalAt } : null
            };
        });
    });

    // changes whenever someone moves/comes online; drives the DB lookup
    const locationSignature = computed(() =>
        sortedFriends.value
            .filter((ctx) => ctx.state === 'online')
            .map((ctx) => `${ctx.id}|${ctx.ref?.location ?? ''}`)
            .join(',')
    );

    async function loadArrivals() {
        const ids = sortedFriends.value.filter((ctx) => ctx.state === 'online').map((ctx) => ctx.id);
        try {
            arrivals.value = await database.getLatestLocationEvents(ids);
        } catch (err) {
            console.warn('useFriendSnapshots: failed to load arrival times', err);
        }
    }

    const loadArrivalsDebounced = debounce(loadArrivals, 1500);
    watch(locationSignature, () => loadArrivalsDebounced());
    onMounted(loadArrivals);
    onActivated(loadArrivals);

    return {
        friends: snapshots,
        /** Force a re-read of friend refs and arrival times */
        reload: async () => {
            await loadArrivals();
            version.value++;
        }
    };
}
