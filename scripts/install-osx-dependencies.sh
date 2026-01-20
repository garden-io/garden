#!/usr/bin/env bash

# install/update homebrew dependencies
BREW_DEPS="jq cmake git kubectl helm icu4c pkg-config git-chglog parallel"

brew update
brew tap git-chglog/git-chglog
brew install ${BREW_DEPS}
brew upgrade ${BREW_DEPS}

# install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# make nvm command active without terminal reopening
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
# install node
nvm install v22
nvm alias default v22
nvm use default

# install/update global packages
npm install -g typescript

# install npm
npm install -g npm@10
