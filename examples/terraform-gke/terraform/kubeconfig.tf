data "google_container_cluster" "gke_cluster" {
  name     = module.gke.name
  location = module.gke.location

  # Make sure that we always use the same value for this that the module does, because the module doesn't export this as an output
  project = var.project_id
}

resource "local_file" "kubeconfig" {
  filename = "${path.module}/kubeconfig.yaml"
  content = templatefile("${path.module}/kubeconfig-template.yaml",
    {
      cluster_name    = module.gke.name
      endpoint        = module.gke.endpoint
      cluster_ca      = module.gke.ca_certificate
      client_cert     = data.google_container_cluster.gke_cluster.master_auth.0.client_certificate
      client_cert_key = data.google_container_cluster.gke_cluster.master_auth.0.client_key
    }
  )
}

# authorize client-admin for operations on K8s cluster
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
