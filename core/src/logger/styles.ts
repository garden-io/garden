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
const colors = {
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
 */
export const styles = {
  ...colors,
  italic: chalk.italic,
  underline: chalk.underline,
  bold: chalk.bold,
  link: colors.highlight.underline,
  section: colors.highlight.italic,
  command: colors.highlightSecondary.bold,
}
