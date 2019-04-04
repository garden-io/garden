/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import React from "react"
import Card from "./card"
import { colors, fontMedium } from "../styles/variables"

interface Props {
  title: string
}

const TestResult: React.SFC<Props> = props => (
  <Card title={props.title}>
    <div>test</div>
  </Card>
)

export default TestResult
