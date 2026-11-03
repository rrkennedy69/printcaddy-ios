#!/bin/bash
# make-www.sh <site-dir>: copy a PrintCaddy static export into www/ and inject the iOS shim into every page.
set -euo pipefail; cd "$(dirname "$0")/.."
SRC="${1:?site dir}"
rm -rf www && mkdir www && (cd "$SRC" && tar --exclude=.git -cf - .) | (cd www && tar -xf -) && rm -f www/store.php
cp resources/ios-shim.js www/ios-shim.js
find www -name "*.html" -print0 | xargs -0 perl -pi -e 's#<head>#<head><script src="/ios-shim.js"></script>#'
echo "www build: $(cat www/version.json)"
