/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import styled from "@emotion/styled"
import { ExternalLink } from "./links"
import { ServiceIngress } from "garden-cli/src/types/service"
import { truncateMiddle } from "../util/helpers"
import normalizeUrl from "normalize-url"
import { format } from "url"

const Ingresses = styled.div`
  font-size: 1rem;
  line-height: 1.4rem;
  color: #4f4f4f;
  height: 5rem;
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
  padding-bottom: 1rem;
  font-size: .75rem;

  &:last-of-type {
    padding-bottom: 0;
  }
`

const NoIngresses = styled.div`
  font-style: italic;
  font-size: .75rem;
`

const getIngressUrl = (ingress: ServiceIngress) => {
  return normalizeUrl(format({
    protocol: ingress.protocol,
    hostname: ingress.hostname,
    port: ingress.port,
    pathname: ingress.path,
  }))
}

interface IngressesProp {
  ingresses: ServiceIngress[] | undefined
}

export default ({ ingresses }: IngressesProp) => {
  return (
    <Ingresses>
      {ingresses && ingresses.map(i => {
        const url = getIngressUrl(i)
        return <LinkContainer key={i.path}>
          <ExternalLink href={url} target="_blank">
            {truncateMiddle(url)}
          </ExternalLink>
          <br />
        </LinkContainer>
      })}
      {(!ingresses || !ingresses.length) &&
        <NoIngresses>
          No ingresses found
        </NoIngresses>}
    </Ingresses>
  )
}
