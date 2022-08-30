/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  CancelablePromise,
  ConstructorOptions,
  EventAndListener,
  eventNS,
  GeneralEventEmitter,
  Listener,
  ListenToOptions,
  OnceOptions,
  OnOptions,
  WaitForFilter,
  WaitForOptions,
} from "eventemitter2"

// Note: This file is a fairly ugly hack to add some additional type safety possibilities on eventemitter2.
// Ain't pretty here, but it does work in usage.

const EventEmitter2 = require("eventemitter2")

interface ListenerFn<V = any> {
  (payload: V, ...values: any[]): void
}

// Copied and adapted from the eventemitter2 type
// @ts-expect-error
declare class _TypedEventEmitter<T extends object> {
  constructor(options?: ConstructorOptions)
  emit<N extends keyof T>(event: N | eventNS, payload: T[N]): boolean
  emitAsync<N extends keyof T>(event: N | eventNS, payload: T[N]): Promise<any[]>
  addListener<N extends keyof T>(event: N | eventNS, listener: ListenerFn<T[N]>): this | Listener
  on<N extends keyof T>(event: N | eventNS, listener: ListenerFn<T[N]>, options?: boolean | OnOptions): this | Listener
  prependListener<N extends keyof T>(
    event: N | eventNS,
    listener: ListenerFn<T[N]>,
    options?: boolean | OnOptions
  ): this | Listener
  once<N extends keyof T>(event: N | eventNS, listener: ListenerFn<T[N]>, options?: true | OnOptions): this | Listener
  prependOnceListener<N extends keyof T>(
    event: N | eventNS,
    listener: ListenerFn<T[N]>,
    options?: boolean | OnOptions
  ): this | Listener
  many<N extends keyof T>(
    event: N | eventNS,
    timesToListen: number,
    listener: ListenerFn<T[N]>,
    options?: boolean | OnOptions
  ): this | Listener
  prependMany<N extends keyof T>(
    event: N | eventNS,
    timesToListen: number,
    listener: ListenerFn<T[N]>,
    options?: boolean | OnOptions
  ): this | Listener
  onAny(listener: EventAndListener): this
  prependAny(listener: EventAndListener): this
  offAny(listener: ListenerFn): this
  removeListener<N extends keyof T>(event: N | eventNS, listener: ListenerFn<T[N]>): this
  off<N extends keyof T>(event: N | eventNS, listener: ListenerFn<T[N]>): this
  removeAllListeners(event?: keyof T | eventNS): this
  setMaxListeners(n: number): void
  getMaxListeners(): number
  eventNames(nsAsArray?: boolean): (keyof T | eventNS)[]
  listenerCount(event?: keyof T | eventNS): number
  listeners(event?: keyof T | eventNS): ListenerFn[]
  listenersAny(): ListenerFn[]
  waitFor(event: keyof T | eventNS, timeout?: number): CancelablePromise<any[]>
  waitFor(event: keyof T | eventNS, filter?: WaitForFilter): CancelablePromise<any[]>
  waitFor(event: keyof T | eventNS, options?: WaitForOptions): CancelablePromise<any[]>
  listenTo(target: GeneralEventEmitter, events: keyof T | eventNS, options?: ListenToOptions): this
  listenTo(target: GeneralEventEmitter, events: keyof T[], options?: ListenToOptions): this
  listenTo(target: GeneralEventEmitter, events: Object, options?: ListenToOptions): this
  stopListeningTo(target?: GeneralEventEmitter, event?: keyof T | eventNS): Boolean
  hasListeners(event?: String): Boolean
  static once<T extends object = any>(
    emitter: _TypedEventEmitter<T>,
    event: keyof T | eventNS,
    options?: OnceOptions
  ): CancelablePromise<any[]>
  static defaultMaxListeners: number
}

// @ts-ignore
class _TypedEventEmitter extends EventEmitter2 {}

export class TypedEventEmitter<T extends object> extends _TypedEventEmitter<T> {
  constructor(options?: ConstructorOptions) {
    super()
    const cls = new EventEmitter2(options)
    Object.assign(this, cls)
  }
}
