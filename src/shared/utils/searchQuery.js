/**
 * Parse a free-text search string into include / exclude terms.
 *
 * Syntax:
 * - Whitespace separated terms are AND-ed together.
 * - A term prefixed with `-` excludes rows containing it.
 * - Double quotes group a phrase: `"Japan Shrine"` / `-"Japan Shrine"`.
 * - A lone `-` (or `-""`) is ignored.
 *
 * @param {string} input
 * @returns {{ include: string[]; exclude: string[] }}
 */
export function parseSearchQuery(input) {
    const include = [];
    const exclude = [];
    const str = String(input ?? '');
    const re = /(-?)(?:"([^"]*)"?|(\S+))/g;
    let match;
    while ((match = re.exec(str)) !== null) {
        const negate = match[1] === '-';
        const term = (match[2] ?? match[3] ?? '').trim();
        if (!term || (!negate && match[3] === '-')) {
            continue;
        }
        (negate ? exclude : include).push(term);
    }
    return { include, exclude };
}

/**
 * @param {{ include: string[]; exclude: string[] }} query
 * @returns {boolean}
 */
export function isEmptySearchQuery(query) {
    return query.include.length === 0 && query.exclude.length === 0;
}

/**
 * Test a list of field values against a parsed query (case-insensitive).
 * Every include term must appear in at least one field, and no exclude term
 * may appear in any field.
 *
 * @param {unknown[]} fields
 * @param {{ include: string[]; exclude: string[] }} query
 * @returns {boolean}
 */
export function matchSearchQuery(fields, query) {
    const haystack = fields.filter((v) => v !== null && v !== undefined).map((v) => String(v).toUpperCase());
    const contains = (term) => {
        const needle = term.toUpperCase();
        return haystack.some((h) => h.includes(needle));
    };
    return query.include.every(contains) && !query.exclude.some(contains);
}

/**
 * Escape LIKE wildcards so terms are matched literally (use with `ESCAPE '\'`).
 *
 * @param {string} term
 * @returns {string}
 */
export function escapeLike(term) {
    return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Build a SQL WHERE fragment (without leading AND) for a parsed query over
 * the given columns. Parameters are returned separately and must be bound.
 *
 * @param {string[]} columns
 * @param {{ include: string[]; exclude: string[] }} query
 * @param {object} [options]
 * @param {(term: string) => string[]} [options.extraIncludeClauses] Extra OR
 *   clauses for an include term (e.g. avatar public/private shortcut)
 * @returns {{ sql: string; args: Record<string, string> }}
 */
export function buildSearchWhere(columns, query, options = {}) {
    const args = {};
    const parts = [];
    const fieldMatch = (key) => columns.map((col) => `IFNULL(${col}, '') LIKE ${key} ESCAPE '\\'`);
    query.include.forEach((term, i) => {
        const key = `@inc_${i}`;
        args[key] = `%${escapeLike(term)}%`;
        const ors = [...fieldMatch(key), ...(options.extraIncludeClauses?.(term) ?? [])];
        parts.push(`(${ors.join(' OR ')})`);
    });
    query.exclude.forEach((term, i) => {
        const key = `@exc_${i}`;
        args[key] = `%${escapeLike(term)}%`;
        parts.push(`NOT (${fieldMatch(key).join(' OR ')})`);
    });
    return { sql: parts.length ? parts.join(' AND ') : '1 = 1', args };
}
