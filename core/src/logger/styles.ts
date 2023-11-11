/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"

/**
 * A map of all the colors we use to render text in the terminal.
 */
const theme = {
  primary: chalk.grey,
  secondary: chalk.grey,
  // primary: chalk.hex("#a6a1c7"),
  // secondary: chalk.hex("#454a70"),
  accent: chalk.white,
  highlight: chalk.cyan,
  highlightSecondary: chalk.magenta,
  // warning: chalk.hex("#FFA500"),
  warning: chalk.yellow,
  error: chalk.red,
  success: chalk.green,
}

/**
 * A map of all the styles we use to render text in the terminal.
 *
 * This should always be preferred over Chalk to ensure consistency
 * and make it easy to update styles in a single place.
 *
 * To keep things simple, the map contains:
 *  - color styles such as "primary"
 *  - text styles such "italic"
 *  - element styles such as "link".
 *
 * ...all of which can be accessed by calling this map.
 *
 * NOTE: In most cases you don't need to apply these styles and can just call
 * the logger directly.
 *
 * For example, you should call `log.warn("oh no")` instead of `log.warn(styles.warning("oh no"))`.
 * since the logger applies the warning styles for you.
 */
export const styles = {
  ...theme,
  italic: chalk.italic,
  underline: chalk.underline,
  bold: chalk.bold,
  link: theme.highlight.underline,
  section: theme.highlight.italic,
  command: theme.highlightSecondary.bold,
}
