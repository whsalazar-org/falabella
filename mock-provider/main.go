// Command mock-provider is a deterministic, OpenAI-compatible chat-completions
// stub used by the end-to-end suite so runs never depend on a real provider key.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type completionRequest struct {
	Model    string    `json:"model"`
	Messages []message `json:"messages"`
}

// failureTrigger lets a test drive the provider-failure path deterministically:
// any prompt containing this marker makes the stub answer with an error.
const failureTrigger = "trigger-provider-failure"

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /v1/chat/completions", complete)

	server := &http.Server{
		Addr:              ":" + env("PORT", "9090"),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("mock provider listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}

func complete(w http.ResponseWriter, r *http.Request) {
	var request completionRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]string{"message": "invalid request body"},
		})
		return
	}

	var lastUserPrompt string
	for _, item := range request.Messages {
		if item.Role == "user" {
			lastUserPrompt = item.Content
		}
	}

	if strings.Contains(strings.ToLower(lastUserPrompt), failureTrigger) {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"error": map[string]string{"message": "mock provider failure"},
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"choices": []map[string]any{
			{
				"message": map[string]string{
					"role":    "assistant",
					"content": "Mock answer from " + request.Model + ": " + lastUserPrompt,
				},
			},
		},
	})
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write response: %v", err)
	}
}
