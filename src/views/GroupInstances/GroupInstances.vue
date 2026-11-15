<template>
    <div class="x-container group-instances flex h-full flex-col">
        <div class="mb-3 flex items-center gap-2">
            <h2 class="text-lg font-semibold">{{ t('view.group_instances.header') }}</h2>
            <span class="text-sm text-muted-foreground">
                {{ t('view.group_instances.summary', { groups: sections.length, instances: instanceCount }) }}
            </span>
            <div class="ml-auto flex items-center gap-2">
                <span v-if="lastUpdated" class="text-xs text-muted-foreground">
                    {{ t('view.group_instances.last_updated', { time: lastUpdated }) }}
                </span>
                <InputGroupSearch
                    v-model="searchTerm"
                    class="w-56"
                    :placeholder="t('view.group_instances.search_placeholder')" />
                <Button variant="outline" size="sm" class="h-8 gap-1.5" :disabled="loading" @click="reload">
                    <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
                    {{ t('common.actions.refresh') }}
                </Button>
            </div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto pr-1">
            <div v-if="errorMessage" class="mb-3 rounded-md border border-destructive/50 p-3 text-sm text-destructive">
                {{ errorMessage }}
            </div>
            <div v-if="!filteredSections.length && !loading" class="py-10 text-center text-sm text-muted-foreground">
                {{ t('view.group_instances.empty') }}
            </div>

            <section v-for="section in filteredSections" :key="section.groupId" class="mb-3 rounded-lg border">
                <button
                    type="button"
                    class="flex w-full items-center gap-2.5 p-2.5 text-left hover:bg-muted/50"
                    @click="toggle(section.groupId)">
                    <ChevronDown
                        class="size-4 flex-none transition-transform"
                        :class="{ '-rotate-90': !isExpanded(section.groupId) }" />
                    <Avatar class="size-8 flex-none">
                        <AvatarImage :src="groupIcon(section.group)" class="object-cover" />
                        <AvatarFallback><Users class="size-4 text-muted-foreground" /></AvatarFallback>
                    </Avatar>
                    <div class="min-w-0 flex-1">
                        <div class="truncate font-medium">{{ section.group.name }}</div>
                        <div class="truncate text-xs text-muted-foreground">
                            {{
                                section.group.shortCode
                                    ? `${section.group.shortCode}.${section.group.discriminator ?? ''}`
                                    : section.groupId
                            }}
                        </div>
                    </div>
                    <span class="flex-none text-xs text-muted-foreground">
                        {{
                            t('view.group_instances.section_counts', {
                                instances: section.instances.length,
                                friends: section.friendCount
                            })
                        }}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        class="h-7 flex-none"
                        @click.stop="showGroupDialog(section.groupId)">
                        {{ t('view.group_instances.open_group') }}
                    </Button>
                </button>
                <div v-if="isExpanded(section.groupId)" class="instance-grid p-2.5 pt-0">
                    <InstanceCard
                        v-for="item in section.instances"
                        :key="item.location"
                        :location="item.location"
                        :instance="item.instance"
                        :favorites="item.favorites"
                        :others="item.others"
                        :group-hint="section.group.name"
                        :on-refresh="() => refreshInstance(item.location)" />
                </div>
            </section>
        </div>
    </div>
</template>

