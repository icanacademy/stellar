#!/bin/bash

# ICAN Stellar - Mac Double-Click Launcher
# Double-click this file to start all Stellar applications

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Execute the main launcher script
"$SCRIPT_DIR/start-all-apps.sh"
