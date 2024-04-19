#!/bin/sh

set -e -o pipefail

# Print our lovely banner image
echo "[0;40;36m[48;2;35;163;116m  [48;2;30m[48;2;67;136;127m  [36m[48;2;92;207;254m  [42m[48;2;35;163;116m  [1m[48;2;91;253;255m  [0m[48;2;104;188;83m  [48;2;30m[48;2;63;132;75m  [0;36m[48;2;38;87;111m  [1m[48;2;91;253;255m  [30m[48;2;44;91;85m  [0;36m[48;2;45;161;133m  [48;2;30m[48;2;69;125;127m  [48;2;52;106;90m  [0;34m[48;2;31;69;124m  [48;2;30m[48;2;62;129;73m  [0;36m[48;2;15;91;163m  [48;2;30m[48;2;65;133;125m  [0;36m[48;2;35;163;116m  [48;2;30m[48;2;76;124;98m  [48;2;52;106;90m  [48;2;69;125;127m  [0;36m[48;2;36;78;92m  [48;2;30m[48;2;52;106;90m  [48;2;69;125;127m  [48;2;62;129;73m  [48;2;52;106;90m  [0;32m[48;2;42;184;93m  [0;36m[48;2;15;91;163m  [48;2;34;157;187m  [1m[48;2;116;251;192m  [0;36m[48;2;36;77;91m  [32m[48;2;56;156;96m  [36m[48;2;34;157;187m  [48;2;36;77;91m  [1m[48;2;116;251;192m  [0;32m[48;2;56;156;96m[0m
[36m[48;2;35;163;116m  [48;2;30m[48;2;67;136;127m  [36m[48;2;92;207;254m  [0;32m[48;2;42;184;93m  [48;2;36m[48;2;91;253;255m  [0m[48;2;104;188;83m  [48;2;30m[48;2;63;132;75m  [0;36m[48;2;38;87;111m  [1m[48;2;91;253;255m  [0;36m[48;2;58;128;152m  [48;2;45;161;133m  [48;2;30m[48;2;69;125;127m  [48;2;52;106;90m  [0;34m[48;2;31;69;124m  [48;2;30m[48;2;62;129;73m  [0;36m[48;2;15;91;163m  [48;2;30m[48;2;65;133;125m  [0;36m[48;2;35;163;116m  [37m[48;2;104;188;83m  [48;2;30m[48;2;52;106;90m  [48;2;69;125;127m  [0;36m[48;2;36;78;92m  [48;2;30m[48;2;52;106;90m  [48;2;69;125;127m  [48;2;62;129;73m  [48;2;52;106;90m  [0;32m[48;2;42;184;93m  [0;36m[48;2;15;91;163m  [48;2;34;157;187m  [1m[48;2;116;251;192m  [0;36m[48;2;36;77;91m  [37m[48;2;104;188;83m  [36m[48;2;34;157;187m  [48;2;36;77;91m  [1m[48;2;116;251;192m  [0;32m[48;2;56;156;96m[0m
[36m[48;2;35;163;116m  [48;2;30m[48;2;67;136;127m  [34m[48;2;172;142;206m  [0;32m[48;2;42;184;93m  [48;2;36m[48;2;91;253;255m  [0m[48;2;104;188;83m  [36m[48;2;41;183;169m  [48;2;38;87;111m  [1m[48;2;91;253;255m  [0;36m[48;2;58;128;152m  [48;2;45;161;133m  [32m[48;2;42;184;93m  [48;2;30m[48;2;52;106;90m  [0;34m[48;2;31;69;124m  [48;2;30m[48;2;62;129;73m  [0;36m[48;2;15;91;163m  [48;2;30m[48;2;65;133;125m  [0;36m[48;2;35;163;116m  [37m[48;2;104;188;83m  [48;2;30m[48;2;52;106;90m  [48;2;69;125;127m  [0;36m[48;2;36;78;92m  [48;2;30m[48;2;52;106;90m  [48;2;69;125;127m  [48;2;62;129;73m  [48;2;52;106;90m  [0;32m[48;2;42;184;93m  [0;36m[48;2;15;91;163m  [48;2;34;157;187m  [1m[48;2;116;251;192m  [0;36m[48;2;36;77;91m  [37m[48;2;104;188;83m  [36m[48;2;34;157;187m  [48;2;36;77;91m  [1m[48;2;116;251;192m  [0;32m[48;2;56;156;96m[0m
[32m[48;2;51;109;102m  [48;2;67;136;127m  [0;36m[48;2;15;91;163m  [32m[48;2;42;184;93m  [48;2;36m[48;2;91;253;255m  [0m[48;2;104;188;83m  [36m[48;2;41;183;169m  [48;2;38;87;111m  [1m[48;2;116;251;192m  [0;36m[48;2;58;128;152m  [48;2;45;161;133m  [32m[48;2;42;184;93m  [48;2;30m[48;2;52;106;90m  [0;34m[48;2;31;69;124m  [48;2;30m[48;2;62;129;73m  [0;36m[48;2;15;91;163m  [48;2;34m[48;2;172;142;206m  [0;36m[48;2;35;163;116m  [37m[48;2;104;188;83m  [48;2;30m[48;2;52;106;90m  [36m[48;2;116;251;192m  [0;36m[48;2;36;78;92m  [48;2;30m[48;2;52;106;90m  [48;2;69;125;127m  [48;2;62;129;73m  [48;2;52;106;90m  [36m[48;2;116;251;192m  [0;36m[48;2;15;91;163m  [48;2;34;157;187m  [1m[48;2;116;251;192m  [0;36m[48;2;15;91;163m  [37m[48;2;104;188;83m  [36m[48;2;34;157;187m  [48;2;36;77;91m  [48;2;34m[48;2;125;93;174m  [0;32m[48;2;56;156;96m[0m
[32m[48;2;51;109;102m  [48;2;67;136;127m  [0;36m[48;2;15;91;163m  [32m[48;2;42;184;93m  [48;2;34m[48;2;125;93;174m  [0m[48;2;104;188;83m  [36m[48;2;41;183;169m  [48;2;38;87;111m  [1m[48;2;116;251;192m  [0;36m[48;2;58;128;152m  [48;2;45;161;133m  [32m[48;2;42;184;93m  [48;2;30m[48;2;52;106;90m  [0;34m[48;2;31;69;124m  [48;2;30m[48;2;62;129;73m  [0;36m[48;2;15;91;163m  [1m[48;2;92;207;254m  [0;36m[48;2;35;163;116m  [37m[48;2;104;188;83m  [48;2;30m[48;2;52;106;90m  [36m[48;2;116;251;192m  [0;36m[48;2;36;78;92m  [48;2;45;161;133m  [48;2;30m[48;2;69;125;127m  [48;2;62;129;73m  [48;2;52;106;90m  [36m[48;2;116;251;192m  [0;36m[48;2;15;91;163m  [48;2;34;157;187m  [1m[48;2;116;251;192m  [0;36m[48;2;15;91;163m  [37m[48;2;104;188;83m  [48;2;34m[48;2;172;142;206m  [0;36m[48;2;36;77;91m  [34m[48;2;31;69;124m  [32m[48;2;56;156;96m[0m
[32m[48;2;51;109;102m  [48;2;67;136;127m  [0;36m[48;2;15;91;163m  [32m[48;2;42;184;93m  [48;2;36m[48;2;116;251;192m  [0m[48;2;104;188;83m  [36m[48;2;41;183;169m  [48;2;38;87;111m  [1m[48;2;116;251;192m  [0;36m[48;2;58;128;152m  [48;2;45;161;133m  [32m[48;2;42;184;93m  [48;2;30m[48;2;52;106;90m  [0;34m[48;2;31;69;124m  [48;2;30m[48;2;62;129;73m  [0;36m[48;2;15;91;163m  [1m[48;2;92;207;254m  [0;36m[48;2;35;163;116m  [37m[48;2;104;188;83m  [48;2;30m[48;2;52;106;90m  [36m[48;2;116;251;192m  [0;36m[48;2;36;78;92m  [48;2;45;161;133m  [48;2;30m[48;2;69;125;127m  [48;2;62;129;73m  [48;2;52;106;90m  [36m[48;2;116;251;192m  [0;36m[48;2;15;91;163m  [48;2;34;157;187m  [1m[48;2;116;251;192m  [0;36m[48;2;15;91;163m  [37m[48;2;104;188;83m  [32m[48;2;56;156;96m  [36m[48;2;36;77;91m  [34m[48;2;31;69;124m  [32m[48;2;56;156;96m[0m
[32m[48;2;51;109;102m  [48;2;67;136;127m  [0;36m[48;2;15;91;163m  [32m[48;2;42;184;93m  [48;2;36m[48;2;116;251;192m  [0m[48;2;104;188;83m  [36m[48;2;41;183;169m  [48;2;38;87;111m  [1m[48;2;116;251;192m  [0;36m[48;2;58;128;152m  [48;2;45;161;133m  [32m[48;2;42;184;93m  [48;2;30m[48;2;52;106;90m  [0;34m[48;2;31;69;124m  [48;2;30m[48;2;62;129;73m  [0;36m[48;2;15;91;163m  [1m[48;2;92;207;254m  [0;36m[48;2;35;163;116m  [37m[48;2;104;188;83m  [48;2;30m[48;2;52;106;90m  [36m[48;2;116;251;192m  [0;36m[48;2;36;78;92m  [48;2;45;161;133m  [48;2;30m[48;2;69;125;127m  [48;2;62;129;73m  [48;2;52;106;90m  [36m[48;2;116;251;192m  [0;36m[48;2;15;91;163m  [48;2;34;157;187m  [1m[48;2;116;251;192m  [0;36m[48;2;15;91;163m  [37m[48;2;104;188;83m  [32m[48;2;56;156;96m  [36m[48;2;36;77;91m  [34m[48;2;31;69;124m  [32m[48;2;56;156;96m[0m
"

echo "❊ Installing the Garden CLI ❊"
echo ""

if [[ -n $1 ]]
then
  GARDEN_VERSION=$1
else
  echo "→ Finding the latest version..."
  # Find version to run through GitHub release API
  function jsonValue() {
    # see https://gist.github.com/cjus/1047794
    KEY=$1
    num=$2
    awk -F"[,:}]" '{for(i=1;i<=NF;i++){if($i~/'$KEY'\042/){print $(i+1)}}}' | tr -d '"' | sed -n ${num}p
  }
  GARDEN_VERSION=$(curl -sSfL https://github.com/garden-io/garden/releases/latest -H "Accept: application/json")
fi

# Detect OS
if [ "$(uname -s)" = "Darwin" ]; then
  OS=macos
else
  OS=`ldd 2>&1|grep musl >/dev/null && echo "alpine" || echo "linux"`
fi

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
  x86_64)
    ARCH=amd64
    ;;
  arm64 | aarch64)
    ARCH=arm64
    ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

PLATFORM="${OS}-${ARCH}"

filename="garden-${GARDEN_VERSION}-${PLATFORM}.tar.gz"
url="https://download.garden.io/core/${GARDEN_VERSION}/${filename}"

tmp=$(mktemp -d /tmp/garden-install.XXXXXX)
(
  cd "$tmp"

  echo "→ Downloading ${url}..."
  curl -sSfLO "${url}"

  SHA=$(curl -sSfL "${url}.sha256")
  echo ""
  echo "Download complete!, validating checksum..."
  checksum=$(openssl dgst -sha256 "${filename}" | awk '{ print $2 }')
  if [ "$checksum" != "$SHA" ]; then
    echo "Checksum validation failed." >&2
    exit 1
  fi
  echo "Checksum valid."
  echo ""
)

(
  GARDEN_DIR=${HOME}/.garden
  TARGET_PATH=${GARDEN_DIR}/bin

  echo "→ Extracting to ${TARGET_PATH}..."
  rm -rf "${TARGET_PATH}"
  mkdir -p "${GARDEN_DIR}"
  cd "$tmp"
  tar -xzf "${filename}"
  mv "${PLATFORM}" "${TARGET_PATH}"
)

rm -rf "$tmp"

echo ""
echo "🌺🌻  Garden has been successfully installed 🌷💐"
echo ""
echo "Add the Garden CLI to your path by adding the following to your .bashrc/.zshrc:"
echo ""
echo "  export PATH=\$PATH:\$HOME/.garden/bin"
echo ""
echo "Head over to our documentation for next steps: https://docs.garden.io"
echo ""
