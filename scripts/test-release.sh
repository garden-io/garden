#!/bin/bash

# Script that downloads a release based on the version argument, and runs some simple tests to sanity check it.
#
# Usage: ./scripts/test-release.sh <version> [--ci] [--binary-path <path>]
#
# --ci: Run in CI mode (skip interactive tests, exit with proper status codes)
# --binary-path: Path to the garden binary (skip download, use this binary instead)

garden_root=$(cd "$(dirname "$0")" && cd .. && pwd)

# Parse arguments
ci_mode=false
binary_path=""
version=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --ci)
      ci_mode=true
      shift
      ;;
    --binary-path)
      binary_path="$2"
      shift 2
      ;;
    *)
      if [ -z "$version" ]; then
        version="$1"
      fi
      shift
      ;;
  esac
done

# For pre-releases, trim the -N suffix for use in the downloaded file name and for version comparisons.
base_version="${version%%-*}"

if [ ! "$version" ]; then
  echo "Version is missing"
  echo "Usage: $0 <version> [--ci] [--binary-path <path>]"
  exit 1
fi

download_release() {
  if [ "$(uname -s)" = "Darwin" ]; then
    os=macos
  else
    os=$(ldd 2>&1 | grep musl >/dev/null && echo "alpine" || echo "linux")
  fi

  platform="${os}-amd64"
  filename="garden-${base_version}-${platform}.tar.gz"
  url="https://github.com/garden-io/garden/releases/download/${version}/${filename}"
  dir="${HOME}/.garden-release"
  target_path="${dir}/bin"

  echo "→ Downloading release ${version} to ${dir}"
  rm -rf "$target_path"
  mkdir -p "$target_path"
  cd "$dir"
  curl -sLO "$url"
  echo "→ Extracting to ${target_path}"
  tar -xzf "$filename"
  rm "$filename"
  cp -r "${platform}"/* bin/
  chmod +x bin/garden
  rm -rf "$platform"
  cd "$garden_root"
  return 0
}

test_release() {
  if [ ! "$version" ]; then
    echo "Version is missing"
    return 1
  fi

  if [ -n "$binary_path" ]; then
    garden_release="$binary_path"
  else
    garden_release="${HOME}/.garden-release/bin/garden"
  fi

  echo "→ Verify version"
  release_version=$("${garden_release}" --version)

  echo "$release_version"

  if [ "$base_version" != "$release_version" ]; then
    echo "Versions don't match, ${version} and ${release_version}"
    return 1
  fi

  cd examples/demo-project
  echo ""
  echo "→ Running 'garden build' in demo project"
  echo ""
  "${garden_release}" build
  if [ $? -ne 0 ]; then
    echo "ERROR: 'garden build' failed"
    cd "$garden_root"
    return 1
  fi

  if [ "$ci_mode" = true ]; then
    echo ""
    echo "→ CI mode: skipping interactive tests (exec, deploy --sync)"
    echo "→ Smoke test passed!"
    cd "$garden_root"
    return 0
  fi

  echo ""
  echo "→ Running 'garden deploy' in demo project"
  echo ""
  "${garden_release}" deploy
  echo ""
  echo ""
  echo "→ Running 'garden exec backend /bin/sh' in demo project"
  echo "→ Run a command in the prompt (ls, for example) and see if the TTY behaves as expected."
  echo ""
  "${garden_release}" exec backend /bin/sh

  cd ..
  cd vote
  echo ""
  echo "→ Running 'garden deploy --sync' in vote project (the test script will continue after 2 minutes)."
  echo "→ Try e.g. to update this file: ${garden_root}/examples/vote/vote/src/views/Home.vue"
  echo ""
  "${garden_release}" deploy --sync
  echo ""
  echo "→ Stopping sync for vote app"
  "${garden_release}" sync stop vote
  revert_git_changes

  cd "$garden_root"
  echo "Done!"
}

revert_git_changes() {
  echo ""
  echo "Reverting git changes"
  git checkout .
  echo "Done!"
}

# If using a provided binary path, skip download
if [ -z "$binary_path" ]; then
  download_release
fi
test_release
exit_code=$?

# to ensure that any possible intermediate changes would be reverted too
revert_git_changes

exit $exit_code
