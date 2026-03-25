#!/bin/bash
set -e

if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install it from https://www.docker.com and re-run this script."
    exit 1
fi

echo "Starting setup, this may take 10-20 minutes on first run..."

docker compose up -d --build

echo "Waiting for Ollama to start..."
sleep 15

docker exec smartlogparser-ollama-1 ollama pull llama3.2

echo "Setup complete! Visit http://localhost:8080"
