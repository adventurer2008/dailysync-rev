import { spawn } from 'child_process';
import path from 'path';
import {
    GARMIN_GLOBAL_PASSWORD_DEFAULT,
    GARMIN_GLOBAL_USERNAME_DEFAULT,
} from './constant';

const getPythonCommand = () => process.env.PYTHON || process.env.PYTHON3 || 'python';

const runGlobalDiLogin = async () => {
    const username = process.env.GARMIN_GLOBAL_USERNAME ?? GARMIN_GLOBAL_USERNAME_DEFAULT;
    const password = process.env.GARMIN_GLOBAL_PASSWORD ?? GARMIN_GLOBAL_PASSWORD_DEFAULT;

    if (!username || !password) {
        throw new Error('GARMIN_GLOBAL_USERNAME and GARMIN_GLOBAL_PASSWORD are required');
    }

    const python = getPythonCommand();
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'garmin_global_di_login.py');
    const outputPath = path.resolve(process.cwd(), 'db', 'garmin_global_di_session.json');

    console.log('Garmin Global: starting DI browser login');
    console.log('A browser window will open. Finish login there; tokens will be saved for future syncs.');

    const child = spawn(python, [scriptPath, '--output', outputPath], {
        env: {
            ...process.env,
            GARMIN_LOGIN_USERNAME: username,
            GARMIN_LOGIN_PASSWORD: password,
        },
        stdio: 'inherit',
    });

    const exitCode = await new Promise<number | null>((resolve) => {
        child.on('close', resolve);
    });

    if (exitCode !== 0) {
        throw new Error(`Garmin Global DI login failed with exit code ${exitCode}`);
    }
};

runGlobalDiLogin().catch((error) => {
    console.error(error);
    process.exit(1);
});

