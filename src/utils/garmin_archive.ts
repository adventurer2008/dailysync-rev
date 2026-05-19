import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const decompress = require('decompress');

type ArchiveRegion = 'cn' | 'global';

type ArchiveOptions = {
    region: ArchiveRegion;
    client: any;
    pageSize?: number;
    maxActivities?: number;
};

const ARCHIVE_ROOT = process.env.GARMIN_ARCHIVE_DIR || './data';
const DEFAULT_PAGE_SIZE = Number(process.env.GARMIN_ARCHIVE_PAGE_SIZE || 50);
const DEFAULT_MAX_ACTIVITIES = process.env.GARMIN_ARCHIVE_MAX_ACTIVITIES
    ? Number(process.env.GARMIN_ARCHIVE_MAX_ACTIVITIES)
    : undefined;

const ensureDir = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const getArchiveDB = async () => {
    ensureDir(ARCHIVE_ROOT);
    const db = await open({
        filename: path.join(ARCHIVE_ROOT, 'archive.db'),
        driver: sqlite3.Database,
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS garmin_activity_archive (
            region TEXT NOT NULL,
            activity_id TEXT NOT NULL,
            activity_name TEXT,
            activity_type TEXT,
            start_time_local TEXT,
            raw_dir TEXT,
            zip_path TEXT,
            extracted_files TEXT,
            metadata TEXT NOT NULL,
            archived_at TEXT NOT NULL,
            PRIMARY KEY (region, activity_id)
        )
    `);

    return db;
};

const getActivityId = (activity: Record<string, any>) => String(activity.activityId || activity.activity_id || '');

const getActivityYear = (activity: Record<string, any>) => {
    const start = String(activity.startTimeLocal || activity.startTimeGMT || activity.beginTimestamp || '');
    const year = start.slice(0, 4);
    return /^\d{4}$/.test(year) ? year : 'unknown-year';
};

const sanitizeName = (value: string) =>
    value
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80);

const getActivityDir = (region: ArchiveRegion, activity: Record<string, any>) => {
    const activityId = getActivityId(activity);
    const start = sanitizeName(String(activity.startTimeLocal || 'unknown-time'));
    const name = sanitizeName(String(activity.activityName || 'activity'));
    return path.join(ARCHIVE_ROOT, `garmin-${region}`, 'raw', getActivityYear(activity), `${start}_${activityId}_${name}`);
};

const appendMetadataJsonl = (region: ArchiveRegion, activity: Record<string, any>) => {
    const metadataDir = path.join(ARCHIVE_ROOT, `garmin-${region}`, 'metadata');
    ensureDir(metadataDir);
    const metadataPath = path.join(metadataDir, 'activities.jsonl');
    fs.appendFileSync(metadataPath, JSON.stringify({
        archivedAt: new Date().toISOString(),
        region,
        activity,
    }) + '\n');
};

const downloadAndExtractActivity = async (region: ArchiveRegion, client: any, activity: Record<string, any>) => {
    const activityId = getActivityId(activity);
    const activityDir = getActivityDir(region, activity);
    ensureDir(activityDir);

    const detailedActivity = await client.getActivity({ activityId });
    await client.downloadOriginalActivityData(detailedActivity, activityDir);

    const zipPath = path.join(activityDir, `${activityId}.zip`);
    const extracted = fs.existsSync(zipPath)
        ? await decompress(zipPath, activityDir)
        : [];

    const extractedFiles = extracted.map((file: Record<string, any>) => path.join(activityDir, file.path));

    return { activityDir, zipPath, extractedFiles };
};

export const archiveGarminActivities = async ({
    region,
    client,
    pageSize = DEFAULT_PAGE_SIZE,
    maxActivities = DEFAULT_MAX_ACTIVITIES,
}: ArchiveOptions) => {
    const db = await getArchiveDB();

    let start = 0;
    let archivedCount = 0;
    let skippedCount = 0;
    let scannedCount = 0;

    while (maxActivities === undefined || scannedCount < maxActivities) {
        const currentLimit = maxActivities === undefined
            ? pageSize
            : Math.min(pageSize, maxActivities - scannedCount);

        if (currentLimit <= 0) {
            break;
        }

        console.log(`Archive ${region}: fetching activities start=${start}, limit=${currentLimit}`);
        const activities = await client.getActivities(start, currentLimit);
        if (!activities || activities.length === 0) {
            break;
        }

        for (const activity of activities) {
            scannedCount++;
            const activityId = getActivityId(activity);
            if (!activityId) {
                console.log('Archive: skip activity without activityId');
                continue;
            }

            const existing = await db.get(
                'SELECT activity_id FROM garmin_activity_archive WHERE region = ? AND activity_id = ?',
                region,
                activityId,
            );

            if (existing) {
                skippedCount++;
                continue;
            }

            console.log(`Archive ${region}: downloading ${activityId} ${activity.activityName || ''} ${activity.startTimeLocal || ''}`);
            const { activityDir, zipPath, extractedFiles } = await downloadAndExtractActivity(region, client, activity);
            const archivedAt = new Date().toISOString();

            await db.run(
                `INSERT INTO garmin_activity_archive
                 (region, activity_id, activity_name, activity_type, start_time_local, raw_dir, zip_path, extracted_files, metadata, archived_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                region,
                activityId,
                activity.activityName || '',
                activity.activityType?.typeKey || activity.activityType?.typeId || '',
                activity.startTimeLocal || '',
                activityDir,
                zipPath,
                JSON.stringify(extractedFiles),
                JSON.stringify(activity),
                archivedAt,
            );
            appendMetadataJsonl(region, activity);
            archivedCount++;
        }

        if (activities.length < currentLimit) {
            break;
        }
        start += activities.length;
    }

    console.log(`Archive ${region}: scanned=${scannedCount}, archived=${archivedCount}, skipped=${skippedCount}`);
};
