package main

import (
	"math/rand"
	"os"
	"time"

	"github.com/mitchellh/go-homedir"
)

// Use this for unexpected errors, like system errors that we have no sensible way of dealing with.
func check(err error) {
	if err != nil {
		panic(err)
	}
}

var letters = []rune("abcdefghijklmnopqrstuvwxyz1234567890")

// Generate a random string of length n.
func randSeq(n int) string {
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
func getHomeDir() string {
	homeDir, err := homedir.Dir()
	check(err)
	homeDir, err = homedir.Expand(homeDir)
	check(err)
	return homeDir
}

// Makes sure the given directory path exists.
func ensureDir(path string) {
	os.MkdirAll(path, os.ModePerm)
}
