package dockerutil

import (
	"log"
	"os"
	"os/exec"
)

// TODO: Use the Docker Golang SDK instead of shelling out here

func Exec(args []string, silent bool) error {
	binary, err := exec.LookPath("docker")
	if err != nil {
		log.Fatal("Could not find docker - Garden requires docker to be installed in order to run.")
	}

	cmd := exec.Command(binary, args...)

	cmd.Env = os.Environ()
	if !silent {
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
	}

	return cmd.Run()
}

// TODO Use Docker SDK
func HasVolume(volumeName string) bool {
	args := []string{"volume", "inspect", volumeName}
	err := Exec(args, true)
	if err != nil {
		return false
	}
	return true
}

func MakeVolume(volumeName string) error {
	args := []string{"volume", "create", "--name", volumeName}
	return Exec(args, true)
}

func GetVolumeName(projectName string, projectID string) string {
	return "garden-volume--" + projectName + "-" + projectID
}

// TODO Use Docker SDK
func HasContainer(containerName string) bool {
	args := []string{"inspect", containerName}
	err := Exec(args, true)
	if err != nil {
		return false
	}
	return true
}
