#!/bin/bash -e

garden_service_root=$(cd `dirname $0` && cd .. && pwd)

cd ${garden_service_root}

commit_hash=$(git rev-parse --short HEAD)
version=$(cat package.json | jq -r .version)

echo "Packaging version ${version}-${commit_hash}"

echo "-> Copying files to tmp build dir..."
mkdir -p dist
rm -rf tmp/dist
mkdir -p tmp/dist

cp -r package.json build node_modules tmp/dist
rsync -r --exclude=.garden --exclude=.git static tmp/dist

echo "-> Building executables..."
cd dist
# note: using the npm package is still preferred on macOS, because it needs the native fsevents library
pkg --target node10-linux-x64,node10-win-x64 ../tmp/dist

echo "-> Preparing packages..."

echo "  -> linux-amd64"
rm -rf linux-amd64
mkdir linux-amd64
mv garden-cli-linux linux-amd64/garden
cp -r ../tmp/dist/static linux-amd64
tar -czf garden-${version}-${commit_hash}-linux-amd64.tar.gz linux-amd64

echo "  -> win-amd64"
rm -rf win-amd64
mkdir win-amd64
mv garden-cli-win.exe win-amd64/garden.exe
cp -r ../tmp/dist/static win-amd64
zip -q -r garden-${version}-${commit_hash}-win-amd64.zip win-amd64

echo "Done!"
