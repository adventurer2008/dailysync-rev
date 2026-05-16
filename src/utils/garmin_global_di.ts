import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';

const DI_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
const CONNECT_API = 'https://connectapi.garmin.com';
const REFRESH_SAFETY_MARGIN_SECONDS = 300;
const DI_CLIENT_IDS = [
    'GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2',
    'GARMIN_CONNECT_MOBILE_ANDROID_DI_2024Q4',
    'GARMIN_CONNECT_MOBILE_ANDROID_DI',
];

type GarminDiToken = {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    refresh_expires_at: number;
};

type GarminDiSession = {
    di_token: GarminDiToken;
};

const getSessionPath = () =>
    process.env.GARMIN_GLOBAL_DI_SESSION_PATH ||
    path.resolve(process.cwd(), 'db', 'garmin_global_di_session.json');

const getBasicAuthHeader = (clientId: string) => {
    const token = Buffer.from(`${clientId}:`).toString('base64');
    return `Basic ${token}`;
};

const readSession = (): GarminDiSession | undefined => {
    const sessionPath = getSessionPath();
    if (!fs.existsSync(sessionPath)) {
        return undefined;
    }

    return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
};

const writeSession = (session: GarminDiSession) => {
    const sessionPath = getSessionPath();
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
};

const refreshToken = async (token: GarminDiToken): Promise<GarminDiToken> => {
    const now = Math.floor(Date.now() / 1000);

    for (const clientId of DI_CLIENT_IDS) {
        try {
            const response = await axios.post(
                DI_TOKEN_URL,
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: token.refresh_token,
                    client_id: clientId,
                }).toString(),
                {
                    headers: {
                        authorization: getBasicAuthHeader(clientId),
                        'content-type': 'application/x-www-form-urlencoded',
                    },
                },
            );

            return {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token ?? token.refresh_token,
                expires_at: now + response.data.expires_in,
                refresh_expires_at: now + (response.data.refresh_token_expires_in ?? 86400 * 365),
            };
        } catch (error) {
            console.log(`GarminGlobalDI: refresh failed with client ${clientId}, trying next`);
        }
    }

    throw new Error('GarminGlobalDI: failed to refresh DI token. Run yarn login_global_di');
};

export class GarminGlobalDiClient {
    private token: GarminDiToken;

    private constructor(token: GarminDiToken) {
        this.token = token;
    }

    static async create() {
        const session = readSession();
        if (!session?.di_token) {
            throw new Error('GarminGlobalDI: missing db/garmin_global_di_session.json. Run yarn login_global_di');
        }

        const now = Math.floor(Date.now() / 1000);
        if (session.di_token.refresh_expires_at <= now + REFRESH_SAFETY_MARGIN_SECONDS) {
            throw new Error('GarminGlobalDI: refresh token expired. Run yarn login_global_di');
        }

        if (session.di_token.expires_at <= now + REFRESH_SAFETY_MARGIN_SECONDS) {
            console.log('GarminGlobalDI: refreshing access token');
            session.di_token = await refreshToken(session.di_token);
            writeSession(session);
        }

        return new GarminGlobalDiClient(session.di_token);
    }

    private getHeaders() {
        return {
            authorization: `Bearer ${this.token.access_token}`,
            'user-agent': 'GCM-Android-5.23',
            'x-garmin-client-platform': 'Android',
            'x-app-ver': '10861',
            'x-lang': 'en',
        };
    }

    async getUserProfile() {
        const response = await axios.get(`${CONNECT_API}/userprofile-service/socialProfile`, {
            headers: this.getHeaders(),
        });
        return response.data;
    }

    async getActivities(start: number, limit: number) {
        const response = await axios.get(`${CONNECT_API}/activitylist-service/activities/search/activities`, {
            headers: this.getHeaders(),
            params: { start, limit },
        });
        return response.data;
    }

    async uploadActivity(filePath: string) {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));

        const response = await axios.post(`${CONNECT_API}/upload-service/upload`, form, {
            headers: {
                ...this.getHeaders(),
                ...form.getHeaders(),
            },
        });
        return response.data;
    }
}

export const getGaminGlobalDiClient = async () => {
    const client = await GarminGlobalDiClient.create();
    const userInfo = await client.getUserProfile();
    const { fullName, userName: emailAddress, location } = userInfo;
    if (!emailAddress) {
        throw Error('佳明国际区 DI 登录失败，请运行 yarn login_global_di');
    }
    console.log('Garmin userInfo global DI', { fullName, emailAddress, location });
    return client;
};

