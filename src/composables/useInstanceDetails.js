import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';

import { instanceRequest } from '../api';
import { parseLocation } from '../shared/utils';
import { useInstanceStore } from '../stores';

const STALE_MS = 3 * 60 * 1000;
const STALE_CHECK_MS = 60 * 1000;
const REQUEST_GAP_MS = 250;

/**
 * Keep instance details (user count, capacity, world, displayName) fresh for a
 * reactive list of locations, using the shared instance cache. Requests are
 * de-duplicated and sent one at a time to stay gentle on the API.
 *
 * The shared instance cache is a plain (non-reactive) Map whose entries are
 * mutated in place, so `getInstance` returns a fresh shallow copy keyed on an
 * internal version counter; this is what makes cards re-render after a refresh.
 *
 * Periodic re-checks only run while the owning view is active (KeepAlive aware).
 *
 * @param {import('vue').Ref<string[]> | (() => string[])} locations
 */
export function useInstanceDetails(locations) {
    const instanceStore = useInstanceStore();
    const version = ref(0);
    const busy = ref(false);
    const fetchedAt = new Map();
    const queue = [];
    const queued = new Set();
    let running = false;
    let active = false;
    let staleTimer = null;

    // something else (dialogs, other views) applied an instance -> re-read cache
    watch(
        () => instanceStore.lastInstanceApplied,
        () => {
            version.value++;
        }
    );

    /**
     * @param {string} location
     * @returns {object | null}
     */
    function getInstance(location) {
        // eslint-disable-next-line no-unused-expressions
        version.value;
        const cached = instanceStore.cachedInstances.get(location);
        return cached ? { ...cached } : null;
    }

    async function drain() {
        if (running) return;
        running = true;
        busy.value = true;
        try {
            while (queue.length) {
                const location = queue.shift();
                queued.delete(location);
                const L = parseLocation(location);
                try {
                    await instanceRequest.getInstance({ worldId: L.worldId, instanceId: L.instanceId });
                } catch (err) {
                    console.warn('useInstanceDetails: failed to fetch instance', location, err);
                }
                // remember failures too, so a closed instance isn't hammered
                fetchedAt.set(location, Date.now());
                version.value++;
                if (queue.length) {
                    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
                }
            }
        } finally {
            running = false;
            busy.value = false;
        }
    }

    /**
     * @param {string[]} list
     * @param {boolean} [force]
     */
    function ensure(list, force = false) {
        for (const location of list) {
            if (!location || queued.has(location)) continue;
            const L = parseLocation(location);
            if (!L.isRealInstance || !L.worldId || !L.instanceId) continue;
            if (!force) {
                const last = fetchedAt.get(location);
                if (last && Date.now() - last < STALE_MS) continue;
                if (!last && instanceStore.cachedInstances.has(location)) {
                    // already cached by something else; treat as fresh until it goes stale
                    fetchedAt.set(location, Date.now());
                    continue;
                }
            }
            queued.add(location);
            queue.push(location);
        }
        drain();
    }

    const source = typeof locations === 'function' ? locations : () => locations.value;

    watch(source, (list) => {
        if (active) ensure(list ?? []);
    });

    function start() {
        if (active) return;
        active = true;
        ensure(source() ?? []);
        staleTimer = setInterval(() => ensure(source() ?? []), STALE_CHECK_MS);
    }

    function stop() {
        active = false;
        clearInterval(staleTimer);
        staleTimer = null;
    }

    // onMounted covers views outside KeepAlive; onActivated/onDeactivated cover cached views
    onMounted(start);
    onActivated(start);
    onDeactivated(stop);
    onBeforeUnmount(stop);

    return {
        getInstance,
        busy,
        refresh: (list) => ensure(list ?? source() ?? [], true)
    };
}
