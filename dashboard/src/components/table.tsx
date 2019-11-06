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

export type ColEl = React.ReactNode

interface Props {
  title: string
  rowHeaders: string[]
  rows: ColEl[][]
}

// Note: Padding intentionally uses rem units for left/right and em units for top/bottom
const colStyle = `
  padding: 1rem 0.75em;
  border-top: 1px solid ${colors.border};
`

const Td = styled.td`
  ${colStyle}
`

const Tr = styled.tr`
  :hover {
    background-color: ${colors.gardenGreenLight};
  }
`

const THead = styled.thead`
  color: ${colors.gardenGray};
  text-align: left;
`

const Th = styled.th`
  ${fontMedium}
  ${colStyle}
  color: grey;
`

const TableEl = styled.table`
  border-collapse: collapse;
  width: 100%;
`

const Table: React.FC<Props> = (props) => (
  <Card title={props.title}>
    <TableEl>
      <THead>
        <tr>
          {props.rowHeaders.map((header) => (
            <Th key={header}>{header}</Th>
          ))}
        </tr>
      </THead>
      <tbody>
        {props.rows.map((row, idx) => (
          <Tr key={idx}>
            {row.map((col, cidx) => {
              return <Td key={cidx}>{col}</Td>
            })}
          </Tr>
        ))}
      </tbody>
    </TableEl>
  </Card>
)

export default Table
