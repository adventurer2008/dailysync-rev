import { getGaminCNClient } from './utils/garmin_cn';
import { archiveGarminActivities } from './utils/garmin_archive';
import { runTask } from './utils/run_task';

runTask('Archive Garmin CN activities', async () => {
    const client = await getGaminCNClient();
    await archiveGarminActivities({ region: 'cn', client });
});

