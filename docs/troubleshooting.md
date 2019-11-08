---
order: 8
title: Troubleshooting
---

# Troubleshooting

_This section could (obviously) use more work. Contributions are most appreciated!_

## I have a huge number of files in my repository and Garden is eating all my CPU/RAM

This issue often comes up on Linux, and in other scenarios where the filesystem doesn't support event-based file watching.

Thankfully, you can in most cases avoid this problem using the `modules.exclude` field in your project config, and/or the `exclude` field in your individual module configs. See the [Including/excluding files and directories](./using-garden/configuration-files#including-excluding-files-and-directories) section in our Configuration Files guide for details.

## I'm getting an "EPERM: operation not permitted, rename..." error on Windows

This is a known issue with Windows and may affect many Node.js applications (and possibly others).
To fix it, you can open the Windows Defender Security Center and either

- a) disable Real-time protection; or
- b) click "Add or remove exclusions" and add "$HOME\\.garden" to the list of exclusions.

## When using Garden inside tmux, colors look wonky. What gives?

You need to set tmux to use 256 colors. As per the [official documentation](https://github.com/tmux/tmux/wiki/FAQ#how-do-i-use-a-256-colour-terminal), you can do that by adding `set -g default-terminal "screen-256color"`
or `set -g default-terminal "tmux-256color"` to your `~/.tmux.conf` file.
