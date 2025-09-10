#!/usr/bin/env bash
set -Eeuo pipefail
if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
  npm ci
else
  npm install
fi
has_build="$(node -p "try{(require('./package.json').scripts||{}).build?'yes':''}catch(e){''}")" || true
if [ "$has_build" = "yes" ]; then
  npm run build
fi
bundle_dir="bundle"
rm -rf "$bundle_dir"; mkdir -p "$bundle_dir"
out_dir=""
for d in dist build .next out; do
  [ -d "$d" ] && { out_dir="$d"; break; }
done
if [ -n "$out_dir" ]; then
  rsync -a --delete --exclude='.git' --exclude='.svn' --exclude='node_modules' "$out_dir"/ "$bundle_dir"/
else
  [ -d src ]   && rsync -a --exclude='.git' --exclude='.svn' src/   "$bundle_dir"/src/   || true
  [ -d utils ] && rsync -a --exclude='.git' --exclude='.svn' utils/ "$bundle_dir"/utils/ || true
  shopt -s nullglob; for f in *.js; do cp "$f" "$bundle_dir/"; done; shopt -u nullglob
fi
[ -f package.json ]        && cp package.json        "$bundle_dir/" || true
[ -f package-lock.json ]   && cp package-lock.json   "$bundle_dir/" || true
[ -f npm-shrinkwrap.json ] && cp npm-shrinkwrap.json "$bundle_dir/" || true
[ -f ecosystem.config.js ] && cp ecosystem.config.js "$bundle_dir/" || true
tar -C "$bundle_dir" --exclude-vcs -czf artifact.tgz .