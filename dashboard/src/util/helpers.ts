/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import normalizeUrl from "normalize-url"
import { format } from "url"
import { flatten } from "lodash"
import { ModuleConfig } from "@garden-io/core/build/src/config/module"
import { ServiceIngress } from "@garden-io/core/build/src/types/service"

export function getServiceNames(moduleConfigs: ModuleConfig[]) {
  return flatten(moduleConfigs.map((m) => m.serviceConfigs.map((s) => s.name)))
}

export function timeConversion(millisec) {
  const seconds = +(millisec / 1000).toFixed(1)
  const minutes = +(millisec / (1000 * 60)).toFixed(1)
  const hours = +(millisec / (1000 * 60 * 60)).toFixed(1)
  const days = +(millisec / (1000 * 60 * 60 * 24)).toFixed(1)
  let formatTime = (num, prefix) => `${num} ${prefix}`
  let timeFormatted: string | null = null
  if (seconds < 60) {
    timeFormatted = formatTime(seconds, "Sec")
  } else if (minutes < 60) {
    timeFormatted = formatTime(minutes, "Min")
  } else if (hours < 24) {
    timeFormatted = formatTime(hours, "Hrs")
  } else {
    timeFormatted = formatTime(days, "Days")
  }

  return timeFormatted
}

// function expects either a string in the form of "2019-05-18T08:30:08.601Z" or a Date
export function getDuration(start: string | Date, end: string | Date): string {
  const startValue = new Date(start).valueOf()
  const endValue = new Date(end).valueOf()
  const duration = timeConversion(endValue - startValue)
  return duration
}

export const truncateMiddle = (str: string, resLength: number = 35) => {
  if (str.length > resLength) {
    const middle = Math.ceil(resLength / 2)
    return str.substr(0, middle) + "..." + str.substr(str.length - middle, str.length)
  }

  return str
}

/**
 * Returns the link URL or falls back to constructing the URL from the ingress spec
 */
export function getLinkUrl(ingress: ServiceIngress) {
  if (ingress.linkUrl) {
    return ingress.linkUrl
  }

  return normalizeUrl(
    format({
      protocol: ingress.protocol,
      hostname: ingress.hostname,
      port: ingress.port,
      pathname: ingress.path,
    })
  )
}

/**
 * Test names are not unique so we construct a unique key from the module name and the test name.
 */
export function getTestKey({ testName, moduleName }: { testName: string; moduleName: string }) {
  return `${moduleName}.${testName}`
}

let _canvas: HTMLCanvasElement

/**
 * Uses canvas.measureText to compute and return the width of the given text of given font in pixels.
 *
 * @param {String} text The text to be rendered.
 * @param {String} font The css font descriptor that text is to be rendered with (e.g. "bold 14px verdana").
 *
 * @see https://stackoverflow.com/questions/118241/calculate-text-width-with-javascript/21015393#21015393
 */
export function getTextWidth(text: string, font: string) {
  // re-use canvas object for better performance
  const canvas = _canvas || (_canvas = document.createElement("canvas"))
  const context = canvas.getContext("2d")!
  context.font = font
  const metrics = context.measureText(text)
  return metrics.width
}

/**
 * Returns the auth key from the current page's URL params.
 */
export function getAuthKey() {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get("key")
}
