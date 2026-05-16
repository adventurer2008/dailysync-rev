import {
    assertBrowserStorageExists,
    browserRegions,
    getBrowserRegion,
} from './utils/browser_session';

const { chromium } = require('playwright');

const browserFetchJson = async (page: any, url: string) => {
    return await page.evaluate(async (requestUrl) => {
        const response = await fetch(requestUrl, {
            credentials: 'include',
            headers: {
                accept: 'application/json',
                nk: 'NT',
            },
        });
        const text = await response.text();
        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            body: text ? JSON.parse(text) : null,
        };
    }, url);
};

const runBrowserCheck = async () => {
    const region = getBrowserRegion();
    const config = browserRegions[region];
    const storagePath = assertBrowserStorageExists(region);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: storagePath });
    const page = await context.newPage();

    await page.goto(`https://connect.${config.domain}/modern`, { waitUntil: 'domcontentloaded' });

    const profile = await browserFetchJson(
        page,
        `https://connectapi.${config.domain}/userprofile-service/socialProfile`,
    );
    const activities = await browserFetchJson(
        page,
        `https://connectapi.${config.domain}/activitylist-service/activities/search/activities?start=0&limit=1`,
    );

    await browser.close();

    console.log(JSON.stringify({
        region,
        profileStatus: profile.status,
        profile: profile.body
            ? {
                fullName: profile.body.fullName,
                userName: profile.body.userName,
                location: profile.body.location,
            }
            : null,
        activitiesStatus: activities.status,
        latestActivity: Array.isArray(activities.body) ? activities.body[0] : activities.body,
    }, null, 2));

    if (!profile.ok || !activities.ok) {
        throw new Error(`${config.label}: browser session check failed`);
    }
};

runBrowserCheck().catch((error) => {
    console.error(error);
    process.exit(1);
});
