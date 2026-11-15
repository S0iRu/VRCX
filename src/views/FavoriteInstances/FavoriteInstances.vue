<template>
    <div class="x-container favorite-instances flex h-full flex-col">
        <div class="mb-3 flex items-center gap-2">
            <h2 class="text-lg font-semibold">{{ t('view.favorite_instances.header') }}</h2>
            <span class="text-sm text-muted-foreground">
                {{
                    t('view.favorite_instances.summary', {
                        instances: result.instances.length,
                        friends: favoriteInGameCount
                    })
                }}
            </span>
            <div class="ml-auto flex items-center gap-2">
                <InputGroupSearch
                    v-model="searchTerm"
                    class="w-56"
                    :placeholder="t('view.favorite_instances.search_placeholder')" />
                <Button variant="outline" size="sm" class="h-8 gap-1.5" :disabled="busy" @click="refreshAll">
                    <RefreshCw class="size-4" :class="{ 'animate-spin': busy }" />
                    {{ t('common.actions.refresh') }}
                </Button>
            </div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto pr-1">
            <div v-if="!filteredInstances.length" class="py-10 text-center text-sm text-muted-foreground">
                {{ t('view.favorite_instances.empty') }}
            </div>
            <div class="instance-grid">
                <InstanceCard
                    v-for="item in filteredInstances"
                    :key="item.location"
                    :location="item.location"
                    :instance="getInstance(item.location)"
                    :favorites="item.favorites"
                    :others="item.others"
                    :on-refresh="() => refresh([item.location])" />
            </div>

            <section v-if="result.privateByGroup.length" class="mt-6">
                <h3 class="mb-2 text-sm font-semibold">
                    {{ t('view.favorite_instances.private') }} ({{ countFriends(result.privateByGroup) }})
                </h3>
                <div v-for="group in result.privateByGroup" :key="group.key" class="mb-3">
                    <div class="mb-1 text-xs text-muted-foreground">{{ group.label }} ({{ group.friends.length }})</div>
                    <div class="member-grid">
                        <InstanceMemberRow
                            v-for="friend in group.friends"
                            :key="friend.id"
                            :friend="friend"
                            is-favorite />
                    </div>
                </div>
            </section>

            <section v-if="result.offlineByGroup.length" class="mt-6">
                <button type="button" class="mb-2 flex items-center gap-1 text-sm font-semibold" @click="toggleOffline">
                    <ChevronDown class="size-4 transition-transform" :class="{ '-rotate-90': !showOffline }" />
                    {{ t('view.favorite_instances.offline') }} ({{ countFriends(result.offlineByGroup) }})
                </button>
                <template v-if="showOffline">
                    <div v-for="group in result.offlineByGroup" :key="group.key" class="mb-3">
                        <div class="mb-1 text-xs text-muted-foreground">
                            {{ group.label }} ({{ group.friends.length }})
                        </div>
                        <div class="member-grid">
                            <InstanceMemberRow
                                v-for="friend in group.friends"
                                :key="friend.id"
                                :friend="friend"
                                is-favorite
                                :show-timer="false" />
                        </div>
                    </div>
                </template>
            </section>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, ref } from 'vue';
    import { ChevronDown, RefreshCw } from 'lucide-vue-next';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { Button } from '@/components/ui/button';
    import { InputGroupSearch } from '@/components/ui/input-group';

    import { useFavoriteStore, useFriendStore } from '../../stores';
    import { buildFavoriteInstances } from '../../shared/utils/favoriteInstances';
    import { useInstanceDetails } from '../../composables/useInstanceDetails';
    import { useFriendSnapshots } from '../../composables/useFriendSnapshots';

    import InstanceCard from '../../components/InstanceCard.vue';
    import InstanceMemberRow from '../../components/InstanceMemberRow.vue';
    import configRepository from '../../services/config.js';

    const { t } = useI18n();

    const friendStore = useFriendStore();
    const { allFavoriteFriendIds } = storeToRefs(friendStore);
    const { friends: friendSnapshots, reload: reloadFriends } = useFriendSnapshots();
    const favoriteStore = useFavoriteStore();
    const { favoriteFriendGroups, localFriendFavorites, cachedFavorites } = storeToRefs(favoriteStore);

    const searchTerm = ref('');
    const showOffline = ref(true);

    onMounted(async () => {
        showOffline.value = await configRepository.getBool('VRCX_FavoriteInstancesShowOffline', true);
    });

    function toggleOffline() {
        showOffline.value = !showOffline.value;
        configRepository.setBool('VRCX_FavoriteInstancesShowOffline', showOffline.value);
    }

    /**
     * UserId -> { key, label, order } for every favorite friend that passes the
     * "favorite friend groups" setting (same set VRCX uses for VIP).
     */
    const favoriteGroupMap = computed(() => {
        const ids = allFavoriteFriendIds.value;
        const map = new Map();
        const remoteOrder = new Map();
        favoriteFriendGroups.value.forEach((group, index) => {
            remoteOrder.set(group.key, { label: group.displayName || group.name, order: index });
        });
        for (const fav of cachedFavorites.value.values()) {
            if (fav.type !== 'friend' || !ids.has(fav.favoriteId) || map.has(fav.favoriteId)) continue;
            const info = remoteOrder.get(fav.$groupKey);
            map.set(fav.favoriteId, {
                key: fav.$groupKey,
                label: info?.label ?? fav.$groupKey,
                order: info?.order ?? 999
            });
        }
        Object.keys(localFriendFavorites.value ?? {}).forEach((groupName, index) => {
            for (const userId of localFriendFavorites.value[groupName] ?? []) {
                if (!ids.has(userId) || map.has(userId)) continue;
                map.set(userId, { key: `local:${groupName}`, label: groupName, order: 1000 + index });
            }
        });
        return map;
    });

    const result = computed(() =>
        buildFavoriteInstances({
            friends: friendSnapshots.value,
            getFavoriteGroup: (id) => favoriteGroupMap.value.get(id) ?? null
        })
    );

    const favoriteInGameCount = computed(() =>
        result.value.instances.reduce((sum, item) => sum + item.favorites.length, 0)
    );

    const locations = computed(() => result.value.instances.map((item) => item.location));
    const { getInstance, refresh, busy } = useInstanceDetails(locations);

    const filteredInstances = computed(() => {
        const term = searchTerm.value.trim().toLowerCase();
        if (!term) return result.value.instances;
        return result.value.instances.filter((item) => {
            const instance = getInstance(item.location);
            const haystack = [
                instance?.world?.name,
                instance?.displayName,
                ...item.favorites.map((f) => f.name),
                ...item.others.map((f) => f.name)
            ]
                .filter(Boolean)
                .join('\n')
                .toLowerCase();
            return haystack.includes(term);
        });
    });

    function countFriends(groups) {
        return groups.reduce((sum, g) => sum + g.friends.length, 0);
    }

    function refreshAll() {
        reloadFriends();
        refresh(locations.value);
    }
</script>

<style scoped>
    .instance-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: 12px;
    }
    .member-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 2px 12px;
    }
</style>
