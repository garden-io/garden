package util

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/exec"
	"time"

	"github.com/mitchellh/go-homedir"
)

// Use this for unexpected errors, like system errors that we have no sensible way of dealing with.
func Check(err error) {
	if err != nil {
		panic(err)
	}
}

var letters = []rune("abcdefghijklmnopqrstuvwxyz1234567890")

// Generate a random string of length n.
func RandSeq(n int) string {
	rand.Seed(time.Now().UnixNano())
	b := make([]rune, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}

func int32Ptr(value int32) *int32 {
	return &value
}

// Returns the current user's home directory, as an absolute path.
func GetHomeDir() string {
	homeDir, err := homedir.Dir()
	Check(err)
	homeDir, err = homedir.Expand(homeDir)
	Check(err)
	return homeDir
}

// Makes sure the given directory path exists.
func EnsureDir(path string) {
	os.MkdirAll(path, os.ModePerm)
}

func GetBin(binary string) string {
	binary, err := exec.LookPath(binary)
	if err != nil {
		log.Fatal(fmt.Sprintf("Could not find %s - Garden requires %s to be installed in order to run.", binary, binary))
	}
	return binary
}
