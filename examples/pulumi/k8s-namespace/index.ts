import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

const config = new pulumi.Config();

const name = config.require("namespace")

const ns = new k8s.core.v1.Namespace(config.require("namespace"), { metadata: { name } })
export const namespace = ns.metadata.name
