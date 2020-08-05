# Secrets

Files in this directory are created using the `scripts/encrypt-file.ts` helper, and can only be decrypted using a Google Cloud KMS key, which is made available to Garden team developers.

We don't store particularly sensitive data here, i.e. nothing that exposes sensitive data or systems, but regardless we want to keep these secure. These files are generally only used for testing purposes.
