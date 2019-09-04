/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import styled from "@emotion/styled"
import { colors } from "../styles/variables"

const Notification = styled.div`
  border-radius: 3px 3px 3px 3px;
  padding: 0.5rem;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
`

const NotificationIcon = styled.i`
  padding-right: 0.5rem;
`

export const Error = styled(Notification)`
  color: ${colors.notifications.error.color};
  background-color: ${colors.notifications.error.backgroundColor};
`

export const ErrorNotification = ({ children }) => {
  return (
    <Error>
      <NotificationIcon className="fas fa-times-circle" />
      {children}
    </Error>
  )
}

export const Warning = styled(Notification)`
  color: ${colors.notifications.warning.color};
  background-color: ${colors.notifications.warning.backgroundColor};
`
export const WarningNotification = ({ children }) => {
  return (
    <Warning>
      <NotificationIcon className="fas fa-exclamation-triangle" />
      {children}
    </Warning>
  )
}

export const Success = styled(Notification)`
  color: ${colors.notifications.success.color};
  background-color: ${colors.notifications.success.backgroundColor};
`
export const SuccessNotification = ({ children }) => {
  return (
    <Success>
      <NotificationIcon className="fas fa-check" />
      {children}
    </Success>
  )
}

export const Info = styled(Notification)`
  color: ${colors.notifications.info.color};
  background-color: ${colors.notifications.info.backgroundColor};
`

export const InfoNotification = ({ children }) => {
  return (
    <Info>
      <NotificationIcon className="fas fa-info-circle" />
      {children}
    </Info>
  )
}
