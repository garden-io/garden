/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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
  primary: chalk.white,
  secondary: chalk.grey,
  accent: chalk.blueBright,
  highlight: chalk.cyan,
  highlightSecondary: chalk.magenta,
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
 * the logger directly. For example, you should call `log.warn("oh no")`
 * instead of `log.warn(styles.warning("oh no"))` since the logger applies the
 * warning styles for you.
 */
export const styles = {
  ...theme,
  bold: chalk.bold,
  underline: chalk.underline,
  italic: chalk.italic,
  link: theme.highlight.underline,
  section: theme.highlight.italic,
  command: theme.highlightSecondary.bold,
}
