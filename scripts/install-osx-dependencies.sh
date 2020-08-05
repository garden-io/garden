#!/usr/bin/env bash

# install/update homebrew dependencies
BREW_DEPS="jq cmake git kubectl kubernetes-helm stern rsync icu4c pkg-config faas-cli dep git-chglog parallel"

brew update
brew tap git-chglog/git-chglog
brew install ${BREW_DEPS}
brew upgrade ${BREW_DEPS}

# install and set up Google Cloud SDK
brew cask install google-cloud-sdk

gcloud components update
gcloud components install beta

# install nvm and node
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.35.1/install.sh | bash
nvm install 12
nvm alias default 12
nvm use default

# install/update global packages
npm install -g gulp-cli ts-node typescript
