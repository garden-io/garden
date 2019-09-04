/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"

import { colors } from "../styles/variables"

export interface SpinnerProps {
  fontSize?: string
  size?: string
  background?: string
}

// From https://projects.lukehaas.me/css-loaders/
const Spinner = styled<any, SpinnerProps>("div")`
  font-size: ${(props) => props.fontSize || "6px"};
  margin: 50px auto;
  text-indent: -9999em;
  width: ${(props) => props.size || "4.5rem"};
  height: ${(props) => props.size || "4.5rem"};
  border-radius: 50%;
  background: ${colors.gardenPink};
  background: linear-gradient(to right, ${colors.gardenPink} 10%, ${colors.gardenPinkRgba} 42%);
  position: relative;
  -webkit-animation: load3 1.4s infinite linear;
  animation: load3 1.4s infinite linear;
  -webkit-transform: translateZ(0);
  -ms-transform: translateZ(0);
  transform: translateZ(0);
  :before {
    width: 50%;
    height: 50%;
    background: ${colors.gardenPink};
    border-radius: 100% 0 0 0;
    position: absolute;
    top: 0;
    left: 0;
    content: "";
  }
  :after {
    background: ${(props) => props.background || colors.grayLight};
    width: 75%;
    height: 75%;
    border-radius: 50%;
    content: "";
    margin: auto;
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
  }
  @-webkit-keyframes load3 {
    0% {
      -webkit-transform: rotate(0deg);
      transform: rotate(0deg);
    }
    100% {
      -webkit-transform: rotate(360deg);
      transform: rotate(360deg);
    }
  }
  @keyframes load3 {
    0% {
      -webkit-transform: rotate(0deg);
      transform: rotate(0deg);
    }
    100% {
      -webkit-transform: rotate(360deg);
      transform: rotate(360deg);
    }
  }
`

export default Spinner
