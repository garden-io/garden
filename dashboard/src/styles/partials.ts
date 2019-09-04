/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { css } from "emotion"

const clickable = css`
  cursor: pointer;
`

const noWarp = css`
  white-space: nowrap;
`

const useWhiteSpaces = css`
  white-space: pre-wrap;
`

const truncate = css`
  ${noWarp};
  overflow: hidden;
  text-overflow: ellipsis;
`

const breakWords = css`
  overflow-wrap: break-word;
  word-wrap: break-word;
  -ms-word-break: break-all;
  word-break: break-word;
  hyphens: auto;
`

const responsiveImage = css`
  max-width: 100%;
  height: auto;
  display: block;
`

/* Removes line-height top space - rem based */
const withoutLhTopSpace = (fontSize, lineHeight) => {
  return css`
    &::before {
      content: "";
      display: block;
      height: 0;
      width: 0;
      margin-top: calc((1 - ${parseFloat(String(lineHeight / fontSize))}) * ${parseFloat(String(fontSize / 2))}rem);
    }
  `
}

export { clickable, noWarp, useWhiteSpaces, truncate, breakWords, responsiveImage, withoutLhTopSpace }
