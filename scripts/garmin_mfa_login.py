import argparse
import dataclasses
import json
import os
import sys
from datetime import datetime

import garth


def json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def prompt_mfa():
    print("Enter Garmin MFA code: ", end="", file=sys.stderr, flush=True)
    return sys.stdin.readline().strip()


def main():
    parser = argparse.ArgumentParser(description="Login to Garmin with MFA support and print OAuth tokens.")
    parser.add_argument("--domain", choices=["garmin.cn", "garmin.com"], required=True)
    args = parser.parse_args()

    username = os.environ.get("GARMIN_LOGIN_USERNAME")
    password = os.environ.get("GARMIN_LOGIN_PASSWORD")

    if not username or not password:
        raise SystemExit("GARMIN_LOGIN_USERNAME and GARMIN_LOGIN_PASSWORD are required")

    garth.configure(domain=args.domain)
    oauth1, oauth2 = garth.login(username, password, prompt_mfa=prompt_mfa)

    result = {
        "oauth1": dataclasses.asdict(oauth1),
        "oauth2": dataclasses.asdict(oauth2),
    }

    print("GARMIN_MFA_LOGIN_RESULT=" + json.dumps(result, default=json_default, separators=(",", ":")))


if __name__ == "__main__":
    main()

