export function parseTagPath(path) {
    const match = path.match(/^data\/([^/]+)\/tags\/(.+)\.json$/);
    if (!match) return null;

    const parts = match[2].split('/');
    // In worldgen/biome/is_overworld, the category is worldgen/biome.
    const categoryLength = parts[0] === 'worldgen' ? 2 : 1;
    if (parts.length <= categoryLength || parts.some(part => !part)) return null;

    return {
        namespace: match[1],
        category: parts.slice(0, categoryLength).join('/'),
        name: parts.slice(categoryLength).join('/')
    };
}
