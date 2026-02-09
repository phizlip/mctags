export const VersionChecker = {
    // Warning levels
    WARNING_LEVELS: {
        COMPATIBLE: 'compatible',
        VERSION_MISMATCH: 'version_mismatch',
        NO_METADATA: 'no_metadata'
    },

    getPackFormat(packMcmeta) {
        try {
            return packMcmeta?.pack?.pack_format || null;
        } catch (e) {
            return null;
        }
    },

    checkCompatibility(packFormat, expectedFormat) {
        if (packFormat === null || packFormat === undefined) {
            return this.WARNING_LEVELS.NO_METADATA;
        }

        if (expectedFormat === null || expectedFormat === undefined) {
            return this.WARNING_LEVELS.COMPATIBLE;
        }

        if (packFormat == expectedFormat) {
            return this.WARNING_LEVELS.COMPATIBLE;
        }

        return this.WARNING_LEVELS.VERSION_MISMATCH;
    },

    getWarningMessage(warningLevel, packFormat, expectedFormat) {
        switch (warningLevel) {
            case this.WARNING_LEVELS.VERSION_MISMATCH:
                const madeFor = `Pack Format ${packFormat}`;
                const expected = expectedFormat ? `Selected Version: Pack Format ${expectedFormat}` : 'Selected Version: Unknown Format';

                return {
                    title: 'Incompatible Pack Format',
                    body: `${madeFor}\n${expected}\n\nThis data pack may not work correctly in the selected Minecraft version.`,
                    color: 'orange'
                };

            case this.WARNING_LEVELS.NO_METADATA:
                return {
                    title: 'Cannot Verify Version',
                    body: 'This data pack is missing pack.mcmeta or has an invalid pack_format value.\n\nCannot determine version compatibility.',
                    color: 'yellow'
                };

            case this.WARNING_LEVELS.COMPATIBLE:
            default:
                return null;
        }
    },
};
