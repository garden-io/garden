package main

import (
	"fmt"
	"log"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/garden-io/garden/garden-cli/dockerutil"
	"github.com/garden-io/garden/garden-cli/util"
)

func runSyncService(projectName string, gitRoot string, relPath string) error {
	homeDir := util.GetHomeDir()
	projectID := getProjectID(gitRoot)
	containerName := "garden-sync--" + projectName + "-" + projectID
	mountDir := "host-mount"
	volumeName := dockerutil.GetVolumeName(projectName, projectID)

	if _, found := dockerutil.FindVolume(volumeName); !found {
		err := dockerutil.CreateVolume(volumeName)
		util.Check(err)
	}

	// Nothing to do
	if _, found := dockerutil.FindContainer(containerName); found {
		return nil
	}

	volumeMounts := []mount.Mount{
		{
			Type:   mount.TypeVolume,
			Source: volumeName,
			Target: ProjectPath,
		},
	}
	binds := []string{
		"/var/run/docker.sock:/var/run/docker.sock",
		fmt.Sprintf("%s/.docker:/root/.docker", homeDir),
		fmt.Sprintf("%s:/%s:delegated", gitRoot, mountDir),
	}

	containerConfig := container.Config{
		Image: SyncImage,
		Cmd:   []string{"/bin/sh"},
		Tty:   true,
	}

	hostConfig := container.HostConfig{
		Binds:      binds,
		Mounts:     volumeMounts,
		AutoRemove: true,
	}

	log.Println("Starting Garden for this project for the first time, it may take a while for the project to sync")

	_, err := dockerutil.RunContainer(containerConfig, hostConfig, containerName)
	util.Check(err)

	// first we sync the contents of the host-mount dir into the project volume and wait for it to finish
	// (need the "echo yes" to get past the confirmation)
	dockerutil.Exec([]string{
		"exec", containerName,
		"echo", "yes", "|", "unison", "-force", mountDir, mountDir, ProjectPath,
	}, true)

	// then we watch for changes in the background
	dockerutil.Exec([]string{
		"exec", "-d", containerName,
		"unison", "-repeat", "watch", "-force", mountDir, mountDir, ProjectPath,
	}, true)

	return err
}
