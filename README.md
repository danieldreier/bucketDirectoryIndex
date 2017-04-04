# bucketDirectoryIndex
Google Cloud Function to generate apache-style directory indexes of Google Cloud Storage buckets

# How to deploy
Something along the the lines of:

```
gcloud beta functions deploy generateDirectoryIndex --stage-bucket cloudfunctions-experiment --trigger-bucket yum.downloads.puppet.com
```

(You'll need to specify your own stage bucket and trigger bucket, of course)
