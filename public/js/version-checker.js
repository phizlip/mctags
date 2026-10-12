// Mojang's value for "any minor version":
// https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-9#:~:text=Specifying%20a%20single%20integer%20is%20interpreted%20as%20any%20minor%20version%2C%20i.e.%20the%20minor%20version%20is%200x7fffffff
const MAX_MINOR = 0x7fffffff;

function isVersionNumber(value) {
    return Number.isInteger(value) && value >= 0 && value <= MAX_MINOR;
}

function normalizeVersion(value, defaultMinor = 0) {
    if (isVersionNumber(value)) return { major: value, minor: defaultMinor };
    if (Array.isArray(value) && (value.length === 1 || value.length === 2) &&
        value.every(isVersionNumber)) {
        return { major: value[0], minor: value.length === 2 ? value[1] : defaultMinor };
    }
    return null;
}

function compareVersions(a, b) {
    return a.major - b.major || a.minor - b.minor;
}

function makeRange(min, max) {
    return min && max && compareVersions(min, max) <= 0 ? { min, max } : null;
}

function formatVersion(version) {
    return `${version.major}.${version.minor}`;
}

export const VersionChecker = {
    WARNING_LEVELS: {
        COMPATIBLE: 'compatible',
        VERSION_MISMATCH: 'version_mismatch',
        NO_METADATA: 'no_metadata'
    },

    getPackFormat(packMcmeta) {
        const pack = packMcmeta?.pack;
        if (!pack || typeof pack !== 'object') return null;

        // Use the range when both old and new fields are present.
        // max_format: 88 includes all 88.x versions; [88, 0] only includes 88.0.
        if ('min_format' in pack || 'max_format' in pack) {
            return makeRange(
                normalizeVersion(pack.min_format),
                normalizeVersion(pack.max_format, MAX_MINOR)
            );
        }

        if (!isVersionNumber(pack.pack_format)) return null;
        const supported = pack.supported_formats;
        if (supported !== undefined) {
            let min;
            let max;
            if (isVersionNumber(supported)) {
                min = max = supported;
            } else if (Array.isArray(supported) && supported.length === 2) {
                [min, max] = supported;
            } else if (supported && typeof supported === 'object' && !Array.isArray(supported)) {
                min = supported.min_inclusive;
                max = supported.max_inclusive;
            }
            if (!isVersionNumber(min) || !isVersionNumber(max) ||
                pack.pack_format < min || pack.pack_format > max) return null;
            return makeRange(normalizeVersion(min), normalizeVersion(max, MAX_MINOR));
        }

        return makeRange(
            normalizeVersion(pack.pack_format),
            normalizeVersion(pack.pack_format, MAX_MINOR)
        );
    },

    checkCompatibility(packFormat, expectedFormat) {
        const range = typeof packFormat === 'number' ?
            makeRange(normalizeVersion(packFormat), normalizeVersion(packFormat, MAX_MINOR)) : packFormat;
        const expected = expectedFormat && typeof expectedFormat === 'object' ?
            normalizeVersion([expectedFormat.major, expectedFormat.minor ?? 0]) : normalizeVersion(expectedFormat);

        if (!range || !range.min || !range.max || !expected) {
            return this.WARNING_LEVELS.NO_METADATA;
        }

        return compareVersions(expected, range.min) >= 0 && compareVersions(expected, range.max) <= 0 ?
            this.WARNING_LEVELS.COMPATIBLE : this.WARNING_LEVELS.VERSION_MISMATCH;
    },

    getWarningMessage(warningLevel, packFormat, expectedFormat) {
        switch (warningLevel) {
            case this.WARNING_LEVELS.VERSION_MISMATCH: {
                let supported = `Pack Format ${packFormat}`;
                if (packFormat && typeof packFormat === 'object') {
                    const min = formatVersion(packFormat.min);
                    const max = packFormat.max.minor === MAX_MINOR ?
                        `${packFormat.max.major} (any minor version)` : formatVersion(packFormat.max);
                    supported = `Supported Pack Formats: ${min} – ${max}`;
                }
                const expected = typeof expectedFormat === 'object' && expectedFormat !== null ?
                    formatVersion({ major: expectedFormat.major, minor: expectedFormat.minor ?? 0 }) : expectedFormat;

                return {
                    title: 'Incompatible Pack Format',
                    body: `${supported}\nSelected Version: Pack Format ${expected}\n\nThis data pack may not work correctly in the selected Minecraft version.`,
                    color: 'orange'
                };
            }

            case this.WARNING_LEVELS.NO_METADATA:
                return {
                    title: 'Cannot Verify Version',
                    body: 'This data pack has missing or invalid pack version metadata, or the selected Minecraft version has an unknown pack format.\n\nCannot determine version compatibility.',
                    color: 'yellow'
                };

            case this.WARNING_LEVELS.COMPATIBLE:
            default:
                return null;
        }
    },
};
