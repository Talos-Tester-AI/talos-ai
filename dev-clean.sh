#!/bin/bash
# Wrapper script to filter out harmless D-Bus/systemd errors from npm dev
# The error comes from Chromium/Electron trying to register with systemd
# when a scope already exists. It's completely harmless.

# Check if stdbuf is available (usually Linux)
if command -v stdbuf >/dev/null 2>&1; then
    # Use stdbuf to disable buffering and sed to filter the error
    stdbuf -oL -eL npx vite 2>&1 | stdbuf -oL -eL sed '/dbus\/object_proxy\.cc.*StartTransientUnit/d'
else
    # On systems without stdbuf (like macOS), just run vite directly
    # We likely don't need the systemd filter on macOS anyway
    npx vite
fi

