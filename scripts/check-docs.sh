#!/bin/bash -e
# set -v

# export FORCE_COLOR=true

# Needs to generate clean docs before we can validate they are up to date
# npm run generate-docs
git diff HEAD -- docs/ || (echo 'generated docs are not up-to-date! run \"npm run clean-build && npm run generate-docs\" and commit the changes.\n' && exit 1)

# Use "|| true" so we don't exit on empty
modified_docs=$(git diff --name-status main docs README.md) || true
modified_examples=$(git diff --name-status main examples | grep "examples.*\README.md$") || true

found_dead_links=false
check_links() {
  for file in $@; do
    # markdown-link-check is configured to ignore relative links
    ./node_modules/.bin/markdown-link-check --quiet --config markdown-link-check-config.json $file || found_dead_links=true
  done
}

export -f check_links

# Only check links if docs or examples were modified
if !([ -z "$modified_docs" ] && [ -z "$modified_examples" ]); then
  # Note: piping to xargs turns newlines to spaces and trims ends
  docs=$(find docs -name '*.md' -type f | xargs)
  examples=$(find examples -name 'README.md' -type f -not -path "*/.garden/*" -not -path "*/node_modules/*" | xargs)
  readme="./README.md"

  check_links $readme
  check_links $docs
  check_links $examples

  if $found_dead_links; then
    echo ""
    echo "Error: Dead links found. See the output above for details."
    echo ""
    exit 1
  fi
else
  echo "Skipping dead link check as docs or examples were not modified"
fi
