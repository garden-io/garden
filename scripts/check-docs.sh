#!/bin/bash -e
# set -v

# Use "|| true" so we don't exit on empty
modified_docs=$(git diff --name-status master docs README.md) || true
modified_examples=$(git diff --name-status master examples | grep "examples.*\README.md$") || true

check_relative_links() {
  ./node_modules/.bin/remark --use validate-links --frail --quiet --no-stdout "$@"
}

error_in_external_links=false
check_external_links() {
  for file in $@; do
    # markdown-link-check is configured to ignore relative links
    ./node_modules/.bin/markdown-link-check --config markdown-link-check-config.json $file || error_in_external_links=true
  done
}

export -f check_relative_links
export -f check_external_links

# Only check links if docs or examples were modified
if !([ -z "$modified_docs" ] && [ -z "$modified_examples" ]); then
  # Note: piping to xargs turns newlines to spaces and trims ends
  docs=$(find docs -name '*.md' -type f | xargs)
  examples=$(find examples -name 'README.md' -type f -not -path "*/.garden/*" -not -path "*/node_modules/*" | xargs)
  readme="./README.md"

  check_relative_links $docs
  check_relative_links $examples
  check_relative_links $readme

  check_external_links $docs
  check_external_links $examples
  check_external_links $readme

  if $error_in_external_links; then
    echo ""
    echo "Error: Dead links found. See the output above for details."
    echo ""
    exit 1
  fi
fi

# Needs to generate clean docs before we can validate they are up to date
yarn run generate-docs
git diff --quiet HEAD -- docs/ || (echo 'generated docs are not up-to-date! run \"yarn run generate-docs\" and commit the changes\n' && exit 1)
