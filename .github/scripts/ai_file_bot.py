"""
AI File Bot for GitHub Actions

Commands supported in issue comments:
  /ai-bot upload <path>
  /ai-bot delete <path>
  /ai-bot delete: .
  /ai-bot delete: public/
  /ai-bot apply-map

Behavior:
- 'delete: .' empties the repo by deleting every tracked file and directory except .git metadata.
- 'delete: public/' deletes only the public/ directory recursively.
- 'upload' creates or updates a single file.
- 'apply-map' downloads a ZIP and writes files matching mapping config.
- Replies to the issue with success/failure output.

Safety:
- Restricted to OWNER only.
- Uses GITHUB_TOKEN to modify repo contents.
"""

import os
import io
import re
import sys
import json
import base64
import fnmatch
import zipfile
import requests
import yaml

from github import Github, GithubException

EVENT_PATH = os.environ.get("GITHUB_EVENT_PATH")
TOKEN = os.environ.get("GITHUB_TOKEN")
REPO_NAME = os.environ.get("GITHUB_REPOSITORY")

if not (EVENT_PATH and TOKEN and REPO_NAME):
    print("Missing required environment variables. Exiting.")
    sys.exit(1)

with open(EVENT_PATH, "r", encoding="utf-8") as f:
    event = json.load(f)

comment = event.get("comment", {})
body = comment.get("body", "")
issue = event.get("issue") or {}
issue_number = issue.get("number")

def post_reply(msg):
    if issue_number:
        try:
            repo = g.get_repo(REPO_NAME)
            repo.get_issue(issue_number).create_comment(msg)
        except Exception as e:
            print(f"Failed to post reply: {e}")
    else:
        print(msg)

# Only OWNER can trigger this bot.
ALLOWED = {"OWNER"}
author_assoc = comment.get("author_association", "")
if author_assoc not in ALLOWED:
    post_reply(f"❌ You are not allowed to use this bot. Required association: OWNER. Your association: {author_assoc}")
    print(f"Blocked author association: {author_assoc}")
    sys.exit(0)

# Initialize repo client after auth check
try:
    g = Github(TOKEN)
    repo = g.get_repo(REPO_NAME)
except Exception as e:
    print(f"Failed to initialize repo client: {e}")
    sys.exit(1)


def get_file_sha(path):
    try:
        item = repo.get_contents(path)
        return item.sha
    except GithubException as e:
        if e.status == 404:
            return None
        raise


def put_file(path, content_bytes, message, sha=None):
    b64 = base64.b64encode(content_bytes).decode("utf-8")
    data = {
        "message": message,
        "content": b64,
    }
    if sha:
        data["sha"] = sha
    repo.create_file(path, message, b64) if sha is None else repo.update_file(path, message, b64, sha)


def delete_file(path, message, sha):
    repo.delete_file(path, message, sha)


def list_repo_contents(path=""):
    try:
        items = repo.get_contents(path)
        if isinstance(items, list):
            return items
        return [items]
    except GithubException as e:
        if e.status == 404:
            return []
        raise


def delete_path_recursive(path):
    """Delete a file or a directory recursively from repo."""
    items = list_repo_contents(path)
    if not items:
        return []

    deleted = []
    for item in items:
        if item.type == "dir":
            child_deleted = delete_path_recursive(item.path)
            deleted.extend(child_deleted)
            # delete dir itself via Git tree not direct contents API, since dir is not a file entry
            # The tree API is not used here; instead we'll clear repopulated set via file deletions.
        else:
            sha = get_file_sha(item.path)
            if sha:
                delete_file(item.path, f"AI-bot: delete {item.path}", sha)
                deleted.append(item.path)
    return deleted


def process_delete_target(target):
    """Handle delete commands like delete: . or delete: public/ or delete: path/to/file.txt"""
    target = target.strip()
    if target in (".", "./"):
        all_items = repo.get_contents("")
        deleted = []
        if isinstance(all_items, list):
            for item in all_items:
                if item.type == "dir":
                    deleted.extend(delete_path_recursive(item.path))
                else:
                    sha = get_file_sha(item.path)
                    if sha:
                        delete_file(item.path, f"AI-bot: delete {item.path}", sha)
                        deleted.append(item.path)
        return deleted

    # if target is a directory path like public/
    if target.endswith("/") or target == "public":
        dir_path = target.rstrip("/")
        deleted = delete_path_recursive(dir_path)
        return deleted

    # file case
    sha = get_file_sha(target)
    if not sha:
        return []
    delete_file(target, f"AI-bot: delete {target}", sha)
    return [target]


# Parse first command line.
first_line = ""
for ln in body.splitlines():
    if ln.strip():
        first_line = ln.strip()
        break

parts = first_line.split() if first_line else []
if len(parts) < 2 or parts[0] != "/ai-bot":
    print("No valid /ai-bot command found. Exiting.")
    sys.exit(0)

action = parts[1].lower()
command_target = " ".join(parts[2:]).strip() if len(parts) > 2 else ""

# Extract fenced code blocks
fenced_blocks = re.findall(r"```(?:[\w+-]*)\n([\s\S]*?)\n```", body)

