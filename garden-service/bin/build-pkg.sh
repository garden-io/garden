#!/bin/bash -e

garden_service_root=$(cd `dirname $0` && cd .. && pwd)

cd ${garden_service_root}

commit_hash=$(git rev-parse --short HEAD)
version="v$(cat package.json | jq -r .version)"

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
pkg --target node10-macos-x64,node10-linux-x64,node10-win-x64 ../tmp/dist

echo "-> Preparing packages..."

echo "  -> linux-amd64"
rm -rf linux-amd64
mkdir linux-amd64
mv garden-cli-linux linux-amd64/garden
cp -r ../tmp/dist/static linux-amd64
echo "    -> tar"
tar -czf garden-${version}-linux-amd64.tar.gz linux-amd64
echo "    -> cleaning up tmp files"
rm -rf linux-amd64

echo "  -> macos-amd64"
rm -rf macos-amd64
mkdir macos-amd64
mv garden-cli-macos macos-amd64/garden
cp -r ../tmp/dist/static macos-amd64
# need to include the .node binary for fsevents
cp ../lib/fsevents/node-v64-darwin-x64/fse.node macos-amd64
echo "    -> tar"
tar -czf garden-${version}-macos-amd64.tar.gz macos-amd64
echo "    -> cleaning up tmp files"
rm -rf macos-amd64

echo "  -> windows-amd64"
rm -rf windows-amd64
mkdir windows-amd64
# Name should match go release and other standards using full "windows" name
mv garden-cli-win.exe windows-amd64/garden.exe
cp -r ../tmp/dist/static windows-amd64
echo "    -> zip"
zip -q -r garden-${version}-windows-amd64.zip windows-amd64
echo "    -> cleaning up tmp files"
rm -rf windows-amd64
