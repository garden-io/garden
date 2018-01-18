import { Module } from "./module"

export type ServiceState = "ready" | "deploying" | "unhealthy"

export interface ServiceStatus {
  providerId?: string
  version?: string
  state?: ServiceState
  runningReplicas?: number
  lastError?: string
  createdAt?: string
  updatedAt?: string
}

export interface Service<T extends Module> {
  module: T,
  name: string,
  config: any,
}
