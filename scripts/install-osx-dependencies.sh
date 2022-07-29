#!/usr/bin/env bash

# install/update homebrew dependencies
BREW_DEPS="jq cmake git kubectl kubernetes-helm rsync icu4c pkg-config faas-cli dep git-chglog parallel"

brew update
brew tap git-chglog/git-chglog
brew install ${BREW_DEPS}
brew upgrade ${BREW_DEPS}

# install and set up Google Cloud SDK
brew install --cask google-cloud-sdk

gcloud components update
gcloud components install beta

# install nvm
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.35.1/install.sh | bash
# make nvm command active without terminal reopening
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
# install node
nvm install 14
nvm alias default 14
nvm use default

# install/update global packages
npm install -g gulp-cli ts-node typescript

# install yarn
npm install --global yarn
