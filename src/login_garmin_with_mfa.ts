import { spawn } from 'child_process';
import path from 'path';
import {
    GARMIN_GLOBAL_PASSWORD_DEFAULT,
    GARMIN_GLOBAL_USERNAME_DEFAULT,
    GARMIN_PASSWORD_DEFAULT,
    GARMIN_USERNAME_DEFAULT,
} from './constant';
import { initDB, saveSessionToDB, updateSessionToDB, getSessionFromDB } from './utils/sqlite';

type GarminLoginRegion = 'CN' | 'GLOBAL';

const region = (process.argv[2] ?? 'CN').toUpperCase() as GarminLoginRegion;

const regionConfig = {
    CN: {
        domain: 'garmin.cn',
        username: process.env.GARMIN_USERNAME ?? GARMIN_USERNAME_DEFAULT,
        password: process.env.GARMIN_PASSWORD ?? GARMIN_PASSWORD_DEFAULT,
        label: 'Garmin CN',
    },
    GLOBAL: {
        domain: 'garmin.com',
        username: process.env.GARMIN_GLOBAL_USERNAME ?? GARMIN_GLOBAL_USERNAME_DEFAULT,
        password: process.env.GARMIN_GLOBAL_PASSWORD ?? GARMIN_GLOBAL_PASSWORD_DEFAULT,
        label: 'Garmin Global',
    },
};

const getPythonCommand = () => process.env.PYTHON || process.env.PYTHON3 || 'python';

const parseLoginResult = (stdout: string) => {
    const resultLine = stdout
        .split(/\r?\n/)
        .find((line) => line.startsWith('GARMIN_MFA_LOGIN_RESULT='));

    if (!resultLine) {
        throw new Error('MFA login finished without token output');
    }

    return JSON.parse(resultLine.slice('GARMIN_MFA_LOGIN_RESULT='.length));
};

const runMfaLogin = async () => {
    const config = regionConfig[region];
    if (!config) {
        throw new Error('Usage: yarn login_cn or yarn login_global');
    }

    if (!config.username || !config.password) {
        throw new Error(`${config.label} username and password are required`);
    }

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'garmin_mfa_login.py');
    const python = getPythonCommand();

    console.log(`${config.label}: starting MFA login with ${python}`);
    console.log('If Garmin sends a code, type it below and press Enter.');

    const child = spawn(python, [scriptPath, '--domain', config.domain], {
        env: {
            ...process.env,
            GARMIN_LOGIN_USERNAME: config.username,
            GARMIN_LOGIN_PASSWORD: config.password,
        },
        stdio: ['inherit', 'pipe', 'inherit'],
    });

    let stdout = '';
    child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
    });

    const exitCode = await new Promise<number | null>((resolve) => {
        child.on('close', resolve);
    });

    if (exitCode !== 0) {
        throw new Error(`MFA login failed. Make sure Python has garth installed: ${python} -m pip install garth`);
    }

    const token = parseLoginResult(stdout);
    await initDB();
    const currentSession = await getSessionFromDB(region);
    if (currentSession) {
        await updateSessionToDB(region, token);
    } else {
        await saveSessionToDB(region, token);
    }

    console.log(`${config.label}: MFA login succeeded and session was saved to db/garmin.db`);
};

runMfaLogin().catch((error) => {
    console.error(error);
    process.exit(1);
});

