import { ref, shallowRef, watch } from 'vue';
import { defineStore } from 'pinia';

import { database } from '../services/database';
import { useFriendStore } from './friend';
import { useVrcxStore } from './vrcx';
import { watchState } from '../services/watchState';

import configRepository from '../services/config';
import { isEmptySearchQuery, matchSearchQuery, parseSearchQuery } from '../shared/utils/searchQuery';

export const useFeedStore = defineStore('Feed', () => {
    const friendStore = useFriendStore();
    const vrcxStore = useVrcxStore();

    const feedTableData = shallowRef([]);
    const feedTable = ref({
        search: '',
        dateFrom: '',
        dateTo: '',
        vip: false,
        loading: false,
        filter: [],
        pageSize: 20,
        pageSizeLinked: true
    });

    watch(
        () => watchState.isLoggedIn,
        (isLoggedIn) => {
            feedTableData.value = [];
            if (isLoggedIn) {
                initFeedTable();
            }
        },
        { flush: 'sync' }
    );

    watch(
        () => watchState.isFavoritesLoaded,
        (isFavoritesLoaded) => {
            if (isFavoritesLoaded && feedTable.value.vip) {
                feedTableLookup(); // re-apply VIP filter after friends are loaded
            }
        }
    );

    async function init() {
        feedTable.value.filter = JSON.parse(await configRepository.getString('VRCX_feedTableFilters', '[]'));
        feedTable.value.vip = await configRepository.getBool('VRCX_feedTableVIPFilter', false);
    }

    init();

    function feedSearch(row) {
        const raw = feedTable.value.search.trim();
        if (!raw) {
            return true;
        }
        if (raw.startsWith('wrld_') || raw.startsWith('grp_')) {
            return String(row.location ?? '').includes(raw);
        }
        const query = parseSearchQuery(raw);
        if (isEmptySearchQuery(query)) {
            return true;
        }
        switch (row.type) {
            case 'GPS':
            case 'Online':
            case 'Offline':
                return matchSearchQuery([row.displayName, row.worldName, row.groupName], query);
            case 'Status':
                return matchSearchQuery([row.displayName, row.status, row.statusDescription], query);
            case 'Avatar':
                return matchSearchQuery([row.displayName, row.avatarName], query);
            case 'Bio':
                return matchSearchQuery([row.displayName, row.bio, row.previousBio, ...(row.bioLinks ?? [])], query);
        }
        return true;
    }

    async function feedTableLookup() {
        await configRepository.setString('VRCX_feedTableFilters', JSON.stringify(feedTable.value.filter));
        await configRepository.setBool('VRCX_feedTableVIPFilter', feedTable.value.vip);
        feedTable.value.loading = true;
        try {
            let vipList = [];
            if (feedTable.value.vip) {
                vipList = Array.from(friendStore.localFavoriteFriends.values());
            }
            const search = feedTable.value.search.trim();
            const { dateFrom, dateTo } = feedTable.value;
            const rows =
                search || dateFrom || dateTo
                    ? await database.searchFeedDatabase(
                          search,
                          feedTable.value.filter,
                          vipList,
                          vrcxStore.searchLimit,
                          dateFrom,
                          dateTo
                      )
                    : await database.lookupFeedDatabase(feedTable.value.filter, vipList);
            feedTableData.value = [];
            feedTableData.value = [...feedTableData.value, ...rows];
        } finally {
            feedTable.value.loading = false;
        }
    }

    /**
     * Appends a feed entry to the local table if it passes filters.
     * Does NOT trigger notifications or shared feed — that is the caller's responsibility.
     *
     * @param {object} feed The feed entry to add.
     */
    function addFeedEntry(feed) {
        if (feedTable.value.filter.length > 0 && !feedTable.value.filter.includes(feed.type)) {
            return;
        }
        if (feedTable.value.vip && !friendStore.localFavoriteFriends.has(feed.userId)) {
            return;
        }
        if (!feedSearch(feed)) {
            return;
        }
        if (feedTable.value.dateFrom && feed.created_at < feedTable.value.dateFrom) {
            return;
        }
        if (feedTable.value.dateTo && feed.created_at > feedTable.value.dateTo) {
            return;
        }
        feedTableData.value = [feed, ...feedTableData.value];
        sweepFeed();
    }

    function sweepFeed() {
        const j = feedTableData.value.length;
        if (j > vrcxStore.maxTableSize + 50) {
            feedTableData.value = feedTableData.value.slice(0, -50);
        }
    }

    async function initFeedTable() {
        feedTable.value.loading = true;
        await feedTableLookup();
        feedTable.value.loading = false;
    }

    return {
        feedTable,
        feedTableData,
        initFeedTable,
        feedTableLookup,
        addFeedEntry
    };
});
