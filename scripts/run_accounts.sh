#!/bin/bash

# Define your accounts in a "username:password" format inside secret.cfg.
# If an account has no password, leave it blank after the colon (e.g., "account3:").

prefix="$(dirname "$0")"
cd "$prefix" || exit 1
ext="com"
mode_flag="$1"

echo "Starting automated runs for all accounts..."

if [[ -f "./secret.cfg" ]]; then
    source "./secret.cfg"
else
    echo "Error: $prefix/secret.cfg not found!"
    exit 1
fi

# Loop through each account entry
for entry in "${accounts[@]}"; do
    # Split the string at the colon to get the username and password
    username="${entry%%:*}"
    password="${entry#*:}"

    echo "------------------------------------------------"
    echo "Executing bot for account: $username"

    # Run the main bot script (passes mode_flag such as --sync-only if provided)
    ./troopers.sh "$username" "$password" "" "$mode_flag"

    # 2-second delay between accounts (1s in sync-only mode) to prevent server blocks
    if [[ "$mode_flag" == "--sync-only" ]]; then
        sleep 1
    else
        sleep 2
    fi
done

echo "------------------------------------------------"
echo "All accounts processed successfully!"