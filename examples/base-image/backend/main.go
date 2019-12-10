package main

import (
	"fmt"
	"net/http"
	"os"
)

func handler(w http.ResponseWriter, r *http.Request) {
	env := os.Getenv("APP_ENV")
	fmt.Fprint(w, env+" backend says hi!")
}

func main() {
	http.HandleFunc("/backend", handler)
	fmt.Println("Server running...")

	http.ListenAndServe(":8080", nil)
}
