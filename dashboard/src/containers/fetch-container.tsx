/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { Component } from "react"

import Spinner from "../components/spinner"

interface Props<T> {
  children: (data: { data: T }) => JSX.Element
  fetchFn: (...any) => Promise<T>
  ErrorComponent: React.SFC<any> | React.ComponentClass<any>
  skipSpinner?: boolean
}

interface State<T> {
  error: any
  isLoaded: boolean
  result: T
}

class FetchContainer<T> extends Component<Props<T>, State<T>> {

  // TODO This is not type safe
  static defaultProps = {
    skipSpinner: false,
  }

  constructor(props) {
    super(props)
    this.state = {
      error: null,
      isLoaded: false,
      result: null,
    }
  }

  componentDidMount() {
    // TODO Fetch function parameter? Currently we can just wrap the function.
    this.props.fetchFn()
      .then(
        result => {
          this.setState({
            isLoaded: true,
            result,
          })
        },
        // Note: it's important to handle errors here
        // instead of a catch() block so that we don't swallow
        // exceptions from actual bugs in components.
        error => {
          this.setState({
            isLoaded: true,
            error,
          })
        },
      )
  }

  render() {
    const { error, isLoaded, result } = this.state
    const { children, ErrorComponent, skipSpinner } = this.props
    if (error) {
      return <ErrorComponent error={error} />
    } else if (!isLoaded) {
      return skipSpinner ? "" : <Spinner />
    } else {
      return children({ data: result })
    }
  }
}

export default FetchContainer
