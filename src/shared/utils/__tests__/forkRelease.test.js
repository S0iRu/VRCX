import { isNewerRelease } from '../../constants/fork';

describe('isNewerRelease', () => {
    test('compares numerically', () => {
        expect(isNewerRelease('VRCX 2026.11.14.10', 'VRCX 2026.11.14.9')).toBe(true);
        expect(isNewerRelease('VRCX 2026.11.14.2', 'VRCX 2026.11.14.2')).toBe(false);
        expect(isNewerRelease('VRCX 2026.11.20.1', 'VRCX 2026.11.14.3')).toBe(true);
        expect(isNewerRelease('VRCX 2026.11.14.1', 'VRCX 2026.11.14')).toBe(true);
        expect(isNewerRelease('VRCX 2026.11.14', 'VRCX 2026.11.14.1')).toBe(false);
    });
});
