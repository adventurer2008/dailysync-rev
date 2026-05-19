import { getGaminGlobalClient } from './utils/garmin_global';
import { archiveGarminActivities } from './utils/garmin_archive';
import { runTask } from './utils/run_task';

runTask('Archive Garmin Global activities', async () => {
    const client = await getGaminGlobalClient();
    await archiveGarminActivities({ region: 'global', client });
});

