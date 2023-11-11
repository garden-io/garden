/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"

// Helper types for ensuring the consumer of the "styles" map defined below
// can only call the allowed keys when chaining styles.
// Otherwise you could do something like `styles.primary.red` and "break out"
// of the pre-defined styles.
//
// Requires and ugly cast in the maps below but I couldn't find a more elegant
// way to do this with just Typescript.
type ThemeKey =
  | "primary"
  | "secondary"
  | "accent"
  | "highlight"
  | "highlightSecondary"
  | "warning"
  | "error"
  | "success"
type StyleKey = "bold" | "underline" | "italic" | "link" | "section" | "command"
type StyleFn = (s: string) => string

export type Styles = StyleFn & { [key in ThemeKey | StyleKey]: Styles }

/**
 * A map of all the colors we use to render text in the terminal.
 */
const theme = {
  primary: chalk.grey as unknown as Styles,
  secondary: chalk.grey as unknown as Styles,
  accent: chalk.white as unknown as Styles,
  highlight: chalk.cyan as unknown as Styles,
  highlightSecondary: chalk.magenta as unknown as Styles,
  warning: chalk.yellow as unknown as Styles,
  error: chalk.red as unknown as Styles,
  success: chalk.green as unknown as Styles,
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
  bold: chalk.bold as unknown as Styles,
  underline: chalk.underline as unknown as Styles,
  italic: chalk.italic as unknown as Styles,
  link: theme.highlight.underline as unknown as Styles,
  section: theme.highlight.italic as unknown as Styles,
  command: theme.highlightSecondary.bold as unknown as Styles,
}
