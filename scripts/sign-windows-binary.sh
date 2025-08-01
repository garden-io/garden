#!/bin/bash
set -e -o pipefail
# Initialize variables
file_path=""
version=""

# Loop through arguments
# We expect a file path and a release version as arguments
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --version)
            if [[ -n "$2" && "$2" != --* ]]; then
                version="$2"
                shift 2
            else
                echo "Error: --version requires a value." >&2
                exit 1
            fi
            ;;
        --file)
            if [[ -n "$2" && "$2" != --* ]]; then
                file_path="$2"
                shift 2
            else
                echo "Error: --file requires a value." >&2
                exit 1
            fi
            ;;
        *)
            echo "Invalid argument: $1" >&2
            echo "Usage: $0 --file <file-path>"
            exit 1
            ;;
    esac
done

# Ensure both options are provided
if [[ -z "$file_path" || -z "$version" ]]; then
    echo "All --file and --version options must be provided."
    echo "Usage: $0 --file <file-path> --version <version>"
    exit 1
fi

s3_bucket=ib-signing-for-garden # s3 bucket name
file_name=$(basename $file_path) # extract filename from full path
file_folder=$(dirname $file_path) # extract folder from full path

# Rename file based on the version
# We want to make sure the file name is unique before uploading it to the signing bucket, in order to avoid
# downloading an old file with the same name.
if [[ "$version" == "edge-bonsai" ]]; then
  file_name="garden-edge-bonsai-${CIRCLE_SHA1}.exe"
  mv $file_path "$file_folder/$file_name"
else
  file_name="garden-$version.exe"
  mv $file_path "$file_folder/$file_name"
fi

# Upload file to S3
echo Starting upload of $file_path to signing bucket
aws s3 cp $file_folder/$file_name s3://$s3_bucket/

# Check if signed file exists
while true; do
  echo "Checking if file signed/$file_name exists"
  file_present=$(aws s3api head-object --bucket $s3_bucket --key "signed/$file_name" > /dev/null 2>&1; echo $?)

  if [ $file_present == 0 ]; then
    break
  else
    sleep 1
  fi

done

echo "File successfully signed. Downloading signed file."
aws s3 cp s3://$s3_bucket/signed/$file_name $file_folder/

# Rename file back to original name
mv $file_folder/$file_name $file_path

echo "Signed file downloaded to $file_path"
echo "Done"
