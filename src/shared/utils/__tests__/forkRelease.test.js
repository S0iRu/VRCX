import { compareReleaseNames, isNewerRelease } from '../../constants/fork';

describe('isNewerRelease', () => {
    test('compares numerically', () => {
        expect(isNewerRelease('VRCX 2026.11.14.10', 'VRCX 2026.11.14.9')).toBe(true);
        expect(isNewerRelease('VRCX 2026.11.14.2', 'VRCX 2026.11.14.2')).toBe(false);
        expect(isNewerRelease('VRCX 2026.11.20.1', 'VRCX 2026.11.14.3')).toBe(true);
        expect(isNewerRelease('VRCX 2026.11.14.1', 'VRCX 2026.11.14')).toBe(true);
        expect(isNewerRelease('VRCX 2026.11.14', 'VRCX 2026.11.14.1')).toBe(false);
    });
});

describe('compareReleaseNames', () => {
    test('sorts newest first numerically', () => {
        const names = ['VRCX 2026.11.14.9', 'VRCX 2026.11.14.10', 'VRCX 2026.11.14.8'];
        expect([...names].sort((a, b) => compareReleaseNames(b, a))).toEqual([
            'VRCX 2026.11.14.10',
            'VRCX 2026.11.14.9',
            'VRCX 2026.11.14.8'
        ]);
        expect(compareReleaseNames('VRCX 2026.11.14.2', 'VRCX 2026.11.14.2')).toBe(0);
    });
});
