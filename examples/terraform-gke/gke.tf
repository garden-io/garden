variable "gcp_project_id" {
  type        = "string"
  description = "The project ID where we'll create the GKE cluster and related resources."
}

variable "gcp_region" {
  type        = "string"
  description = "The region where we'll create your resources (e.g. us-central1)."
  default     = "europe-west1"
}

variable "gcp_zone" {
  type        = "string"
  description = "The zone where we'll create your resources (e.g. us-central1-b)."
  default     = "europe-west1-b"
}
data "google_client_config" "current" {}

variable "gcp_network_name" {
  default = "tf-gke"
}

provider "google" {
  project = "${var.gcp_project_id}"
  region  = "${var.gcp_region}"
  zone    = "${var.gcp_zone}"
}
resource "google_compute_network" "default" {
  name                    = "${var.gcp_network_name}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "default" {
  name                     = "${var.gcp_network_name}"
  ip_cidr_range            = "10.127.0.0/20"
  network                  = "${google_compute_network.default.self_link}"
  region                   = "${var.gcp_region}"
  private_ip_google_access = true
}

data "google_container_engine_versions" "default" {
  location = "${var.gcp_zone}"
}


# See all available options at https://www.terraform.io/docs/providers/google/r/container_cluster.html
resource "google_container_cluster" "primary" {
  name               = "my-gke-cluster"
  location           = "${var.gcp_zone}"
  initial_node_count = 3
  min_master_version = "${data.google_container_engine_versions.default.latest_master_version}"
  network            = "${google_compute_subnetwork.default.name}"
  subnetwork         = "${google_compute_subnetwork.default.name}"

  master_auth {
    client_certificate_config {
      issue_client_certificate = true
    }
  }

  provisioner "local-exec" {
    when    = "destroy"
    command = "sleep 90"
  }
}

provider "kubernetes" {
  host = "https://${google_container_cluster.primary.endpoint}"

  load_config_file = false

  token = "${data.google_client_config.current.access_token}"
  cluster_ca_certificate = "${base64decode(google_container_cluster.primary.master_auth.0.cluster_ca_certificate)}"
}

resource "kubernetes_cluster_role_binding" "client_admin" {
  metadata {
    name = "client-admin"
  }
  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = "cluster-admin"
  }
  subject {
    kind      = "User"
    name      = "client"
    api_group = "rbac.authorization.k8s.io"
  }
  subject {
    kind      = "ServiceAccount"
    name      = "default"
    namespace = "kube-system"
  }
  subject {
    kind      = "Group"
    name      = "system:masters"
    api_group = "rbac.authorization.k8s.io"
  }
}

resource "local_file" "kubeconfig" {
  content = <<EOF
apiVersion: v1
clusters:
- name: gke
  cluster:
    certificate-authority-data: ${google_container_cluster.primary.master_auth.0.cluster_ca_certificate}
    server: https://${google_container_cluster.primary.endpoint}
contexts:
- name: gke
  context:
    cluster: gke
    user: gke
current-context: gke
kind: Config
preferences: {}
users:
- name: gke
  user:
    client-certificate-data: ${google_container_cluster.primary.master_auth.0.client_certificate}
    client-key-data: ${google_container_cluster.primary.master_auth.0.client_key}
EOF
  filename = "${path.module}/kubeconfig.yaml"
}

# The following outputs allow authentication and connectivity to the GKE Cluster.
output "gcp_project_id" {
  value = "${var.gcp_project_id}"
}

output "gcp_network" {
  value = "${google_compute_subnetwork.default.network}"
}

output "gcp_subnetwork_name" {
  value = "${google_compute_subnetwork.default.name}"
}

output "gke_master_ip" {
  value = "${google_container_cluster.primary.endpoint}"
  sensitive = true
}

output "gke_client_certificate" {
  value = "${google_container_cluster.primary.master_auth.0.client_certificate}"
  sensitive = true
}

output "gke_client_key" {
  value = "${google_container_cluster.primary.master_auth.0.client_key}"
  sensitive = true
}

output "gke_cluster_ca_certificate" {
  value = "${google_container_cluster.primary.master_auth.0.cluster_ca_certificate}"
  sensitive = true
}

output "kubeconfig_path" {
  value = "${local_file.kubeconfig.filename}"
}
