import fs from 'fs';
import path from 'path';

const parseEnvValue = (value: string) => {
    const trimmedValue = value.trim().replace(/;$/, '');
    const firstChar = trimmedValue[0];
    const lastChar = trimmedValue[trimmedValue.length - 1];

    if ((firstChar === '"' && lastChar === '"') || (firstChar === '\'' && lastChar === '\'')) {
        return trimmedValue.slice(1, -1);
    }

    return trimmedValue;
};

export const loadDotEnv = () => {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
        return;
    }

    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    lines.forEach((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            return;
        }

        const separatorIndex = trimmedLine.indexOf('=');
        if (separatorIndex === -1) {
            return;
        }

        const name = trimmedLine.slice(0, separatorIndex).trim();
        const value = parseEnvValue(trimmedLine.slice(separatorIndex + 1));
        if (!process.env[name]) {
            process.env[name] = value;
        }
    });
};

