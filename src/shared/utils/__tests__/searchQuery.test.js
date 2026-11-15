import { buildSearchWhere, escapeLike, isEmptySearchQuery, matchSearchQuery, parseSearchQuery } from '../searchQuery';

describe('parseSearchQuery', () => {
    test('splits include and exclude terms', () => {
        expect(parseSearchQuery('world -Home -"Japan Shrine" "Night Club"')).toEqual({
            include: ['world', 'Night Club'],
            exclude: ['Home', 'Japan Shrine']
        });
    });

    test('ignores lone dash and empty quotes', () => {
        expect(parseSearchQuery(' - -"" "" ')).toEqual({ include: [], exclude: [] });
        expect(isEmptySearchQuery(parseSearchQuery('  '))).toBe(true);
    });

    test('keeps hyphen inside a term', () => {
        expect(parseSearchQuery('foo-bar')).toEqual({ include: ['foo-bar'], exclude: [] });
    });

    test('handles unterminated quote', () => {
        expect(parseSearchQuery('-"abc def')).toEqual({ include: [], exclude: ['abc def'] });
    });
});

describe('matchSearchQuery', () => {
    test('all include terms must match some field (case-insensitive)', () => {
        const q = parseSearchQuery('alice club');
        expect(matchSearchQuery(['Alice', 'Night Club'], q)).toBe(true);
        expect(matchSearchQuery(['Alice', 'Home'], q)).toBe(false);
    });

    test('exclude terms reject rows', () => {
        const q = parseSearchQuery('-home');
        expect(matchSearchQuery(['Alice', 'My Home'], q)).toBe(false);
        expect(matchSearchQuery(['Alice', 'Club'], q)).toBe(true);
        expect(matchSearchQuery(['Alice', null, undefined], q)).toBe(true);
    });
});

describe('buildSearchWhere', () => {
    test('builds bound include/exclude clauses', () => {
        const { sql, args } = buildSearchWhere(['a', 'b'], parseSearchQuery('x -y'));
        const like = (col, key) => `IFNULL(${col}, '') LIKE ${key} ESCAPE '\\'`;
        expect(sql).toBe(
            `(${like('a', '@inc_0')} OR ${like('b', '@inc_0')}) AND NOT (${like('a', '@exc_0')} OR ${like('b', '@exc_0')})`
        );
        expect(args).toEqual({ '@inc_0': '%x%', '@exc_0': '%y%' });
    });

    test('empty query matches everything', () => {
        expect(buildSearchWhere(['a'], parseSearchQuery(''))).toEqual({ sql: '1 = 1', args: {} });
    });

    test('extra include clauses are OR-ed in', () => {
        const { sql } = buildSearchWhere(['a'], parseSearchQuery('private'), {
            extraIncludeClauses: () => ['user_id = owner_id']
        });
        expect(sql).toContain('OR user_id = owner_id');
    });

    test('escapes LIKE wildcards', () => {
        expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
    });
});
