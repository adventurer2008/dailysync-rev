import readline from 'readline';
import {
    browserRegions,
    ensureBrowserSessionDir,
    getBrowserRegion,
    getBrowserStoragePath,
} from './utils/browser_session';

const { chromium } = require('playwright');

const waitForEnter = () =>
    new Promise<void>((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('After Garmin is fully logged in in the browser, press Enter here to save the session.', () => {
            rl.close();
            resolve();
        });
    });

const runBrowserLogin = async () => {
    const region = getBrowserRegion();
    const config = browserRegions[region];
    const storagePath = getBrowserStoragePath(region);

    ensureBrowserSessionDir();

    console.log(`${config.label}: opening browser login.`);
    console.log(`Session will be saved to ${storagePath}`);

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`https://connect.${config.domain}/modern`, { waitUntil: 'domcontentloaded' });
    await waitForEnter();
    await context.storageState({ path: storagePath });
    await browser.close();

    console.log(`${config.label}: browser session saved.`);
};

runBrowserLogin().catch((error) => {
    console.error(error);
    process.exit(1);
});
