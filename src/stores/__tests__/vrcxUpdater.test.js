import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
    configRepository: {
        getString: vi.fn(),
        setString: vi.fn()
    },
    changeLogRemoveLinks: vi.fn((value) => value),
    toast: {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn()
    }
}));

vi.mock('../../services/config', () => ({
    default: mocks.configRepository
}));

vi.mock('../../shared/utils', () => ({
    changeLogRemoveLinks: (...args) => mocks.changeLogRemoveLinks(...args)
}));

vi.mock('vue-sonner', () => ({
    toast: mocks.toast
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key) => key,
        locale: require('vue').ref('en')
    })
}));

function flushPromises() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

import { useVRCXUpdaterStore } from '../vrcxUpdater';

describe('useVRCXUpdaterStore.setAutoUpdateVRCX', () => {
    beforeEach(async () => {
        mocks.configRepository.getString.mockImplementation((key, defaultValue) => {
            if (key === 'VRCX_autoUpdateVRCX') {
                return Promise.resolve('Off');
            }
            if (key === 'VRCX_id') {
                return Promise.resolve('test-vrcx-id');
            }
            if (key === 'VRCX_lastVRCXVersion') {
                return Promise.resolve('2026.1.0');
            }
            return Promise.resolve(defaultValue ?? '');
        });
        mocks.configRepository.setString.mockResolvedValue(undefined);

        globalThis.AppApi = {
            GetVersion: vi.fn().mockResolvedValue('2026.1.0')
        };

        setActivePinia(createPinia());
        useVRCXUpdaterStore();
        await flushPromises();
        vi.clearAllMocks();
    });

    test('sets autoUpdateVRCX to Off, clears pending flag, and persists config', async () => {
        const store = useVRCXUpdaterStore();
        store.pendingVRCXUpdate = true;

        await store.setAutoUpdateVRCX('Off');

        expect(store.autoUpdateVRCX).toBe('Off');
        expect(store.pendingVRCXUpdate).toBe(false);
        expect(mocks.configRepository.setString).toHaveBeenCalledWith('VRCX_autoUpdateVRCX', 'Off');
    });

    test('updates autoUpdateVRCX for non-Off values and keeps pending flag', async () => {
        const store = useVRCXUpdaterStore();
        store.pendingVRCXUpdate = true;

        await store.setAutoUpdateVRCX('Notify');

        expect(store.autoUpdateVRCX).toBe('Notify');
        expect(store.pendingVRCXUpdate).toBe(true);
        expect(mocks.configRepository.setString).toHaveBeenCalledWith('VRCX_autoUpdateVRCX', 'Notify');
    });
});

describe('useVRCXUpdaterStore.loadBranchVersions (fork build)', () => {
    beforeEach(async () => {
        mocks.configRepository.getString.mockImplementation((key, defaultValue) =>
            Promise.resolve(key === 'VRCX_autoUpdateVRCX' ? 'Off' : (defaultValue ?? ''))
        );
        mocks.configRepository.setString.mockResolvedValue(undefined);
        globalThis.AppApi = {
            GetVersion: vi.fn().mockResolvedValue('VRCX 2026.11.14.3')
        };
        globalThis.webApiService = {
            execute: vi.fn().mockResolvedValue({ status: 200, data: '[]' })
        };
        setActivePinia(createPinia());
        useVRCXUpdaterStore();
        await flushPromises();
        vi.clearAllMocks();
    });

    test('reads fork releases even if branch was switched to Stable', async () => {
        const store = useVRCXUpdaterStore();
        store.branch = 'Stable';

        await store.loadBranchVersions();

        expect(globalThis.webApiService.execute).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'https://api.github.com/repos/S0iRu/VRCX/releases' })
        );
    });

    test('orders the release dropdown by version number', async () => {
        const release = (n) => ({
            name: `VRCX 2026.11.14.${n}`,
            tag_name: `v2026.11.14.${n}`,
            prerelease: false,
            assets: [{ state: 'uploaded' }]
        });
        globalThis.webApiService.execute.mockResolvedValueOnce({
            status: 200,
            data: JSON.stringify([release(9), release(10), release(8)])
        });
        const store = useVRCXUpdaterStore();

        await store.loadBranchVersions();

        expect(store.VRCXUpdateDialog.releases.map((r) => r.tag_name)).toEqual([
            'v2026.11.14.10',
            'v2026.11.14.9',
            'v2026.11.14.8'
        ]);
        expect(store.VRCXUpdateDialog.release).toBe('VRCX 2026.11.14.10');
    });
});
