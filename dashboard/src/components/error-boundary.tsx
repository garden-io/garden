/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { css } from "emotion"
import React from "react"

interface Props {
  errorMsg: string
}

interface State {
  hasError: boolean
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
  }

  static getDerivedStateFromError(_error: any) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.log(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={css`
            padding: 1rem;
            text-align: center;
          `}
        >
          <h4>Something went wrong</h4>
          <p>{this.props.errorMsg}</p>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
