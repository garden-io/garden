/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import { colors, fontRegular } from "../styles/variables"

export const H2 = styled.h2`
  ${fontRegular};
  font-size: 2rem;
  line-height: 3.5rem;
  color: ${(props) => props.color || colors.gardenBlack};
  margin: 0 0 2rem 0;
`

export const H3 = styled.h3`
  ${fontRegular};
  font-size: 1.75rem;
  line-height: 3.2rem;
  color: ${(props) => props.color || colors.gardenBlack};
  margin: 0 0 2rem 0;
`
