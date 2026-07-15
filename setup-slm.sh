#!/usr/bin/env bash

# LARS Local SLM Installation and Setup Script
# ============================================
# This script installs Ollama locally on Ubuntu Linux and pulls the Qwen Coder SLM.
# Everything runs offline and stays local on your machine.

set -e

echo "=== LARS LOCAL ASSISTANT SETUP ==="

# 1. Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "[SETUP] Ollama not found. Installing Ollama locally..."
    # Safe official local installation command for Linux
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo "[SETUP] Ollama is already installed."
fi

# 2. Check if Ollama service is running, start if not
echo "[SETUP] Checking Ollama service status..."
if ! curl -s http://localhost:11434/api/tags > /dev/null; then
    echo "[SETUP] Starting local Ollama service in the background..."
    ollama serve > /dev/null 2>&1 &
    sleep 3 # Give it a moment to boot
else
    echo "[SETUP] Local Ollama service is online."
fi

# 3. Pull the Qwen Coder SLM
echo "[SETUP] Downloading Qwen-2.5-Coder-1.5B model (approx. 900MB)..."
ollama pull qwen2.5-coder:1.5b

echo ""
echo "=== SETUP COMPLETE ==="
echo "The Small Language Model (SLM) is now running locally on localhost:11434."
echo "You can now run './lars chat' and LARS will connect to Qwen automatically!"
