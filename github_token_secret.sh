#!/bin/bash

# Enable exit on error
set -e

# Function to log errors
log_error() {
    echo "ERROR: $1" >&2
}

# Load environment variables from .env file
if [ -f .env ]; then
    echo "Loading .env file..."
    export $(grep -v '^#' .env | xargs)
else
    log_error ".env file not found"
    exit 1
fi

# Check if GITHUB_TOKEN_SECRET is set
if [ -z "$GITHUB_TOKEN_SECRET" ]; then
    log_error "GITHUB_TOKEN_SECRET is not set in the .env file"
    exit 1
fi

# Set default values for GITHUB_TOKEN_SECRET_NAME and AWS_REGION
GITHUB_TOKEN_SECRET_NAME=${GITHUB_TOKEN_SECRET_NAME:-"/github_insights/github_token"}
AWS_REGION=${AWS_REGION:-"us-east-1"}

echo "Using GITHUB_TOKEN_SECRET_NAME: $GITHUB_TOKEN_SECRET_NAME"
echo "Using AWS_REGION: $AWS_REGION"

# Function to create or update the secret
create_or_update_secret() {
    if aws secretsmanager describe-secret --secret-id "$GITHUB_TOKEN_SECRET_NAME" --region "$AWS_REGION" &> /dev/null; then
        echo "Secret exists. Updating..."
        if OUTPUT=$(aws secretsmanager update-secret \
            --secret-id "$GITHUB_TOKEN_SECRET_NAME" \
            --secret-string "{\"GITHUB_TOKEN\":\"$GITHUB_TOKEN_SECRET\"}" \
            --region "$AWS_REGION" 2>&1); then
            echo "Secret updated successfully"
        else
            log_error "Failed to update secret. AWS CLI returned the following error:"
            echo "$OUTPUT"
            return 1
        fi
    else
        echo "Secret does not exist. Creating..."
        if OUTPUT=$(aws secretsmanager create-secret \
            --name "$GITHUB_TOKEN_SECRET_NAME" \
            --description "GitHub token for code review" \
            --secret-string "{\"GITHUB_TOKEN\":\"$GITHUB_TOKEN_SECRET\"}" \
            --region "$AWS_REGION" 2>&1); then
            echo "Secret created successfully"
        else
            log_error "Failed to create secret. AWS CLI returned the following error:"
            echo "$OUTPUT"
            return 1
        fi
    fi
}

# Call the function to create or update the secret
create_or_update_secret