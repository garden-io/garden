.EXPORT_ALL_VARIABLES:
repo_root = $(shell pwd)
commit_hash = $(shell git rev-parse --short HEAD)
garden_version ?= v$(shell cat core/package.json | jq -r .version)
dist_path = dist
tmp_dist_path = tmp/dist

bootstrap:
	npm install
	lerna bootstrap

prepare_pkg:
	@echo "Packaging version ${garden_version}-${commit_hash}"
	mkdir -p ${dist_path}
	rm -rf ${tmp_dist_path}
	mkdir -p ${tmp_dist_path}
	mkdir ${tmp_dist_path}/bin
	mkdir ${tmp_dist_path}/build

	cp -r core/package.json core/package-lock.json core/node_modules ${tmp_dist_path}
	cp -r core/build/src ${tmp_dist_path}/build
	cp core/bin/garden ${tmp_dist_path}/bin
	cp core/bin/garden-debug ${tmp_dist_path}/bin

	rsync -r -L --exclude=.garden --exclude=.git core/static ${tmp_dist_path}
	git init ${tmp_dist_path}/static

build_pkg: pkg_linux pkg_windows pkg_macos pkg_alpine

pkg_linux: target_path = ${dist_path}/linux-amd64
pkg_linux: prepare_pkg
	rm -rf ${target_path}
	mkdir ${target_path}

	core/node_modules/.bin/pkg ${tmp_dist_path} --target node12-linux-x64 -o ${target_path}/garden

	cp -r ${tmp_dist_path}/static ${target_path}

	# fetch and copy sqlite binary
	cd core/node_modules/sqlite3 && ../.bin/node-pre-gyp install --target_arch=x64 --target_platform=linux
	cp core/node_modules/sqlite3/lib/binding/node-v72-linux-x64/node_sqlite3.node ${target_path}

	cd ${dist_path} && tar -czf garden-${garden_version}-linux-amd64.tar.gz linux-amd64

pkg_windows: target_path = ${dist_path}/windows-amd64
pkg_windows: prepare_pkg
	rm -rf ${target_path}
	mkdir ${target_path}

	core/node_modules/.bin/pkg ${tmp_dist_path} --target node12-win-x64 -o ${target_path}/garden.exe

	cp -r ${tmp_dist_path}/static ${target_path}

	cd ${dist_path} && tar -czf garden-${garden_version}-windows-amd64.tar.gz windows-amd64

pkg_macos: target_path = ${dist_path}/macos-amd64
pkg_macos: prepare_pkg
	rm -rf ${target_path}
	mkdir ${target_path}

	core/node_modules/.bin/pkg ${tmp_dist_path} --target node12-macos-x64 -o ${target_path}/garden

	cp -r ${tmp_dist_path}/static ${target_path}

	# fetch and copy sqlite binary
	cd core/node_modules/sqlite3 && ../.bin/node-pre-gyp install --target_arch=x64 --target_platform=darwin
	cp core/node_modules/sqlite3/lib/binding/node-v72-darwin-x64/node_sqlite3.node ${target_path}
	# include the .node binary for fsevents
	cp core/lib/fsevents.node ${target_path}/fsevents.node

	cd ${dist_path} && tar -czf garden-${garden_version}-macos-amd64.tar.gz macos-amd64

pkg_alpine: target_path = ${dist_path}/alpine-amd64
pkg_alpine: prepare_pkg
	rm -rf ${target_path}
	mkdir ${target_path}

	docker build -t gardendev/garden:alpine-builder -f alpine.Dockerfile .
	docker create -it --name alpine-builder gardendev/garden:alpine-builder sh
	docker cp alpine-builder:/garden/. ${target_path}
	docker rm -f alpine-builder

	cd ${dist_path} && tar -czf garden-${garden_version}-alpine-amd64.tar.gz alpine-amd64


