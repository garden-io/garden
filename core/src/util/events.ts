/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type {
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

import EventEmitter2 from "eventemitter2"

interface ListenerFn<V = any> {
  (payload: V, ...values: any[]): void
}

// Copied and adapted from the eventemitter2 type
// @ts-expect-error There is a class of the same name, but this one has the declaration only
declare class _TypedEventEmitter<T> {
  constructor(options?: ConstructorOptions)
  emit<N extends keyof T>(event: N, payload: T[N]): boolean
  emitAsync<N extends keyof T>(event: N, payload: T[N]): Promise<any[]>
  addListener<N extends keyof T>(event: N, listener: ListenerFn<T[N]>): this | Listener
  on<N extends keyof T>(event: N, listener: ListenerFn<T[N]>, options?: boolean | OnOptions): this | Listener
  prependListener<N extends keyof T>(
    event: N,
    listener: ListenerFn<T[N]>,
    options?: boolean | OnOptions
  ): this | Listener
  once<N extends keyof T>(event: N, listener: ListenerFn<T[N]>, options?: true | OnOptions): this | Listener
  prependOnceListener<N extends keyof T>(
    event: N,
    listener: ListenerFn<T[N]>,
    options?: boolean | OnOptions
  ): this | Listener
  many<N extends keyof T>(
    event: N,
    timesToListen: number,
    listener: ListenerFn<T[N]>,
    options?: boolean | OnOptions
  ): this | Listener
  prependMany<N extends keyof T>(
    event: N,
    timesToListen: number,
    listener: ListenerFn<T[N]>,
    options?: boolean | OnOptions
  ): this | Listener
  onAny(listener: EventAndListener): this
  prependAny(listener: EventAndListener): this
  offAny(listener: ListenerFn): this
  removeListener<N extends keyof T>(event: N, listener: ListenerFn<T[N]>): this
  off<N extends keyof T>(event: N, listener: ListenerFn<T[N]>): this
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
  listenTo(target: GeneralEventEmitter, events: object, options?: ListenToOptions): this
  stopListeningTo(target?: GeneralEventEmitter, event?: keyof T | eventNS): boolean
  hasListeners(event?: string): boolean
  static once<T extends object = any>(
    emitter: _TypedEventEmitter<T>,
    event: keyof T | eventNS,
    options?: OnceOptions
  ): CancelablePromise<any[]>
  static defaultMaxListeners: number
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
class _TypedEventEmitter {}

export class TypedEventEmitter<T> extends _TypedEventEmitter<T> {
  constructor(options?: ConstructorOptions) {
    super()
    const cls = new EventEmitter2.EventEmitter2(options)
    Object.assign(this, cls)
  }
}

Object.getOwnPropertyNames(EventEmitter2.EventEmitter2.prototype).forEach((name) => {
  Object.defineProperty(
    TypedEventEmitter.prototype,
    name,
    Object.getOwnPropertyDescriptor(EventEmitter2.EventEmitter2.prototype, name) || Object.create(null)
  )
})
