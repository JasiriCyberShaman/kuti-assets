import requests
import base64
import json

# --- CONFIGURATION ---
GITHUB_TOKEN = "your_github_pat_here"
REPO_OWNER = "bryantgill"
REPO_NAME = "shaman-assets"
FILE_PATH = "index.html" # The file we are updating

def get_current_ngrok_url():
    try:
        # ngrok runs a local API at this address while active
        response = requests.get("http://127.0.0.1:4040/api/tunnels")
        data = response.json()
        # Look for the 'tcp' or 'https' tunnel depending on your config
        # For WSS, we usually want the https forwarding address
        public_url = data['tunnels'][0]['public_url']
        return public_url.replace("https://", "wss://")
    except Exception as e:
        print(f"⚠️ Could not fetch ngrok URL: {e}")
        return None

def update_github_config(new_wss_url):
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/contents/{FILE_PATH}"
    headers = {"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github.v3+json"}

    # 1. Get the current file content and its 'sha' (required by GitHub to update)
    r = requests.get(url, headers=headers)
    file_data = r.json()
    content = base64.b64decode(file_data['content']).decode('utf-8')
    sha = file_data['sha']

    # 2. Use Regex to swap out the old NGROK_BRIDGE_URL
    import re
    pattern = r"const NGROK_BRIDGE_URL = '.*?';"
    new_line = f"const NGROK_BRIDGE_URL = '{new_wss_url}';"
    updated_content = re.sub(pattern, new_line, content)

    # 3. Push the update back to GitHub
    payload = {
        "message": "🤖 Auto-sync: Update Neural Link URL",
        "content": base64.b64encode(updated_content.encode('utf-8')).decode('utf-8'),
        "sha": sha
    }
    
    put_r = requests.put(url, headers=headers, data=json.dumps(payload))
    if put_r.status_code == 200:
        print(f"✅ GitHub Synced: Kuti Neural Link is now at {new_wss_url}")
    else:
        print(f"❌ GitHub Sync Failed: {put_r.text}")

if __name__ == "__main__":
    url = get_current_ngrok_url()
    if url:
        update_github_config(url)