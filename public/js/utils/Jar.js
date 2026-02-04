import JSZip from 'jszip';

export async function openJar(blob) {
    const zip = await JSZip.loadAsync(blob);
    return new JarImpl(zip);
}

class JarImpl {
    constructor(zip) {
        this.zip = zip;
        // JSZip v3 'files' is an object { "path/to/file": Object, ... }
        this.entries = zip.files;
    }

    async readEntry(path) {
        const entry = this.zip.file(path);
        if (!entry) throw new Error(`Entry not found: ${path}`);
        return await entry.async('string');
    }
}
