import { openJar } from './utils/Jar.js';

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export class MinecraftData {
    constructor() {
        this.nodes = new Map();
        this.edges = [];
        this.stats = { tags: 0, items: 0 };
        this.categories = new Set();
    }

    async fetchManifest() {
        const res = await fetch(MANIFEST_URL);
        if (!res.ok) throw new Error('Failed to fetch version manifest');
        return await res.json();
    }

    async downloadJar(versionUrl, onProgress) {
        onProgress('Fetching version details...', 1);
        const vRes = await fetch(versionUrl);
        const vData = await vRes.json();

        const clientJarUrl = vData.downloads.client.url;

        onProgress('Starting download...', 5);

        try {
            const response = await fetch(clientJarUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Failed to download JAR: ${response.statusText}`);

            const contentLength = +response.headers.get('Content-Length');
            const reader = response.body.getReader();

            let receivedLength = 0;
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedLength += value.length;

                if (contentLength) {
                    const pct = Math.round((receivedLength / contentLength) * 100);
                    // Map 0-100 download progress to 5-50% overall progress
                    const overallPct = 5 + Math.round(pct * 0.45);
                    onProgress(`Downloading JAR... ${pct}%`, overallPct);
                } else {
                    onProgress(`Downloading JAR... ${(receivedLength / 1024 / 1024).toFixed(1)}MB`, 25);
                }
            }

            const blob = new Blob(chunks);
            onProgress('Processing JAR...', 55);
            const jar = await openJar(blob);

            // Read pack format from version.json
            try {
                const versionJson = await jar.readEntry('version.json');
                const versionData = JSON.parse(versionJson);
                // content of pack_version can be a number (older) or object (newer)
                // Newer objects can have 'data' (e.g. 1.21.5) or 'data_major' (e.g. 26.1 snapshots)
                let fmt = versionData.pack_version;
                if (typeof fmt === 'object' && fmt !== null) {
                    if (typeof fmt.data !== 'undefined') {
                        fmt = fmt.data;
                    } else if (typeof fmt.data_major !== 'undefined') {
                        fmt = fmt.data_major;
                    }
                }
                jar.packFormat = (typeof fmt === 'number') ? fmt : null;
                this.currentPackFormat = jar.packFormat;
            } catch (e) {
                console.warn('Could not read pack format from JAR:', e);
                jar.packFormat = null;
                this.currentPackFormat = null;
            }

            return jar;

        } catch (e) {
            throw new Error(`Failed to download jar: ${e.message}`);
        }
    }

    async extractTags(jar, onProgress) {
        onProgress('Reading Central Directory...', 60);

        // jar is now the JarImpl instance from Jar.js (MEMORY BASED)
        const tagRegex = /^data\/([^/]+)\/tags\/(.*)\.json$/;
        const tagEntries = [];
        for (const path in jar.entries) {
            if (tagRegex.test(path)) {
                tagEntries.push(path);
            }
        }

        const total = tagEntries.length;
        onProgress(`Found ${total} tags. Parsing...`, 65);

        this.nodes.clear();
        this.edges = [];
        this.stats = { tags: 0, items: 0 };

        let processed = 0;
        let errors = 0;

        // Since it's in memory, we don't need to batch for network, but we should yield to UI
        // to prevent freezing.
        const batchSize = 100;

        for (let i = 0; i < total; i += batchSize) {
            const batch = tagEntries.slice(i, i + batchSize);

            // Process batch
            await Promise.all(batch.map(async (path) => {
                try {
                    const content = await jar.readEntry(path);
                    const json = JSON.parse(content);
                    this.parseTagFile(path, json);
                } catch (e) {
                    console.warn(`Failed to process ${path}:`, e);
                    errors++;
                }
            }));

            processed += batch.length;

            // Map 0-100 processing to 65-100% overall progress
            const pct = Math.round((processed / total) * 100);
            const overallPct = 65 + Math.round(pct * 0.35);

            onProgress(`Parsing tags... ${pct}%`, overallPct);

            // Yield to main thread to allow UI render
            await new Promise(r => setTimeout(r, 0));
        }

        if (errors > 0) {
            console.error(`Failed to load ${errors} tags.`);
        }

        return this.getGraphData();
    }

    parseTagFile(filePath, json) {
        // filePath: data/<namespace>/tags/<category>/<path>...
        const parts = filePath.split('/');
        const namespace = parts[1];
        const category = parts[3];
        const namePath = parts.slice(4).join('/');
        const name = namePath.replace('.json', '');

        // NAMESPACED ID: category:namespace:name
        // e.g. block:minecraft:mud
        const id = `${category}:${namespace}:${name}`;

        this.addNode(id, 'tag', category, filePath, json);

        if (!json.values) return;

        json.values.forEach(val => {
            let targetRaw = val;

            if (typeof val === 'object') {
                targetRaw = val.id;
            }

            if (targetRaw.startsWith('#')) {
                // Dependency is another tag
                // e.g. "#minecraft:dirt"
                // We assume it's in the SAME category (tags usually reference tags of same type)
                // So target ID becomes "block:minecraft:dirt"
                const rawTag = targetRaw.substring(1);
                // Handle optional namespace if missing (defaults to minecraft)
                const targetTagId = rawTag.includes(':') ? rawTag : 'minecraft:' + rawTag;

                const targetId = `${category}:${targetTagId}`;

                this.addNode(targetId, 'tag', category);

                this.edges.push({
                    data: {
                        source: id,
                        target: targetId,
                        id: `${id}->${targetId}`
                    }
                });

            } else {
                // Dependency is a direct element (block/item/fluid)
                // e.g. "minecraft:dirt"
                // We also namespace this to keep the graph clean and distinct
                // e.g. "block:minecraft:dirt"
                const rawElement = targetRaw.includes(':') ? targetRaw : 'minecraft:' + targetRaw;
                const targetId = `${category}:${rawElement}`;

                this.addNode(targetId, 'element', category);

                this.edges.push({
                    data: {
                        source: id,
                        target: targetId,
                        id: `${id}->${targetId}`
                    }
                });
            }
        });
    }

    addNode(id, type, category, path = null, json = null) {
        if (!this.nodes.has(id)) {
            // New node
            if (type === 'tag') this.stats.tags++;
            else this.stats.items++;

            if (category && category !== 'unknown') {
                this.categories.add(category);
            }

            this.nodes.set(id, {
                data: {
                    id: id,
                    label: id.split(':').pop(),
                    type: type,
                    category: category,
                    path: path,
                    json: json
                }
            });
        } else {
            // Node exists - check if we need to update it
            // This happens when a tag was referenced (creating a placeholder)
            // before its definition file was processed using this method.
            const node = this.nodes.get(id);
            if (path && !node.data.path) {
                node.data.path = path;
                if (json) node.data.json = json;
                node.data.category = category;
                node.data.type = type; // Ensure type is 'tag' if replacing an implicit node

                if (category && category !== 'unknown') {
                    this.categories.add(category);
                }
            }
        }
    }

    getGraphData() {
        return {
            elements: [
                ...this.nodes.values(),
                ...this.edges
            ],
            stats: this.stats,
            categories: Array.from(this.categories).sort(),
            packFormat: this.currentPackFormat
        };
    }
}
