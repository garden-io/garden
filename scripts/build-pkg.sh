#!/bin/bash -e

# Usage ./build-pkg.sh [version]
#
# Use the optional version argument to override the version that is included in the
# zip file names. Used for setting the version on unstable releases.
# Defaults to the version in core/package.json.
# Note that this is only for the version string used in the file name, not the version of the
# code that is built.

repo_root=$(cd `dirname $0` && cd .. && pwd)
core_root=${repo_root}/core

cd ${core_root}

commit_hash=$(git rev-parse --short HEAD)

# Use version argument if provided, otherwise read version from package.json
if [ -n "$1" ]; then
  version=$1
else
  version="v$(cat package.json | jq -r .version)"
fi

shopt -s expand_aliases
alias pkg=${core_root}/node_modules/.bin/pkg

echo "Packaging version ${version}-${commit_hash}"

echo "-> Copying files to tmp build dir..."
dist_path=${repo_root}/dist
mkdir -p ${dist_path}
tmp_dist_path=${repo_root}/tmp/dist
rm -rf ${tmp_dist_path}
mkdir -p ${tmp_dist_path}
mkdir ${tmp_dist_path}/bin
mkdir ${tmp_dist_path}/build

cp -r ${core_root}/package.json ${core_root}/package-lock.json ${core_root}/node_modules ${tmp_dist_path}
cp -r ${core_root}/build/src ${tmp_dist_path}/build/src
cp ${core_root}/bin/garden ${tmp_dist_path}/bin
cp ${core_root}/bin/garden-debug ${tmp_dist_path}/bin
rsync -r -L --exclude=.garden --exclude=.git ${core_root}/static ${tmp_dist_path}

# IMPORTANT: We 'git init' the static dir. This is because in general, Garden only works
# with projects that are inside git repos. However, the modules for the garden-system project reside
# in the static directory, and it's simply easier to make that a git repo as well,
# as opposed of dealing with a bunch of special cases.
echo "-> Run 'git init' inside static dir"
git init ${tmp_dist_path}/static

echo "-> Preparing packages..."
cd ${dist_path}

echo "  -> linux-amd64"
pkg --target node12-linux-x64 ${tmp_dist_path}
rm -rf linux-amd64
mkdir linux-amd64
target_path=$(cd linux-amd64 && pwd)

mv core linux-amd64/garden
# dereference symlinks
cp -r ${tmp_dist_path}/static ${target_path}

echo "    -> binary dependencies"
# fetch and copy sqlite binary
cd ${core_root}/node_modules/sqlite3
${core_root}/node_modules/.bin/node-pre-gyp install --target_arch=x64 --target_platform=linux
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
mv core.exe windows-amd64/garden.exe
cp -r ${tmp_dist_path}/static ${target_path}

echo "    -> binary dependencies"
# fetch and copy sqlite binary
cd ${core_root}/node_modules/sqlite3
${core_root}/node_modules/.bin/node-pre-gyp install --target_arch=x64 --target_platform=win32
cp lib/binding/node-v72-win32-x64/node_sqlite3.node ${target_path}
cd ${dist_path}
echo "    -> zip"
zip -q -r garden-${version}-windows-amd64.zip windows-amd64

echo "  -> macos-amd64"
rm -rf macos-amd64
mkdir macos-amd64
target_path=$(cd macos-amd64 && pwd)
pkg --target node12-macos-x64 ${tmp_dist_path}
mv core macos-amd64/garden
cp -r ${tmp_dist_path}/static ${target_path}

echo "    -> binary dependencies"
# fetch and copy sqlite binary
cd ${core_root}/node_modules/sqlite3
${core_root}/node_modules/.bin/node-pre-gyp install --target_arch=x64 --target_platform=darwin
cp lib/binding/node-v72-darwin-x64/node_sqlite3.node ${target_path}
cd ${dist_path}
# include the .node binary for fsevents
cp ${core_root}/lib/fsevents.node macos-amd64/fsevents.node

echo "    -> tar"
tar -czf garden-${version}-macos-amd64.tar.gz macos-amd64

echo "  -> alpine-amd64"
cd ${dist_path}
rm -rf alpine-amd64
mkdir alpine-amd64
target_path=$(cd alpine-amd64 && pwd)
cd ${repo_root}
# We need to package the Alpine bin inside the container and copy the artifacts back out
docker build -t gardendev/garden:alpine-builder -f alpine.Dockerfile .
docker create -it --name alpine-builder gardendev/garden:alpine-builder sh
docker cp alpine-builder:/garden/. ${target_path}
docker rm -f alpine-builder
cd ${dist_path}

echo "    -> tar"
tar -czf garden-${version}-alpine-amd64.tar.gz alpine-amd64
