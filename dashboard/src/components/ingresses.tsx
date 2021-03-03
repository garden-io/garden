/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import styled from "@emotion/styled"
import { ExternalLink } from "./links"
import { ServiceIngress } from "@garden-io/core/build/src/types/service"
import { truncateMiddle, getLinkUrl } from "../util/helpers"
import { useUiState } from "../hooks"

const Ingresses = styled.div`
  font-size: 1rem;
  line-height: 1.4rem;
  color: #4f4f4f;
  max-height: 5rem;
  overflow: hidden;
  overflow-y: auto;

  ::-webkit-scrollbar {
    -webkit-appearance: none;
    width: 7px;
  }
  ::-webkit-scrollbar-thumb {
    border-radius: 4px;
    background-color: rgba(0, 0, 0, 0.5);
    box-shadow: 0 0 1px rgba(255, 255, 255, 0.5);
  }
`
const LinkContainer = styled.div`
  padding-top: 0.25rem;
  font-size: 0.75rem;

  &:last-of-type {
    padding-bottom: 0;
  }
`

interface IngressesProp {
  ingresses: ServiceIngress[] | undefined
}

export default ({ ingresses }: IngressesProp) => {
  const {
    actions: { selectIngress },
  } = useUiState()

  const handleSelectIngress = (event) => {
    if (ingresses && ingresses.length) {
      const ingress = ingresses.find((i) => i.path === event.target.id)
      if (ingress) {
        selectIngress(ingress)
      }
    }
  }

  return (
    <Ingresses>
      {(ingresses || []).map((ingress) => {
        const url = getLinkUrl(ingress)
        return (
          <LinkContainer key={ingress.path}>
            <div className="visible-lg-block">
              <ExternalLink id={ingress.path} onClick={handleSelectIngress}>
                {truncateMiddle(url)}
              </ExternalLink>
            </div>
            <div className="hidden-lg">
              <ExternalLink href={url} target="_blank">
                {truncateMiddle(url)}
              </ExternalLink>
            </div>
          </LinkContainer>
        )
      })}
    </Ingresses>
  )
}
