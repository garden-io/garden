#!/usr/bin/env bash

# install/update homebrew dependencies
BREW_DEPS="asdf cmake git rsync icu4c pkg-config faas-cli dep git-chglog parallel"

brew update
brew tap git-chglog/git-chglog
brew install ${BREW_DEPS}
brew upgrade ${BREW_DEPS}

# install and set up Google Cloud SDK
brew install --cask google-cloud-sdk

gcloud components update
gcloud components install beta gke-gcloud-auth-plugin

# install all tools with asdf
ASDF_PLUGINS=(jq nodejs kubectl helm stern)
for plugin in $ASDF_PLUGINS; do
    asdf plugin-add $plugin
done
asdf install

# install/update global packages
npm install -g typescript

# install npm
npm install -g npm@9