<script setup>
    import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
    import { ChevronDown, RefreshCw, Users } from 'lucide-vue-next';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { Button } from '@/components/ui/button';
    import { InputGroupSearch } from '@/components/ui/input-group';

    import { groupRequest, instanceRequest } from '../../api';
    import { convertFileUrlToImageUrl, parseLocation } from '../../shared/utils';
    import { buildGroupInstanceSections } from '../../shared/utils/favoriteInstances';
    import { handleGroupUserInstances, showGroupDialog } from '../../coordinators/groupCoordinator';
    import { useAppearanceSettingsStore, useFriendStore, useGroupStore, useInstanceStore } from '../../stores';
    import { watchState } from '../../services/watchState';

    import { useFriendSnapshots } from '../../composables/useFriendSnapshots';

    import InstanceCard from '../../components/InstanceCard.vue';
    import configRepository from '../../services/config.js';

    const REFRESH_INTERVAL_MS = 60 * 1000;
    const CONFIG_KEY = 'VRCX_GroupInstancesExpanded';

    const { t, locale } = useI18n();

    const { groupInstances } = storeToRefs(useGroupStore());
    const friendStore = useFriendStore();
    const { allFavoriteFriendIds } = storeToRefs(friendStore);
    const { friends: friendSnapshots, reload: reloadFriends } = useFriendSnapshots();
    const { isAgeGatedInstancesVisible } = storeToRefs(useAppearanceSettingsStore());

    const loading = ref(false);
    const errorMessage = ref('');
    const lastUpdatedAt = ref(0);
    const searchTerm = ref('');
    const expanded = ref({});
    let timer = null;
    let expandedLoaded = false;

    // Instance refs live in a non-reactive cache and are mutated in place, so
    // bump a counter whenever they may have changed and hand cards fresh copies.
    const instanceVersion = ref(0);
    const instanceStore = useInstanceStore();
    watch(
        () => instanceStore.lastInstanceApplied,
        () => {
            instanceVersion.value++;
        }
    );

    const sections = computed(() => {
        // eslint-disable-next-line no-unused-expressions
        instanceVersion.value;
        return buildGroupInstanceSections({
            groupInstances: groupInstances.value
                .filter((entry) => {
                    if (isAgeGatedInstancesVisible.value) return true;
                    const loc = entry?.instance?.location ?? '';
                    return !(entry?.instance?.ageGate || loc.includes('~ageGate'));
                })
                .map((entry) => ({ group: entry.group, instance: entry.instance ? { ...entry.instance } : null })),
            friends: friendSnapshots.value,
            isFavorite: (id) => allFavoriteFriendIds.value.has(id)
        });
    });

    const filteredSections = computed(() => {
        const term = searchTerm.value.trim().toLowerCase();
        if (!term) return sections.value;
        return sections.value
            .map((section) => {
                const groupMatch = [section.group.name, section.group.shortCode]
                    .filter(Boolean)
                    .some((v) => String(v).toLowerCase().includes(term));
                if (groupMatch) return section;
                const instances = section.instances.filter((item) =>
                    [
                        item.instance?.world?.name,
                        item.instance?.displayName,
                        ...item.favorites.map((f) => f.name),
                        ...item.others.map((f) => f.name)
                    ]
                        .filter(Boolean)
                        .some((v) => String(v).toLowerCase().includes(term))
                );
                return instances.length ? { ...section, instances } : null;
            })
            .filter(Boolean);
    });

    const instanceCount = computed(() => sections.value.reduce((sum, s) => sum + s.instances.length, 0));

    const lastUpdated = computed(() =>
        lastUpdatedAt.value ? new Date(lastUpdatedAt.value).toLocaleTimeString(locale.value) : ''
    );

    function isExpanded(groupId) {
        return Boolean(expanded.value[groupId]);
    }

    function toggle(groupId) {
        expanded.value = { ...expanded.value, [groupId]: !expanded.value[groupId] };
        configRepository.setString(CONFIG_KEY, JSON.stringify(expanded.value));
    }

    function groupIcon(group) {
        return group?.iconUrl ? convertFileUrlToImageUrl(group.iconUrl) : '';
    }

    async function reload() {
        if (loading.value || !watchState.isLoggedIn) return;
        loading.value = true;
        errorMessage.value = '';
        reloadFriends();
        try {
            const args = await groupRequest.getUsersGroupInstances();
            await handleGroupUserInstances(args);
            lastUpdatedAt.value = Date.now();
            instanceVersion.value++;
        } catch (err) {
            errorMessage.value = err?.message ?? String(err);
        } finally {
            loading.value = false;
        }
    }

    async function refreshInstance(location) {
        const L = parseLocation(location);
        if (!L.isRealInstance) return;
        try {
            await instanceRequest.getInstance({ worldId: L.worldId, instanceId: L.instanceId });
        } catch (err) {
            console.warn('GroupInstances: failed to refresh instance', location, err);
        }
        instanceVersion.value++;
    }

    async function start() {
        if (timer) return;
        // reserve the slot synchronously so onMounted + onActivated don't double-start
        timer = setInterval(reload, REFRESH_INTERVAL_MS);
        if (!expandedLoaded) {
            expandedLoaded = true;
            try {
                expanded.value = JSON.parse(await configRepository.getString(CONFIG_KEY, '{}')) || {};
            } catch {
                expanded.value = {};
            }
        }
        // skip the immediate reload if we refreshed very recently (e.g. quick tab switching)
        if (Date.now() - lastUpdatedAt.value > 15 * 1000) {
            reload();
        }
    }

    function stop() {
        clearInterval(timer);
        timer = null;
    }

    // the main layout caches views with KeepAlive: only poll while this view is shown
    onMounted(start);
    onActivated(start);
    onDeactivated(stop);
    onBeforeUnmount(stop);
</script>

<style scoped>
    .instance-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: 12px;
    }
</style>
