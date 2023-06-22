/**
 * Copyright 2022 Google LLC
 * Modifications copyright 2022 Garden Germany GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

output "kubernetes_endpoint" {
  description = "The cluster endpoint"
  sensitive   = true
  value       = module.gke.endpoint
}

output "cluster_name" {
  description = "Cluster name"
  value       = module.gke.name
}

output "location" {
  value = module.gke.location
}

output "master_kubernetes_version" {
  description = "Kubernetes version of the master"
  value       = module.gke.master_version
}

output "ca_certificate" {
  description = "The cluster ca certificate (base64 encoded)"
  value       = nonsensitive(module.gke.ca_certificate)
}

output "service_account" {
  description = "The service account to default running nodes as if not overridden in `node_pools`."
  value       = module.gke.service_account
}

output "network_name" {
  description = "The name of the VPC being created"
  value       = module.gcp-network.network_name
}

output "subnet_names" {
  description = "The names of the subnet being created"
  value       = module.gcp-network.subnets_names
}

output "region" {
  description = "The region in which the cluster resides"
  value       = module.gke.region
}

output "zones" {
  description = "List of zones in which the cluster resides"
  value       = module.gke.zones
}

output "project_id" {
  description = "The project ID the cluster is in"
  value       = var.project_id
}

output "kubeconfig_path" {
  value = local_file.kubeconfig.filename
}
