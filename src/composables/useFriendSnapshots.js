import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useFriendStore } from '../stores';

/**
 * Reactive, render-safe snapshots of friends for instance views.
 *
 * VRCX user refs are not deeply reactive (they are mutated in place), so views
 * must depend on `sortedFriends` (re-assigned on every friend update) and pass
 * fresh copies to child components, otherwise location / status changes that
 * show up in the Feed never re-render the cards.
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
    const version = ref(0);

    const snapshots = computed(() => {
        // eslint-disable-next-line no-unused-expressions
        version.value;
        return sortedFriends.value.map((ctx) => ({
            id: ctx.id,
            name: ctx.name,
            state: ctx.state,
            pendingOffline: ctx.pendingOffline,
            isVIP: ctx.isVIP,
            $nickName: ctx.$nickName,
            ref: ctx.ref ? { ...ctx.ref } : null,
            // Live context (same object the sidebar's FriendItem reads). Timestamps such as
            // $travelingToTime are written asynchronously after the list update fires, so
            // timers must read them from here rather than from the snapshot copy above.
            live: ctx
        }));
    });

    return {
        friends: snapshots,
        /** Force a re-read of friend refs */
        reload: async () => {
            version.value++;
        }
    };
}
