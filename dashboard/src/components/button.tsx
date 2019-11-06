/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import { colors } from "../styles/variables"

export const TertiaryButton = styled.button`
  cursor: pointer;
  padding: 0;
  font-size: 0.8125rem;
  line-height: 1.1875rem;
  text-align: center;
  letter-spacing: 0.01em;
  color: ${colors.buttons.tertiary.default.color};
  background: none;

  &:hover {
    color: ${colors.buttons.tertiary.hover.color};
  }
  &:active {
    color: ${colors.buttons.tertiary.pressed.color};
  }
`
