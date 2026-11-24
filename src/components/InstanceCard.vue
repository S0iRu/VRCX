<template>
    <Card class="instance-card gap-2 p-3">
        <div class="flex gap-3 min-w-0">
            <img
                v-if="thumbnailUrl"
                :src="thumbnailUrl"
                class="h-18 w-32 flex-none cursor-pointer rounded-md object-cover"
                loading="lazy"
                @click="openWorld" />
            <div class="flex min-w-0 flex-1 flex-col gap-1">
                <Location
                    class="font-medium"
                    :location="location"
                    :grouphint="groupHint"
                    enable-context-menu
                    link
                    stacked />
                <div v-if="instance?.displayName" class="truncate text-xs text-muted-foreground">
                    {{ instance.displayName }}
                </div>
                <!-- `class` goes to the count pill; `style` reaches the root so a narrow card wraps the pill -->
                <InstanceActionBar
                    class="text-sm"
                    style="flex-wrap: wrap; row-gap: 4px"
                    :location="location"
                    :launch-location="location"
                    :instance-location="location"
                    :shortname="instance?.shortName || parsed.shortName"
                    :currentlocation="currentLocation"
                    :instance="instance ?? EMPTY_INSTANCE"
                    :friendcount="favorites.length + others.length"
                    :on-refresh="onRefresh" />
            </div>
        </div>

        <InstanceMemberRow
            v-if="creator"
            :friend="creator"
            :show-timer="false"
            :subtitle="t('dialog.world.instances.instance_creator')" />

        <div v-if="favorites.length" class="flex flex-col">
            <InstanceMemberRow
                v-for="friend in favorites"
                :key="friend.id"
                :friend="friend"
                is-favorite
                :is-owner="friend.id === ownerId" />
        </div>
        <template v-if="others.length">
            <div class="mt-1 text-xs text-muted-foreground">
                {{ t('view.favorite_instances.other_friends') }} ({{ others.length }})
            </div>
            <div class="flex flex-col">
                <InstanceMemberRow
                    v-for="friend in others"
                    :key="friend.id"
                    :friend="friend"
                    :is-owner="friend.id === ownerId" />
            </div>
        </template>
    </Card>
</template>

<script setup>
    import { computed, ref, watch } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { Card } from '@/components/ui/card';

    import { convertFileUrlToImageUrl, parseLocation } from '../shared/utils';
    import { useLocationStore, useUserStore, useWorldStore } from '../stores';
    import { userRequest } from '../api';
    import { showWorldDialog } from '../coordinators/worldCoordinator';

    import InstanceActionBar from './InstanceActionBar.vue';
    import InstanceMemberRow from './InstanceMemberRow.vue';
    import Location from './Location.vue';

    const props = defineProps({
        location: { type: String, required: true },
        instance: { type: Object, default: null },
        favorites: { type: Array, default: () => [] },
        others: { type: Array, default: () => [] },
        groupHint: { type: String, default: '' },
        onRefresh: { type: Function, default: null }
    });

    // InstanceActionBar dereferences `instance` without null checks in a few
    // computeds; a friend can move into an instance before its details are
    // fetched, and a throw there aborts the whole page update.
    const EMPTY_INSTANCE = Object.freeze({});

    const { t } = useI18n();
    const { lastLocation } = storeToRefs(useLocationStore());
    const worldStore = useWorldStore();

    const parsed = computed(() => parseLocation(props.location));
    // Same rule as the world dialog: the location tag's user id, falling back to
    // the fetched instance's ownerId (hidden/friends+ tags may omit it). Group
    // instances are owned by the group, not a user.
    const ownerId = computed(() => {
        if (parsed.value.userId) return parsed.value.userId;
        const owner = props.instance?.ownerId;
        return owner && !owner.startsWith('grp_') ? owner : null;
    });

    const userStore = useUserStore();
    const fetchedCreator = ref(null);

    watch(
        ownerId,
        (id) => {
            if (!id || userStore.cachedUsers.has(id) || fetchedCreator.value?.id === id) return;
            userRequest
                .getUser({ userId: id })
                .then((args) => {
                    if (args?.ref?.id === id) fetchedCreator.value = args.ref;
                })
                .catch(() => {});
        },
        { immediate: true }
    );

    const creator = computed(() => {
        const id = ownerId.value;
        if (!id) return null;
        const user = userStore.cachedUsers.get(id) ?? (fetchedCreator.value?.id === id ? fetchedCreator.value : null);
        return { id, ref: user ?? null, name: user?.displayName };
    });

    const currentLocation = computed(() => lastLocation.value?.location ?? '');

    const thumbnailUrl = computed(() => {
        const world = props.instance?.world ?? worldStore.cachedWorlds.get(parsed.value.worldId);
        const url = world?.thumbnailImageUrl || world?.imageUrl;
        return url ? convertFileUrlToImageUrl(url) : '';
    });

    function openWorld() {
        showWorldDialog(props.location, parsed.value.shortName || null);
    }
</script>
