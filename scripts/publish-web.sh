#!/bin/bash
# publish-web.sh: zip www/ and publish it as the in-app update bundle on the "web-latest" release (needs GH_TOKEN).
set -euo pipefail; cd "$(dirname "$0")/.."
BUILD=$(python3 -c 'import json;print(json.load(open("www/version.json"))["build"])')
CUR=$(curl -fsL "https://github.com/$GITHUB_REPOSITORY/releases/download/web-latest/web.json" 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin)["build"])' 2>/dev/null || true)
if [ "$CUR" = "$BUILD" ] && [ "${FORCE:-}" != "1" ]; then echo "web bundle $BUILD already published"; exit 0; fi
rm -f web.zip && (cd www && zip -qr ../web.zip .)
ZIP="web-$BUILD.zip"; mv web.zip "$ZIP"
printf '{"build":"%s","url":"https://github.com/%s/releases/download/web-latest/%s"}\n' "$BUILD" "$GITHUB_REPOSITORY" "$ZIP" > web.json
gh release view web-latest >/dev/null 2>&1 || gh release create web-latest --title "PrintCaddy web bundle (in-app updates)" --notes "Used by the iPad app's in-app updater. Not an installable app – get the .ipa from the latest build release." --latest=false
gh release upload web-latest "$ZIP" --clobber
gh release upload web-latest web.json --clobber
# keep only the newest 3 bundles
gh release view web-latest --json assets -q '.assets[].name' | grep '^web-.*\.zip$' | sort -r | tail -n +4 | while read -r a; do gh release delete-asset web-latest "$a" -y; done
echo "published web bundle $BUILD"
