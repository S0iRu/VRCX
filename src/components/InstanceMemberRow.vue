<template>
    <!-- Visual style mirrors the right sidebar's FriendItem; only the second line
         (status message) and the right-aligned stay timer differ. -->
    <UserContextMenu :user-id="friend.id" :state="friend.state" :location="friend.ref?.location">
        <div
            class="relative isolate box-border flex items-center overflow-hidden rounded-lg p-1.5 text-[13px] cursor-pointer hover:bg-muted/50"
            @click="showUserDialog(friend.id)">
            <div class="relative inline-block flex-none size-9 mr-2.5" :class="friendStatusClass">
                <Avatar class="size-full rounded-full">
                    <AvatarImage :src="userImage(friend.ref, true)" class="object-cover" />
                    <AvatarFallback>
                        <User class="size-5 text-muted-foreground" />
                    </AvatarFallback>
                </Avatar>
                <IconFrame v-if="friend.ref" :enabled="sidebarCosmetics" :icon-frame="friend.ref.iconFrame" />
            </div>
            <div class="flex-1 overflow-hidden h-9 flex flex-col justify-between">
                <div class="flex min-w-0 items-center">
                    <span class="block truncate font-medium leading-[18px]" :style="{ color: friend.ref?.$userColour }"
                        >{{ displayName }}{{ isFavorite ? ' ⭐' : '' }}{{ isOwner ? ' 👑' : '' }}</span
                    >
                    <span v-if="showTimer" class="ml-auto flex flex-none items-center pl-2 text-xs"
                        ><Spinner v-if="isTraveling" class="mr-1" /><Timer :epoch="epoch"
                    /></span>
                </div>
                <span class="block truncate text-xs">{{ subtitle || friend.ref?.statusDescription || '&nbsp;' }}</span>
            </div>
        </div>
    </UserContextMenu>
</template>

<script setup>
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { User } from 'lucide-vue-next';
    import { Spinner } from '@/components/ui/spinner';
    import { computed } from 'vue';
    import { storeToRefs } from 'pinia';

    import IconFrame from '@/components/IconFrame.vue';

    import { getStayStart } from '../shared/utils/favoriteInstances';
    import { useAppearanceSettingsStore } from '../stores';
    import { useUserDisplay } from '../composables/useUserDisplay';
    import { showUserDialog } from '../coordinators/userCoordinator';

    import Timer from './Timer.vue';
    import UserContextMenu from './UserContextMenu.vue';

    import '@/styles/status-icon.css';

    const props = defineProps({
        friend: { type: Object, required: true },
        isFavorite: { type: Boolean, default: false },
        isOwner: { type: Boolean, default: false },
        showTimer: { type: Boolean, default: true },
        // replaces the status message on the second line (e.g. "Instance Creator")
        subtitle: { type: String, default: '' }
    });

    const { hideNicknames, sidebarCosmetics } = storeToRefs(useAppearanceSettingsStore());
    const { userImage, userStatusClass } = useUserDisplay();

    const friendStatusClass = computed(() =>
        props.friend.ref ? userStatusClass(props.friend.ref, props.friend.pendingOffline) : ''
    );

    const displayName = computed(() => {
        const name = props.friend.ref?.displayName || props.friend.name || props.friend.id;
        return !hideNicknames.value && props.friend.$nickName ? `${name} (${props.friend.$nickName})` : name;
    });

    const isTraveling = computed(() => (props.friend.live?.ref ?? props.friend.ref)?.location === 'traveling');

    // same epoch rule as the sidebar's FriendItem
    const epoch = computed(() => getStayStart(props.friend));
</script>
