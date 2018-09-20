# Frequently Asked Questions

### When using garden inside tmux, colors look wonky. What gives?

You need to set tmux to use 256 colors. As per the [official documentation](https://github.com/tmux/tmux/wiki/FAQ#how-do-i-use-a-256-colour-terminal), you 
can do that by adding `set -g default-terminal "screen-256color"` or `set -g default-terminal "tmux-256color"` to your `~/.tmux.conf` file.
