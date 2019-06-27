# Troubleshooting

_This section could (obviously) use more work. Contributions are most appreciated!_

## I'm getting an "EPERM: operation not permitted, rename..." error on Windows

This is a known issue with Windows and may affect many Node.js applications (and possibly others).
To fix it, you can open the Windows Defender Security Center and either

- a) disable Real-time protection; or
- b) click "Add or remove exclusions" and add "$HOME\\.garden" to the list of exclusions.

## When using Garden inside tmux, colors look wonky. What gives?

You need to set tmux to use 256 colors. As per the [official documentation](https://github.com/tmux/tmux/wiki/FAQ#how-do-i-use-a-256-colour-terminal), you can do that by adding `set -g default-terminal "screen-256color"`
or `set -g default-terminal "tmux-256color"` to your `~/.tmux.conf` file.
