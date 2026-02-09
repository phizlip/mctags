import { openJar } from './utils/Jar.js';
import { VersionChecker } from './version-checker.js';

const DATAPACK_COLORS = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#14b8a6',
    '#f97316',
];

const STORAGE_KEY = 'mctags_datapacks';

export class DataPackManager {
    constructor() {
        this.dataPacks = new Map();
        this.colorIndex = 0;
    }

    async uploadDataPack(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const blob = new Blob([arrayBuffer]);
            const jar = await openJar(blob);

            console.log(`Inspecting ${file.name}:`, Object.keys(jar.entries));

            const nestedZips = [];
            for (const path in jar.entries) {
                if (path.endsWith('.zip')) {
                    console.log(`Found nested ZIP: ${path}`);
                    nestedZips.push(path);
                }
            }

            if (nestedZips.length > 0) {
                console.log(`Found ${nestedZips.length} nested data packs in ${file.name}`);
                const uploadedPacks = [];

                for (const zipPath of nestedZips) {
                    try {
                        const zipContent = await jar.readEntry(zipPath);
                        const zipBlob = new Blob([zipContent]);
                        const nestedJar = await openJar(zipBlob);

                        const tags = await this.extractTagsFromJar(nestedJar);
                        const versionInfo = await this.extractVersionInfo(nestedJar);

                        if (tags.size > 0) {
                            const id = this.generateId();
                            const color = this.getNextColor();
                            const packName = zipPath.replace(/\.zip$/i, '').replace(/^.*\//, '');

                            const dataPack = {
                                id,
                                name: packName,
                                color,
                                enabled: true,
                                tags,
                                uploadedAt: Date.now(),
                                ...versionInfo
                            };

                            this.dataPacks.set(id, dataPack);
                            uploadedPacks.push(dataPack);
                        }
                    } catch (err) {
                        console.warn(`Failed to process nested pack ${zipPath}:`, err);
                    }
                }

                if (uploadedPacks.length === 0) {
                    throw new Error('No data packs found');
                }

                return uploadedPacks;
            }


            const tags = await this.extractTagsFromJar(jar);
            const versionInfo = await this.extractVersionInfo(jar);

            if (tags.size === 0) {
                throw new Error('No valid tags found in data pack');
            }

            const id = this.generateId();
            const color = this.getNextColor();

            const dataPack = {
                id,
                name: file.name.replace(/\.zip$/i, ''),
                color,
                enabled: true,
                tags,
                uploadedAt: Date.now(),
                error: null,
                ...versionInfo
            };

            this.dataPacks.set(id, dataPack);

            return dataPack;
        } catch (error) {
            // Instead of throwing, create an errored data pack entry
            const id = this.generateId();
            const color = this.getNextColor();

            const errorPack = {
                id,
                name: file.name.replace(/\.zip$/i, ''),
                color,
                enabled: false,
                tags: new Map(),
                uploadedAt: Date.now(),
                error: error.message || 'Unknown error'
            };

            this.dataPacks.set(id, errorPack);
            return errorPack;
        }
    }

    async extractTagsFromJar(jar) {
        const tagRegex = /^data\/([^/]+)\/tags\/(.*?)\/(.+)\.json$/;
        const tags = new Map();

        for (const path in jar.entries) {
            const match = path.match(tagRegex);
            if (match) {
                try {
                    const content = await jar.readEntry(path);
                    const json = JSON.parse(content);

                    const namespace = match[1];
                    const category = match[2];
                    const namePath = match[3];

                    // Create tag ID: category:namespace:name
                    const tagId = `${category}:${namespace}:${namePath}`;

                    tags.set(tagId, {
                        path,
                        namespace,
                        category,
                        name: namePath,
                        replace: json.replace || false,
                        values: json.values || [],
                        json
                    });
                } catch (e) {
                    console.warn(`Failed to parse tag at ${path}:`, e);
                }
            }
        }

        return tags;
    }

    async extractVersionInfo(jar) {
        try {
            const packMcmetaContent = await jar.readEntry('pack.mcmeta');
            const packMcmeta = JSON.parse(packMcmetaContent);
            const packFormat = VersionChecker.getPackFormat(packMcmeta);
            return {
                packFormat,
                versionWarning: null
            };
        } catch (e) {
            console.warn('Could not read pack.mcmeta:', e);
            return {
                packFormat: null,
                versionWarning: VersionChecker.WARNING_LEVELS.NO_METADATA
            };
        }
    }

    toggleDataPack(id) {
        const pack = this.dataPacks.get(id);
        if (pack) {
            pack.enabled = !pack.enabled;
            return pack.enabled;
        }
        return false;
    }

    removeDataPack(id) {
        const removed = this.dataPacks.delete(id);
        if (removed) {

        }
        return removed;
    }

    getDataPack(id) {
        return this.dataPacks.get(id);
    }

    getAllDataPacks() {
        return Array.from(this.dataPacks.values());
    }

    getEnabledDataPacks() {
        return Array.from(this.dataPacks.values()).filter(pack => pack.enabled);
    }

    getAssignedColor(id) {
        const pack = this.dataPacks.get(id);
        return pack ? pack.color : null;
    }

    clear() {
        this.dataPacks.clear();
        this.colorIndex = 0;

    }

    generateId() {
        return `dp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getNextColor() {
        const color = DATAPACK_COLORS[this.colorIndex % DATAPACK_COLORS.length];
        this.colorIndex++;
        return color;
    }

    updateColor(id, newColor) {
        const pack = this.dataPacks.get(id);
        if (pack) {
            pack.color = newColor;
            return true;
        }
        return false;
    }


}