# support comment format like:
# /ai-bot upload path/to/file.txt
# ```txt
# contents here
# ```
# or /ai-bot delete: .
# or /ai-bot delete: public/
# or /ai-bot apply-map
# <zip-url>
# ```yaml
# mappings: ...
# ```

try:
    if action == "upload":
        if not command_target:
            post_reply("Usage: `/ai-bot upload path/to/file.txt` followed by a fenced code block.")
            sys.exit(0)
        if not fenced_blocks:
            post_reply("Upload requires a fenced code block with file contents.")
            sys.exit(0)
        file_content = fenced_blocks[0].encode("utf-8")
        sha = get_file_sha(command_target)
        if sha:
            repo.update_file(command_target, f"AI-bot: update {command_target}", fenced_blocks[0], sha)
            post_reply(f"✅ Updated file `{command_target}`.")
        else:
            repo.create_file(command_target, f"AI-bot: create {command_target}", fenced_blocks[0])
            post_reply(f"✅ Created file `{command_target}`.")

    elif action == "delete" or action.startswith("delete:"):
        target = command_target if action == "delete" else action.split(":", 1)[1].strip()
        if not target:
            post_reply("Usage: `/ai-bot delete path/to/file.txt` or `/ai-bot delete: .` or `/ai-bot delete: public/`")
            sys.exit(0)
        deleted = process_delete_target(target)
        if not deleted:
            post_reply(f"⚠️ Nothing deleted for target `{target}`.")
        else:
            post_reply(f"✅ Deleted: {', '.join(deleted)}")

    elif action == "apply-map" or action == "map":
        if not fenced_blocks:
            post_reply("`/ai-bot apply-map` requires a fenced YAML/JSON mapping block.")
            sys.exit(0)

        mapping_text = fenced_blocks[0]
        try:
            mapping = yaml.safe_load(mapping_text)
            if mapping is None:
                mapping = json.loads(mapping_text)
        except Exception:
            try:
                mapping = json.loads(mapping_text)
            except Exception as exc:
                post_reply(f"❌ Failed to parse mapping block: {exc}")
                sys.exit(0)

        if not isinstance(mapping, dict):
            post_reply("Mapping must be a JSON/YAML object with `mappings` key.")
            sys.exit(0)

        zip_url = None
        zip_match = re.search(r"https?://[^\s]+\.zip(?:\?[^\s]+)?", body)
        if zip_match:
            zip_url = zip_match.group(0)

        if not zip_url:
            post_reply("No ZIP URL found. Please include a public `.zip` URL in the comment.")
            sys.exit(0)

        zip_bytes = requests.get(zip_url).content
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
        mappings = mapping.get("mappings", {})
        delete_list = mapping.get("delete", [])
        replace_existing = mapping.get("replace_existing", True)

        # apply deletions first
        deleted = []
        for d in delete_list:
            sha = get_file_sha(d)
            if sha:
                delete_file(d, f"AI-bot: delete {d}", sha)
                deleted.append(d)

        uploaded = []
        errors = []
        for zip_pattern, target in mappings.items():
            matches = [n for n in zf.namelist() if fnmatch.fnmatch(n, zip_pattern)]
            if not matches:
                errors.append(f"No ZIP matches for pattern `{zip_pattern}`")
                continue
            for member in matches:
                if member.endswith("/"):
                    continue
                data = zf.read(member)
                destination = target.rstrip("/") if target.endswith("/") else target
                if target.endswith("/"):
                    destination = destination + "/" + member.rsplit("/", 1)[-1]
                try:
                    sha = get_file_sha(destination)
                    if sha and not replace_existing:
                        uploaded.append(f"Skipped existing `{destination}`")
                        continue
                    if sha:
                        repo.update_file(destination, f"AI-bot: update {destination}", data.decode("utf-8", errors="surrogateescape") if isinstance(data, (bytes, bytearray)) and not any(b > 127 for b in data[:128]) else data, sha)
                    else:
                        repo.create_file(destination, f"AI-bot: create {destination}", data.decode("utf-8", errors="surrogateescape") if isinstance(data, (bytes, bytearray)) and not any(b > 127 for b in data[:128]) else data)
                    uploaded.append(destination)
                except Exception as exc:
                    errors.append(f"Failed to upload `{destination}`: {exc}")

        if deleted or uploaded or errors:
            reply_lines = []
            if deleted:
                reply_lines.append("Deleted: " + ", ".join(deleted))
            if uploaded:
                reply_lines.append("Uploaded: " + ", ".join(uploaded))
            if errors:
                reply_lines.append("Errors:\n" + "\n".join(errors))
            post_reply("✅ apply-map finished:\n" + "\n".join(reply_lines))
        else:
            post_reply("✅ apply-map finished with no changes.")

    else:
        post_reply("Unknown action. Use `/ai-bot upload path`, `/ai-bot delete path`, `/ai-bot delete: .`, `/ai-bot delete: public/`, or `/ai-bot apply-map`.")

except Exception as exc:
    print("ERROR:", exc)
    post_reply(f"❌ Operation failed: {exc}")
    sys.exit(1)
