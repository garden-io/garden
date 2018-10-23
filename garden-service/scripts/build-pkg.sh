#!/bin/bash -e

garden_cli_root=$(cd `dirname $0` && cd .. && pwd)

cd ${garden_cli_root}

commit_hash=$(git rev-parse --short HEAD)
version=$(cat package.json | jq -r .version)

echo "Packaging version ${version}-${commit_hash}"

echo "-> Copying files to tmp build dir..."
mkdir -p dist
mkdir -p tmp/dist

cp -r package.json build static node_modules tmp/dist

echo "-> Cleaning up .garden directories..."
find tmp/dist -depth -type d -name ".garden" -exec rm -r "{}" \;

echo "-> Building executables..."
cd dist
# note: using the npm package is still preferred on macOS, because it needs the native fsevents library
pkg --target node10-linux-x64,node10-win-x64 ../tmp/dist

echo "-> Preparing packages..."

echo "  -> linux-x64"
rm -rf linux-x64
mkdir linux-x64
mv garden-cli-linux linux-x64/garden
cp -r ../tmp/dist/static linux-x64
tar -czf garden-${version}-${commit_hash}.tar.gz linux-x64

echo "  -> win-x64"
rm -rf win-x64
mkdir win-x64
mv garden-cli-win.exe win-x64/garden.exe
cp -r ../tmp/dist/static win-x64
zip -q -r garden-${version}-${commit_hash}.zip win-x64

echo "Done!"
