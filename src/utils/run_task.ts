import { BARK_KEY_DEFAULT } from '../constant';

const axios = require('axios');
const core = require('@actions/core');

const BARK_KEY = process.env.BARK_KEY ?? BARK_KEY_DEFAULT;

export const runTask = async (taskName: string, task: () => Promise<void>) => {
    try {
        await task();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (BARK_KEY) {
            await axios.get(`https://api.day.app/${BARK_KEY}/${taskName} 运行失败了，快去检查！/${message}`);
        }
        core.setFailed(message);
        throw error;
    }
};

