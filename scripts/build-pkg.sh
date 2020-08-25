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
dist_path=${repo_root}/dist
tmp_dist_path=${repo_root}/tmp/dist
static_path=${repo_root}/static
tmp_static_path=${tmp_dist_path}/static

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
mkdir -p ${dist_path}
rm -rf ${tmp_dist_path}
mkdir -p ${tmp_dist_path}

rsync -r -L --exclude=.garden --exclude=.git ${static_path} ${tmp_dist_path}

# IMPORTANT: We 'git init' the static dir. This is because in general, Garden only works
# with projects that are inside git repos. However, the modules for the garden-system project reside
# in the static directory, and it's simply easier to make that a git repo as well,
# as opposed of dealing with a bunch of special cases.
echo "-> Run 'git init' inside static dir"
git init ${tmp_static_path}

echo "-> Preparing packages..."


echo
echo "***************"
echo "* macos-amd64 *"
echo "***************"
target_path=${dist_path}/macos-amd64
rm -rf ${target_path}
mkdir ${target_path}

pkg --target node12-macos-x64 ${core_root} --output ${target_path}/garden

cp -r ${tmp_static_path} ${target_path}

echo " -> binary dependencies"
# fetch and copy sqlite binary
cd ${core_root}/node_modules/sqlite3
${core_root}/node_modules/.bin/node-pre-gyp install --target_arch=x64 --target_platform=darwin
cp lib/binding/node-v72-darwin-x64/node_sqlite3.node ${target_path}

# include the .node binary for fsevents
cp ${core_root}/lib/fsevents.node ${target_path}/fsevents.node

echo " -> tar"
cd ${dist_path}
tar -czf garden-${version}-macos-amd64.tar.gz macos-amd64


echo
echo "***************"
echo "* linux-amd64 *"
echo "***************"
target_path=${dist_path}/linux-amd64
rm -rf ${target_path}
mkdir -p ${target_path}

pkg --target node12-linux-x64 ${core_root} --output ${target_path}/garden

cp -r ${tmp_static_path} ${target_path}

echo " -> binary dependencies"
# fetch and copy sqlite binary
cd ${core_root}/node_modules/sqlite3
${core_root}/node_modules/.bin/node-pre-gyp install --target_arch=x64 --target_platform=linux
cp lib/binding/node-v72-linux-x64/node_sqlite3.node ${target_path}

echo " -> tar"
cd ${dist_path}
tar -czf garden-${version}-linux-amd64.tar.gz linux-amd64


echo
echo "*****************"
echo "* windows-amd64 *"
echo "*****************"
# Name should match go release and other standards using full "windows" name
target_path=${dist_path}/windows-amd64
rm -rf ${target_path}
mkdir ${target_path}

pkg --target node12-win-x64 ${core_root} --output ${target_path}/garden.exe

cp -r ${tmp_static_path} ${target_path}

echo " -> binary dependencies"
# fetch and copy sqlite binary
cd ${core_root}/node_modules/sqlite3
${core_root}/node_modules/.bin/node-pre-gyp install --target_arch=x64 --target_platform=win32
cp lib/binding/node-v72-win32-x64/node_sqlite3.node ${target_path}

echo " -> zip"
cd ${dist_path}
zip -q -r garden-${version}-windows-amd64.zip windows-amd64


echo
echo "****************"
echo "* alpine-amd64 *"
echo "****************"
target_path=${dist_path}/alpine-amd64
rm -rf ${target_path}
mkdir ${target_path}

# We need to package the Alpine bin inside the container and copy the artifacts back out
cd ${repo_root}
docker build -t gardendev/garden:alpine-builder -f alpine.Dockerfile .
docker create -it --name alpine-builder gardendev/garden:alpine-builder sh
docker cp alpine-builder:/garden/. ${target_path}
docker rm -f alpine-builder

echo " -> tar"
cd ${dist_path}
tar -czf garden-${version}-alpine-amd64.tar.gz alpine-amd64
