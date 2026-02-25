"""
One-time Gmail OAuth2 setup script.

Run from the repo root:
    python scripts/run_gmail_auth.py

Prerequisites:
  1. Go to https://console.cloud.google.com
  2. Create a project → Enable Gmail API
  3. Create OAuth 2.0 Credentials (Desktop app type)
  4. Download the credentials JSON file and save it as 'credentials.json' in the repo root

This script will open a browser for consent, then write 'token.json' to the repo root.

After running, paste the contents of both files into Vercel environment variables:
  GMAIL_CREDENTIALS = contents of credentials.json
  GMAIL_OAUTH_TOKEN = contents of token.json
"""

from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
REPO_ROOT = Path(__file__).resolve().parent.parent

creds_path = REPO_ROOT / "credentials.json"
token_path = REPO_ROOT / "token.json"

if not creds_path.exists():
    print(f"ERROR: credentials.json not found at {creds_path}")
    print("Download it from Google Cloud Console → APIs & Services → Credentials")
    exit(1)

print("Opening browser for Gmail OAuth consent...")
flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
creds = flow.run_local_server(port=0)

with open(token_path, "w") as f:
    f.write(creds.to_json())

print(f"\ntoken.json written to {token_path}")
print("\nNext steps:")
print("  1. In Vercel dashboard → Settings → Environment Variables, add:")
print(f"     GMAIL_CREDENTIALS = {creds_path.read_text()[:50]}...")
print(f"     GMAIL_OAUTH_TOKEN  = {token_path.read_text()[:50]}...")
print("  2. Set GMAIL_FROM_EMAIL to your Gmail address")
