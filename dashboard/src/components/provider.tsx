/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useState } from "react"
import { Frame } from "./frame"
import Spinner from "./spinner"
import styled from "@emotion/styled"

interface ProviderPageProps {
  url: string
  active: boolean
}

const ProviderPageWrapper = styled.div`
  flex: 0 auto;
  border: 0;
  width: 100%;
  height: 100%;
`

const ProviderPageFrame: React.FC<ProviderPageProps> = ({ url, active }) => {
  const [loading, setLoading] = useState(true)

  const hideSpinner = () => {
    setLoading(false)
  }

  const frame = url && (
    <Frame src={url} onLoad={hideSpinner} height={"100%"} style={{ display: !loading ? "block" : "none" }} />
  )

  return (
    <ProviderPageWrapper style={{ display: active ? "block" : "none" }}>
      {loading ? <Spinner /> : null}
      {frame}
    </ProviderPageWrapper>
  )
}

export default ProviderPageFrame
