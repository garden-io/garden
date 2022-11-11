const k8s = require('../../../node_modules/@kubernetes/client-node');

const kc = new k8s.KubeConfig()

kc.loadFromDefault(undefined, true)

const k8sApi = kc.makeApiClient(k8s.CoreV1Api)

k8sApi.listNamespace().then(res => {
  console.log(res.body.items.forEach((ns) => console.log(ns.metadata?.name)))
})