package main

import (
	"fmt"
	"log"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/garden-io/garden/garden-cli/dockerutil"
	"github.com/garden-io/garden/garden-cli/syncutil"
	"github.com/garden-io/garden/garden-cli/util"
	"github.com/pkg/errors"
)

// Runs the sync container and starts the sync session (if needed)
func runSyncContainer(containerName string, volumeName string, gitRoot string) error {
	homeDir := util.GetHomeDir()

	syncContainer, found, err := dockerutil.FindContainer(containerName)
	if err != nil {
		return errors.Wrap(err, "find container error")
	}

	// Stop the sync session if container not found or not running. We (re)start it once the container is running.
	// TODO Enable resuming from a sync session instead of stopping and restarting.
	if found && syncContainer.State != "running" || !found {
		if err := stopSync(gitRoot); err != nil {
			return err
		}
	}

	// Start the container if found but not running
	if found && syncContainer.State != "running" {
		if err := dockerutil.StartContainer(syncContainer.ID); err != nil {
			return errors.Wrap(err, "unable to start garden sync container")
		}
	}

	// Create and run the container if not found
	if !found {
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

		if _, err := dockerutil.RunContainer(containerConfig, hostConfig, containerName); err != nil {
			return errors.Wrap(err, "unable to run garden sync container")
		}

	}

	return nil
}

func ensureVolume(volumeName string, syncContainerName string, serviceContainerName string) error {
	_, found, err := dockerutil.FindVolume(volumeName)
	if err != nil {
		return err
	}

	if !found {
		if _, err := dockerutil.CreateVolume(volumeName); err != nil {
			return errors.Wrap(err, "unable to create volume")
		}
	}
	return nil
}

// Initialises sync if no session with the given source found. If a session is found, removes any duplicates and returns.
func initSync(source string, targetContainer string) error {
	if err := syncutil.StartSyncDaemon(); err != nil {
		return err
	}

	session, found, err := syncutil.FindSession(source)
	if err != nil {
		return err
	}

	// Session found, nothing to do (except ensure that the session is unique)
	if found {
		// There could technically be several active sync sessions for the same source (shouldn't happen though)
		if err := syncutil.RemoveDuplicateSessions(session); err != nil {
			return err
		}

		return nil
	}

	// TODO Nicer log output
	log.Println("Starting Garden for this project for the first time, it may take a while for the project to sync")
	_, err = syncutil.CreateSession(source, targetContainer, ProjectPath)
	return err
}

func stopSync(source string) error {
	return syncutil.TerminateSession(source)
}
