#!/bin/bash
# Wrapper script to filter out harmless D-Bus/systemd errors from npm dev
# The error comes from Chromium/Electron trying to register with systemd
# when a scope already exists. It's completely harmless.

# Use stdbuf to disable buffering and sed to filter the error
stdbuf -oL -eL npx vite 2>&1 | stdbuf -oL -eL sed '/dbus\/object_proxy\.cc.*StartTransientUnit/d'

