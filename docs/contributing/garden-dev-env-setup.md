---
title: Setting up Your Developer Environment
order: 4
---

## Step 1: Install Docker and Kubernetes

Please refer to our [installation docs](../guides/installation.md) for instructions on how to install Docker and Kubernetes for different platforms.

## Step 2: Clone the repo

```sh
git clone https://github.com/garden-io/garden.git
```

## Step 3: Install dependencies

### macOS

For Mac we have a script that installs all required dependencies.

If you haven't already, please [install Homebrew](https://docs.brew.sh/Installation). Then run:

```sh
./scripts/install-osx-dependencies.sh
```

### Windows / Linux

Other platforms need to roll their own for now (contributions welcome!). Please have a look at the script for OSX to see what's installed.

If you have [LinuxBrew](https://docs.brew.sh/Homebrew-on-Linux) installed, [install-osx-dependencies.sh](../../scripts/install-osx-dependencies.sh) should work if you run it, although you will have to ensure that you've added NPM to your PATH via `.bashrc` `.zshrc` or other shell run command script.

### asdf

If you are an [asdf](https://asdf-vm.com/) user, running [install-asdf-dependencies.sh](../../scripts/install-asdf-dependencies.sh) in order to automatically install the correct plugins and versions as defined in `.tool-versions`.

## Step 4: Bootstrap project

Install Node modules for the root package, and `core` package:

```sh
npm install # To install root dependencies
npm run bootstrap # To bootstrap packages
```

## Developing Garden

### Initial build

Before running Garden for the first time, you need to do an initial build by running

```sh
npm run build
```

from the root directory.

### Developing

To develop the CLI, run the `dev` command in your console:

```sh
npm run dev
```

This will link it to your global `node_modules` folder, and then watch for
changes and auto-rebuild as you code. You can then run the `garden` command as normal.

Also, you might like to add a couple of shorthands:

```sh
alias g='garden'
alias k='kubectl'
```
