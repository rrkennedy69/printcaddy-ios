#!/bin/bash
# Local: rebuild the shim and copy /workspace/cad-site/dist into www/. (CI builds www from the live Pages repo itself.)
set -euo pipefail; cd "$(dirname "$0")"
npx esbuild src/shim.js --bundle --minify --format=iife --target=safari15 --outfile=resources/ios-shim.js
scripts/make-www.sh /workspace/cad-site/dist
