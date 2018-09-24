package kubernetes

// *********** THIS IS CURRENTLY NOT USED ************

// import (
// 	"crypto/sha1"
// 	"encoding/hex"
// 	"io"
// 	"path/filepath"

// 	"k8s.io/apimachinery/pkg/runtime"
// 	"k8s.io/apimachinery/pkg/runtime/serializer/json"
// 	"k8s.io/client-go/kubernetes/scheme"

// 	appsv1 "k8s.io/api/apps/v1"
// 	corev1 "k8s.io/api/core/v1"
// 	"k8s.io/apimachinery/pkg/api/resource"
// 	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
// 	"k8s.io/client-go/kubernetes"
// 	"k8s.io/client-go/tools/clientcmd"
// 	"k8s.io/client-go/util/homedir"
// )

// const hashAnnotationKey = "garden.io/hash"
// const namespace = "garden-system"

// // loadClient parses a kubeconfig from a file and returns a Kubernetes
// // client. It does not support extensions or client auth providers.
// func loadClient() (*kubernetes.Clientset, error) {
// 	var kubeconfig string
// 	// TODO: allow some way(s) to configure this
// 	home := homedir.HomeDir()
// 	kubeconfig = filepath.Join(home, ".kube", "config")

// 	config, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
// 	if err != nil {
// 		return nil, err
// 	}
// 	clientset, err := kubernetes.NewForConfig(config)
// 	if err != nil {
// 		return nil, err
// 	}

// 	return clientset, nil
// }

// type ensureVolumeParams struct {
// 	clientset   *kubernetes.Clientset
// 	kubeContext string
// 	namespace   string
// 	projectID   string
// 	gitRoot     string
// }

// func ensureK8sVolume(params ensureVolumeParams) (*corev1.PersistentVolume, error) {
// 	name := params.projectID

// 	pv := corev1.PersistentVolume{
// 		ObjectMeta: metav1.ObjectMeta{
// 			Name:        name,
// 			Annotations: map[string]string{},
// 		},
// 		Spec: corev1.PersistentVolumeSpec{
// 			AccessModes: []corev1.PersistentVolumeAccessMode{"ReadWriteOnce"},
// 			Capacity: corev1.ResourceList{
// 				"storage": resource.MustParse("5Gi"),
// 			},
// 			PersistentVolumeSource: corev1.PersistentVolumeSource{
// 				HostPath: &corev1.HostPathVolumeSource{
// 					// TODO: swap this out out when we start syncing data
// 					Path: params.gitRoot,
// 				},
// 			},
// 		},
// 	}

// 	hash, err := hashObject(&pv)
// 	check(err)

// 	pv.ObjectMeta.Annotations[hashAnnotationKey] = hash

// 	client := params.clientset.CoreV1().PersistentVolumes()

// 	existing, err := client.Get(name, metav1.GetOptions{IncludeUninitialized: true})
// 	if err != nil {
// 		return existing, err
// 	}

// 	if existing == nil {
// 		return client.Create(&pv)
// 	} else if existing.ObjectMeta.Annotations[hashAnnotationKey] == hash {
// 		return existing, nil
// 	} else {
// 		return client.Update(&pv)
// 	}
// }

// type ensureServiceParams struct {
// 	clientset   *kubernetes.Clientset
// 	kubeContext string
// 	namespace   string
// 	projectID   string
// 	gitRoot     string
// }

// func ensureK8sService(params ensureServiceParams) (*appsv1.Deployment, error) {
// 	clientset := params.clientset
// 	name := params.projectID
// 	home := homedir.HomeDir()

