#!/usr/bin/env python3
"""
get-info-gmail-token.py: the one-time sign-in AS info@tararosesalon.com that lets the Supabase function oos-dbd-draft put the DBD order email, with DBD's own order forms
attached, in the info@ DRAFTS (Kate, 26 Nov 2026: "autofill dapat" and "no need downloading not unless needed"). The scope is gmail.compose: it can create drafts. The function
never sends; a person reads the draft in Gmail and presses Send.

It uses the SAME Internal OAuth client as recruit-mail-sync, website-sync and google-ads-sync ("Ads and Analytics Sync", Cloud project trs-marketing-reports), read from
~/.trs-marketing/google-token.json (client_id and client_secret only; nothing from that file is printed). The Gmail API is already enabled in that project (recruit-mail-sync uses it).

Run it in PowerShell:   cd D:\\WORK\\Claude\\claude-cowork-build\\tararosesalon-dashboard-all-main; $env:PYTHONUTF8 = "1"; py scripts\\get-info-gmail-token.py
A browser opens: sign in as info@tararosesalon.com and allow "Manage drafts and send emails". The script checks that the signed-in mailbox really is info@ (it refuses anything else),
saves the refresh token to ~/.trs-marketing/info-gmail-token.json (never in the repo), and tells you the one place to paste it: Supabase, project gvijxenafoowajqktqvd,
Edge Functions, Secrets, name INFO_GMAIL_REFRESH_TOKEN. The token is never printed.
"""
import json
import os
import sys

ROOT = os.path.expanduser('~/.trs-marketing')
SRC = os.path.join(ROOT, 'google-token.json')
OUT = os.path.join(ROOT, 'info-gmail-token.json')
BOX = 'info@tararosesalon.com'
SCOPES = ['https://www.googleapis.com/auth/gmail.compose']


def main():
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError:
        sys.exit('The Google libraries are missing. Use the same Python as the gmail-multi tool (py), which has them.')
    if not os.path.exists(SRC):
        sys.exit('Could not find ' + SRC + ' (it holds the Ads and Analytics Sync client).')
    src = json.load(open(SRC, encoding='utf-8'))
    cfg = {'installed': {'client_id': src['client_id'], 'client_secret': src['client_secret'],
                         'auth_uri': 'https://accounts.google.com/o/oauth2/auth', 'token_uri': 'https://oauth2.googleapis.com/token',
                         'redirect_uris': ['http://localhost']}}
    flow = InstalledAppFlow.from_client_config(cfg, SCOPES)
    print('A browser window opens. Sign in as ' + BOX + ' and allow it to create email drafts.')
    creds = flow.run_local_server(port=0, login_hint=BOX, access_type='offline', prompt='consent', open_browser=True)
    if not creds.refresh_token:
        sys.exit('Google did not give a refresh token. Run it again and tick the permission box on the consent screen.')
    who = build('gmail', 'v1', credentials=creds, cache_discovery=False).users().getProfile(userId='me').execute().get('emailAddress', '')
    if who.lower() != BOX:
        sys.exit('You signed in as ' + (who or 'an unknown account') + ', not ' + BOX + '. Nothing was saved. Run it again and pick info@.')
    os.makedirs(ROOT, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'account': who, 'scopes': SCOPES, 'refresh_token': creds.refresh_token}, f)
    try:
        os.chmod(OUT, 0o600)
    except OSError:
        pass
    print('Signed in as ' + who + '. The token is saved in ' + OUT + ' (not printed, not in the repo).')
    print('Last step: open that file in Notepad, copy the long value after "refresh_token", and paste it in Supabase, project gvijxenafoowajqktqvd,')
    print('Edge Functions, Secrets, as a new secret named INFO_GMAIL_REFRESH_TOKEN. Then press Email order to DBD on the Out of Stock page: the draft appears in info@ with the forms attached.')


if __name__ == '__main__':
    main()
