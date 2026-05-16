import argparse
import base64
import json
import os
import time
from pathlib import Path

import httpx

DI_TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token"
DI_GRANT_TYPE = "https://connectapi.garmin.com/di-oauth2-service/oauth/grant/service_ticket"
SERVICE_URL = "https://mobile.integration.garmin.com/gcm/android"
SSO_LOGIN_URL = (
    "https://sso.garmin.com/mobile/sso/en_US/sign-in"
    "?clientId=GCM_ANDROID_DARK"
    "&service=https://mobile.integration.garmin.com/gcm/android"
)
DI_CLIENT_IDS = [
    "GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2",
    "GARMIN_CONNECT_MOBILE_ANDROID_DI_2024Q4",
    "GARMIN_CONNECT_MOBILE_ANDROID_DI",
]


def basic_auth_header(client_id):
    encoded = base64.b64encode(f"{client_id}:".encode()).decode()
    return f"Basic {encoded}"


def browser_login(email, password):
    from playwright.sync_api import sync_playwright

    captured_ticket = []

    def handle_login_capture(_source, result_json):
        try:
            data = json.loads(result_json) if isinstance(result_json, str) else result_json
            if data.get("responseStatus", {}).get("type") == "SUCCESSFUL":
                ticket = data.get("serviceTicketId")
                if ticket:
                    captured_ticket.append(ticket)
        except Exception:
            pass

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Linux; Android 13; sdk_gphone64_arm64)"
                " AppleWebKit/537.36 (KHTML, like Gecko)"
                " Chrome/121.0.0.0 Mobile Safari/537.36"
            ),
            viewport={"width": 412, "height": 915},
            is_mobile=True,
        )
        context.expose_binding("captureGarminLogin", lambda source, data: handle_login_capture(source, data))
        context.add_init_script(
            """
            (function() {
                const originalFetch = window.fetch;
                window.fetch = async function(...args) {
                    const response = await originalFetch.apply(this, args);
                    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
                    if (url.includes('/mobile/api/login')) {
                        try {
                            const clone = response.clone();
                            const data = await clone.json();
                            window.captureGarminLogin(JSON.stringify(data));
                        } catch(e) {}
                    }
                    return response;
                };

                const origOpen = XMLHttpRequest.prototype.open;
                const origSend = XMLHttpRequest.prototype.send;
                XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                    this._url = url;
                    return origOpen.call(this, method, url, ...rest);
                };
                XMLHttpRequest.prototype.send = function(...args) {
                    this.addEventListener('load', function() {
                        if (this._url && this._url.includes('/mobile/api/login')) {
                            try {
                                window.captureGarminLogin(this.responseText);
                            } catch(e) {}
                        }
                    });
                    return origSend.apply(this, args);
                };
            })();
            """
        )

        page = context.new_page()
        page.goto(SSO_LOGIN_URL, wait_until="domcontentloaded", timeout=60000)

        for selector in ["input[name='username']", "input[name='email']", "#username", "#email"]:
            element = page.query_selector(selector)
            if element and element.is_visible():
                element.fill(email)
                break

        for selector in ["input[name='password']", "#password"]:
            element = page.query_selector(selector)
            if element and element.is_visible():
                element.fill(password)
                break

        for selector in ["button[type='submit']", "#login-btn-signin", "button.btn-primary"]:
            element = page.query_selector(selector)
            if element and element.is_visible():
                element.click()
                break

        print("Complete Garmin Global login in the browser window if prompted.", flush=True)
        for _ in range(360):
            if captured_ticket:
                break
            page.wait_for_timeout(500)

        browser.close()

    if not captured_ticket:
        raise RuntimeError("Garmin Global browser login finished without a service ticket")

    return captured_ticket[0]


def exchange_ticket(service_ticket):
    now = time.time()
    for client_id in DI_CLIENT_IDS:
        response = httpx.post(
            DI_TOKEN_URL,
            headers={
                "authorization": basic_auth_header(client_id),
                "content-type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": DI_GRANT_TYPE,
                "service_ticket": service_ticket,
                "service_url": SERVICE_URL,
                "client_id": client_id,
            },
            timeout=30.0,
        )
        if response.status_code == 200:
            data = response.json()
            return {
                "access_token": data["access_token"],
                "refresh_token": data["refresh_token"],
                "expires_at": now + data["expires_in"],
                "refresh_expires_at": now + data.get("refresh_token_expires_in", 86400 * 365),
            }

    raise RuntimeError("Failed to exchange Garmin Global service ticket for DI OAuth2 tokens")


def main():
    parser = argparse.ArgumentParser(description="Login to Garmin Global and save DI OAuth2 tokens.")
    parser.add_argument("--output", default="db/garmin_global_di_session.json")
    args = parser.parse_args()

    email = os.environ.get("GARMIN_LOGIN_USERNAME")
    password = os.environ.get("GARMIN_LOGIN_PASSWORD")
    if not email or not password:
        raise SystemExit("GARMIN_LOGIN_USERNAME and GARMIN_LOGIN_PASSWORD are required")

    ticket = browser_login(email, password)
    token = exchange_ticket(ticket)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps({"di_token": token}, indent=2), encoding="utf8")
    print(f"Garmin Global DI session saved to {output_path}")


if __name__ == "__main__":
    main()

