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

# Check if STACK_NAME is set
if [ -z "$STACK_NAME" ]; then
    log_error "STACK_NAME is not set in the .env file"
    exit 1
fi

# Set default values for AWS_REGION and REPO_LIST_FILE
AWS_REGION=${AWS_REGION:-"us-east-1"}
REPO_LIST_FILE=${REPO_LIST_FILE:-"repositories.json"}

echo "Using AWS_REGION: $AWS_REGION"
echo "Using REPO_LIST_FILE: $REPO_LIST_FILE"

# Function to get S3 bucket name from CloudFormation stack output
get_s3_bucket_name() {
    if OUTPUT=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query "Stacks[0].Outputs[?OutputKey=='InsightsBucketName'].OutputValue" --output text 2>&1); then
        echo "$OUTPUT"
    else
        log_error "Failed to get S3 bucket name. AWS CLI returned the following error:"
        echo "$OUTPUT"
        return 1
    fi
}

# Function to upload repository list to S3
upload_repo_list() {
    local bucket_name="$1"
    if [ ! -f "$REPO_LIST_FILE" ]; then
        log_error "Repository list file $REPO_LIST_FILE not found"
        return 1
    fi

    if OUTPUT=$(aws s3 cp "$REPO_LIST_FILE" "s3://$bucket_name/repositories.json" --region "$AWS_REGION" 2>&1); then
        echo "Repository list uploaded successfully to s3://$bucket_name/repositories.json"
    else
        log_error "Failed to upload repository list. AWS CLI returned the following error:"
        echo "$OUTPUT"
        return 1
    fi
}

# Main execution
echo "Getting S3 bucket name from CloudFormation stack..."
S3_BUCKET_NAME=$(get_s3_bucket_name)

if [ -z "$S3_BUCKET_NAME" ]; then
    log_error "Failed to get S3 bucket name"
    exit 1
fi

echo "S3 bucket name: $S3_BUCKET_NAME"

echo "Uploading repository list to S3..."
upload_repo_list "$S3_BUCKET_NAME"