// 	deployment := appsv1.Deployment{
// 		ObjectMeta: metav1.ObjectMeta{
// 			Name:        name,
// 			Annotations: map[string]string{},
// 		},
// 		Spec: appsv1.DeploymentSpec{
// 			Replicas: int32Ptr(1),
// 			Selector: &metav1.LabelSelector{
// 				MatchLabels: map[string]string{
// 					"app": "garden-service",
// 				},
// 			},
// 			Template: corev1.PodTemplateSpec{
// 				ObjectMeta: metav1.ObjectMeta{
// 					Labels: map[string]string{
// 						"app": "garden-service",
// 					},
// 				},
// 				Spec: corev1.PodSpec{
// 					Containers: []corev1.Container{
// 						{
// 							// TODO: run in "serve" mode
// 							Args: []string{},
// 							Name: name,
// 							// TODO: use specific version
// 							Image:           "garden-service:latest",
// 							ImagePullPolicy: "IfNotPresent",
// 							Ports: []corev1.ContainerPort{
// 								{
// 									Name:          "http",
// 									Protocol:      "TCP",
// 									ContainerPort: 80,
// 								},
// 							},
// 							VolumeMounts: []corev1.VolumeMount{
// 								corev1.VolumeMount{
// 									Name: "docker-home",
// 									MountPath: "/root/.docker",
// 								},
// 								corev1.VolumeMount{
// 									Name: "docker-sock",
// 									MountPath: "/var/run/docker.sock",
// 								},
// 								corev1.VolumeMount{
// 									Name: "garden-home",
// 									MountPath: "/root/.garden",
// 								},
// 								corev1.VolumeMount{
// 									Name: "kube-home",
// 									MountPath: "/root/.kube",
// 								},
// 								corev1.VolumeMount{
// 									Name: "project",
// 									MountPath: "/project",
// 								},
// 							},
// 							WorkingDir: "/project",
// 						},
// 					},
// 					HostNetwork: true,
// 					Volumes: []corev1.Volume{
// 						corev1.Volume{
// 							Name: "docker-home",
// 							VolumeSource: corev1.VolumeSource{
// 								HostPath: &corev1.HostPathVolumeSource{
// 									Path: home + "/.docker",
// 								},
// 							},
// 						},
// 						corev1.Volume{
// 							Name: "docker-sock",
// 							VolumeSource: corev1.VolumeSource{
// 								HostPath: &corev1.HostPathVolumeSource{
// 									Path: "/var/run/docker.sock",
// 								},
// 							},
// 						},
// 						corev1.Volume{
// 							Name: "garden-home",
// 							VolumeSource: corev1.VolumeSource{
// 								HostPath: &corev1.HostPathVolumeSource{
// 									Path: home + "/.garden",
// 								},
// 							},
// 						},
// 						corev1.Volume{
// 							Name: "kube-home",
// 							VolumeSource: corev1.VolumeSource{
// 								HostPath: &corev1.HostPathVolumeSource{
// 									Path: home + "/.kube",
// 								},
// 							},
// 						},
// 						corev1.Volume{
// 							Name: "project",
// 							VolumeSource: corev1.VolumeSource{
// 								HostPath: &corev1.HostPathVolumeSource{
// 									Path: "/project",
// 								},
// 							},
// 						},
// 					},
// 				},
// 			},
// 		},
// 	}

// 	hash, err := hashObject(&deployment)
// 	check(err)

// 	deployment.ObjectMeta.Annotations[hashAnnotationKey] = hash

// 	client := clientset.AppsV1().Deployments(namespace)

// 	existing, err := client.Get(name, metav1.GetOptions{IncludeUninitialized: true})
// 	if err != nil {
// 		return existing, err
// 	}

// 	if existing == nil {
// 		return client.Create(&deployment)
// 	} else if existing.ObjectMeta.Annotations[hashAnnotationKey] == hash {
// 		return existing, nil
// 	} else {
// 		return client.Update(&deployment)
// 	}
// }

// func toYaml(object runtime.Object, output io.Writer) error {
// 	// Create a YAML serializer.  JSON is a subset of YAML, so is supported too.
// 	s := json.NewYAMLSerializer(json.DefaultMetaFactory, scheme.Scheme, scheme.Scheme)

// 	// Encode the object to YAML.
// 	return s.Encode(object, output)
// }

// func hashObject(object runtime.Object) (string, error) {
// 	hash := sha1.New()
// 	err := toYaml(object, hash)
// 	if err != nil {
// 		return "", err
// 	}

// 	return hex.EncodeToString(hash.Sum(nil)), nil
// }
