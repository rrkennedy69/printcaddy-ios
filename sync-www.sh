#!/bin/bash
# Copy the PrintCaddy static export into www/ and inject the iOS shim into every page.
set -euo pipefail; cd "$(dirname "$0")"
rm -rf www && cp -a /workspace/cad-site/dist www && rm -f www/store.php
cp resources/ios-shim.js www/ios-shim.js
find www -name "*.html" -print0 | xargs -0 sed -i 's#<head>#<head><script src="/ios-shim.js"></script>#'
