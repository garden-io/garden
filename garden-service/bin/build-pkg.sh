#!/bin/bash -e

# Usage ./build-pkg.sh [version]
#
# Use the optional version argument to override the version that is included in the
# zip file names. Used for setting the version on unstable releases.
# Defaults to the version in garden-service/package.json.
# Note that this is only for the version string used in the file name, not the version of the
# code that is built.

garden_service_root=$(cd `dirname $0` && cd .. && pwd)

cd ${garden_service_root}

commit_hash=$(git rev-parse --short HEAD)

# Use version argument if provided, otherwise read version from package.json
if [ -n "$1" ]; then
  version=$1
else
  version="v$(cat package.json | jq -r .version)"
fi

shopt -s expand_aliases
alias pkg=${garden_service_root}/node_modules/.bin/pkg

echo "Packaging version ${version}-${commit_hash}"

echo "-> Copying files to tmp build dir..."
mkdir -p dist
dist_path=$(cd dist && pwd)
rm -rf tmp/dist
mkdir -p tmp/dist
tmp_dist_path=$(cd tmp/dist && pwd)
mkdir tmp/dist/bin
mkdir tmp/dist/build

cp -r package.json package-lock.json node_modules Dockerfile tmp/dist
cp -r build/src tmp/dist/build/src
cp bin/garden tmp/dist/bin
rsync -r --exclude=.garden --exclude=.git static tmp/dist

# IMPORTANT: We 'git init' the static dir. This is because in general, Garden only works
# with projects that are inside git repos. However, the modules for the garden-system project reside
# in the static directory, and it's simply easier to make that a git repo as well,
# as opposed of dealing with a bunch of special cases.
echo "-> Run 'git init' inside static dir"
git init tmp/dist/static

echo "-> Preparing packages..."
cd dist

echo "  -> linux-amd64"
pkg --target node12-linux-x64 ${tmp_dist_path}
rm -rf linux-amd64
mkdir linux-amd64
target_path=$(cd linux-amd64 && pwd)

mv garden-service linux-amd64/garden
cp -r ${tmp_dist_path}/static ${target_path}

echo "    -> binary dependencies"
# fetch and copy sqlite binary
cd ${garden_service_root}/node_modules/sqlite3
node-pre-gyp install --target_arch=x64 --target_platform=linux
cp lib/binding/node-v72-linux-x64/node_sqlite3.node ${target_path}
cd ${dist_path}
echo "    -> tar"
tar -czf garden-${version}-linux-amd64.tar.gz linux-amd64

echo "  -> windows-amd64"
pkg --target node12-win-x64 ${tmp_dist_path}
rm -rf windows-amd64
mkdir windows-amd64
target_path=$(cd windows-amd64 && pwd)
# Name should match go release and other standards using full "windows" name
mv garden-service.exe windows-amd64/garden.exe
cp -r ${tmp_dist_path}/static ${target_path}

echo "    -> binary dependencies"
# fetch and copy sqlite binary
cd ${garden_service_root}/node_modules/sqlite3
node-pre-gyp install --target_arch=x64 --target_platform=win32
cp lib/binding/node-v72-win32-x64/node_sqlite3.node ${target_path}
cd ${dist_path}
echo "    -> zip"
zip -q -r garden-${version}-windows-amd64.zip windows-amd64

echo "  -> macos-amd64"
rm -rf macos-amd64
mkdir macos-amd64
target_path=$(cd macos-amd64 && pwd)
pkg --target node12-macos-x64 ${tmp_dist_path}
mv garden-service macos-amd64/garden
cp -r ${tmp_dist_path}/static ${target_path}

echo "    -> binary dependencies"
# fetch and copy sqlite binary
cd ${garden_service_root}/node_modules/sqlite3
node-pre-gyp install --target_arch=x64 --target_platform=darwin
cp lib/binding/node-v72-darwin-x64/node_sqlite3.node ${target_path}
cd ${dist_path}
# include the .node binary for fsevents
cp ${garden_service_root}/lib/fsevents/node-v72-darwin-x64/fse.node macos-amd64/fse.node

echo "    -> tar"
tar -czf garden-${version}-macos-amd64.tar.gz macos-amd64
