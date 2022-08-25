package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
)

type Config struct {
	SharedConfigMessage string
}

func readConfig() Config {
	content, err := ioutil.ReadFile("./config/config.json")
	if err != nil {
		log.Fatal("Error when opening file: ", err)
	}

	var payload Config
	err = json.Unmarshal(content, &payload)
	if err != nil {
		log.Fatal("Error during Unmarshal(): ", err)
	}

	log.Printf("shared config loaded: %s\n", payload.SharedConfigMessage)
	return payload
}

func handler(w http.ResponseWriter, r *http.Request) {
	config := readConfig()

	fmt.Fprint(w, "Hello from Go! "+config.SharedConfigMessage)
}

func main() {
	http.HandleFunc("/hello-backend", handler)
	fmt.Println("Server running...")

	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		panic(err)
	}
}
