import fs from 'fs';
import path from 'path';

export type BrowserRegion = 'CN' | 'GLOBAL';

export const browserRegions: Record<BrowserRegion, { domain: string; label: string }> = {
    CN: { domain: 'garmin.cn', label: 'Garmin CN' },
    GLOBAL: { domain: 'garmin.com', label: 'Garmin Global' },
};

export const getBrowserRegion = (): BrowserRegion => {
    const region = (process.argv[2] ?? 'CN').toUpperCase();
    if (region !== 'CN' && region !== 'GLOBAL') {
        throw new Error('Region must be CN or GLOBAL');
    }

    return region;
};

export const getBrowserSessionDir = () => path.resolve(process.cwd(), '.garmin-browser');

export const getBrowserStoragePath = (region: BrowserRegion) =>
    path.join(getBrowserSessionDir(), `${region.toLowerCase()}.storage.json`);

export const ensureBrowserSessionDir = () => {
    const sessionDir = getBrowserSessionDir();
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }
};

export const assertBrowserStorageExists = (region: BrowserRegion) => {
    const storagePath = getBrowserStoragePath(region);
    if (!fs.existsSync(storagePath)) {
        throw new Error(`Browser session not found: ${storagePath}. Run yarn browser_login_${region.toLowerCase()} first.`);
    }

    return storagePath;
};

