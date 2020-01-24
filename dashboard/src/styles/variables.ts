/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export const tablet = 768
export const desktop = 992
export const big = 1680

export const fontFamily = `font-family: Raleway, Arial, Helvetica, sans-serif`
export const fontBold = `${fontFamily};font-weight: 700;`
export const fontRegular = `${fontFamily};font-weight: 400;`
export const fontMedium = `${fontFamily};font-weight: 500;`
export const fontItalic = `${fontFamily};font-style: italic;`

function gardenPinkLighten(pct: number) {
  return `rgba(237, 131, 204, ${pct})`
}

// Colours prefixed with `garden` are from the official Garden colour palette.
// The rest are for those cases where none of the official colours worked.
export const colors = {
  border: "rgba(0,0,0,0.12)",
  gray: "#f0f0f0",
  black: "#192A3E",
  grayLight: "#fafafa",
  grayUnselected: "#C2CFE0",
  gardenGray: "#555656",
  gardenGrayLight: "#cdcfd1",
  gardenGrayLighter: "#FBFCFD",
  gardenBlack: "#010101",
  gardenBlue: "#00adef",
  gardenBlueDark: "#01569a",
  gardenBlueLight: "#e4f6fd",
  gardenGreenDarker: "#16999a",
  gardenGreenDark: "#00c9b6",
  gardenGreen: "#66ffcc",
  gardenGreenLight: "#c9ffed",
  gardenPink: "#ed83cc",
  gardenPinkLighten,
  gardenPinkRgba: "rgba(237, 131, 204, 0)",
  gardenWhite: "#ffffff",
  notifications: {
    error: {
      color: "#ce1126",
      backgroundColor: "#FFBABA",
    },
    warning: {
      color: "#9F6000",
      backgroundColor: "#FEEFB3",
    },
    success: {
      color: "#270",
      backgroundColor: "#DFF2BF",
    },
    info: {
      color: "#059",
      backgroundColor: "#BEF",
    },
  },
  state: {
    ready: "#2ED47A",
    succeeded: "#2ED47A",
    failed: "#F7685B",
    deploying: "#FFB946",
    stopped: "#FFB946",
    unknown: "#FFB946",
    missing: "#F7685B",
    unhealthy: "#F7685B",
  },
  cardTypes: {
    service: "",
    test: "",
    run: "",
  },
  buttons: {
    primary: {},
    secondary: {},
    tertiary: {
      default: {
        color: "#109CF1",
      },
      hover: {
        color: "#34AFF9",
      },
      pressed: {
        color: "#098EDF",
      },
      disabled: {
        color: "#109CF1",
      },
    },
  },
  taskState: {
    cancelled: "#BBB",
    pending: "#ed83cc",
    processing: "#ed83cc",
    ready: "#66ffcc",
    error: "red",
  },
}
