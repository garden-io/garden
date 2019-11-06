/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { css } from "emotion"

import { tablet, desktop, big } from "./variables"

const sizes = { desktop, tablet, big }
const orientations = { portrait: "portrait", landscape: "landscape" }

interface Media {
  tablet: (...args) => string
  desktop: (...args) => string
  big: (...args) => string
}

interface Orientation {
  portrait: (...args) => string
  landscape: (...args) => string
}

const media = Object.keys(sizes).reduce((acc, label) => {
  acc[label] = (...args) => css`
    @media (min-width: ${sizes[label]}px) {
      ${css(...args)};
    }
  `

  return acc
}, {})

export const orientation = Object.keys(orientations).reduce((acc, label) => {
  acc[label] = (...args) => css`
    @media only screen and (max-width: ${tablet}px) and (orientation: ${orientations[label]}) {
      ${css(...args)};
    }
  `

  return acc
}, {}) as Orientation

export default media as Media
