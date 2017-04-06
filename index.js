/**
 * Background Cloud Function to be triggered by Cloud Storage.
 *
 * @param {object} event The Cloud Functions event.
 * @param {function} The callback function.
 */

require('@google-cloud/debug-agent').start();

exports.generateDirectoryIndex = function generateDirectoryIndex (event, callback) {
  console.log("generateDirectoryIndex called with event", event)
  handleFileChangeEvent(event, callback)
}

// return the logical directory that a given object is in
function prefixFromObjectName(name) {
  console.log("name", name)
  var path = name.split("/");
  path.pop();
  prefix = path.join("/");
  return prefix;
}

function projectId() {
  return "puppet-downloads";
}
function objectNameFromEvent(event) {
  console.log("objectNameFromEvent", event)
  return event.data.name;
}

function bucketNameFromEvent(event) {
  console.log("bucketNameFromEvent", event.data.bucket)
  return event.data.bucket;
}

function connectToBucket(projectId,bucketName) {
  console.log(`connecting to bucket ${bucketName}`)
  var gcloud = require('google-cloud')({
    projectId: projectId
  });
  var gcs = gcloud.storage({
    projectId: projectId,
//    keyFilename: '/Users/daniel/development/learn_node/cloudfunction/puppet-downloads-2ea22018bfb0.json'
  });
  var bucket = gcs.bucket(bucketName)
  return bucket;
}

function filterBucketContents(files, prefix) {
  console.log(`filterBucketContents(files, ${prefix})`)
  return files.filter(function(file) { 
    return true;
     // include directories but not their contents
    if (file.name.endsWith("/") ) {
      return true
    }
    // include files within the immediate folder
    if (file.name.split("/").length == prefix.split("/").length + 1 ) {
      return true
    }   
  }).map(function(file){
    return { "path": file.name,
            "size": file.metadata.size,
            "lastModified": file.metadata.updated
           };
  })
}

// list objects and directories in a given bucket prefix
// return file names, size, and last modified date
function listObjectsAndDirectories(projectId, bucket, prefix, callback) {
  console.log("listObjectsAndDirectories called")
    //  prefix = prefix.length == 0 ? "/" : prefix
  console.log(`listing items in ${bucket.name} under prefix ${prefix}`);
  var gcloud = require('google-cloud')({
    projectId: projectId
  });
  bucket.getFiles({prefix: prefix}, function(err, files) {
    if (!err) {
      console.log("bucket.getFiles")
      console.log(`bucket.getFiles returned ${files.length} results`)
      callback(files.filter(function(file) {
          // prevent directories from being listed within their own directory listing
          if (file.name == prefix + "/") {
            console.log(`listObjectsAndDirectories rejected file name ${file.name} because it's the directory being listed`)
            return false
          }

           // include files within the immediate folder
          if (file.name.split("/").length == prefix.split("/").length + 1 ) {
            console.log(`listObjectsAndDirectories rejected file name ${file.name} because it's not in the prefix folder`)
            return true
          }
 
          // include folders in the listing
          if (file.name.endsWith("/")) {
            console.log(`listObjectsAndDirectories accepted file name ${file.name} because it ends with /`)
            return true
          }
          // include nothing else
          console.log(`listObjectsAndDirectories defaulted to rejecting file name ${file.name}`)
          return false
      })
      )
    } else {
      console.error(err)
      process.exit(1);
    }
  } )
}

// render HTML directory index
function renderIndex(prefix, objectList) {
  console.log("renderIndex called for objects", objectList)
  var Mustache = require('mustache');
  var fs = require('fs');

  function loadTemplate() {
    return fs.readFileSync('templates/index.html').toString();
  }

  fileList = objectList.map(function(file) {
    var shortFileName;

    if (file.name.endsWith("/")) {
      shortFileName = file.name.split("/").slice(-2).join("/")
      file.metadata.size = "- "
      console.log("file ends with /, using file name", shortFileName)
    } else {
      shortFileName = file.name.split("/").pop()
      console.log("file does not end with /, using file name", shortFileName)
    }

    file.metadata.updated = (new Date(file.metadata.updated)).toLocaleDateString('en-US', 
      { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', 
        minute: 'numeric', hour12: false});

    return {
      "path": shortFileName,
      "size": file.metadata.size,
      "lastModified": file.metadata.updated
    }
  })

  var files = {
    "files": fileList,
    "prefix": prefix
  }

  var htmlDirectoryIndex = Mustache.to_html(loadTemplate(), files);

  return htmlDirectoryIndex;
}

function saveIndexToBucket(projectId, bucket, prefix, htmlDirectoryIndex) {
  console.log(`saveIndexToBucket called for ${bucket} and prefix ${prefix}`);
  var gcloud = require('google-cloud')({
    projectId: projectId
  });


  // without this workaround we end up creating a new folder called / and then uploading index.html to it
  // because in GCS /index.html != index.html
  var indexFilePath;
  if ( prefix.length == 0 ) {
    indexFilePath = "index.html"
  } else {
    indexFilePath = prefix + "/" + "index.html"
  }

 	var file = bucket.file(indexFilePath)
    var wstream = file.createWriteStream({
      metadata: {
        contentType: "text/html"
      }
      })
			.on('error', function(err) {
        console.error(`error uploading ${indexFilePath} file`);
			})
			.on('finish', function() {
        console.log(`success uploading ${indexFilePath} file to ${bucket.name}`);
			})
	wstream.write(htmlDirectoryIndex);
	wstream.end();
}

function isIndex(objectName) {
  var regex = /index\.html$/;
  return regex.test(objectName);
}

// entry point for cloud function
//function handleFileChangeEvent(event, callback) {
function handleFileChangeEvent(event, callback) {
  // figure out what bucket and objects we're operating on
  var objectName         = objectNameFromEvent(event);
  var prefix             = prefixFromObjectName(objectName);
  var projectId          = "puppet-downloads";
  var bucketName         = bucketNameFromEvent(event);
  var bucket             = connectToBucket(projectId, bucketName);

  // skip execution if the file updated was an index.html, because it was probably
  // created by a previous invocation of this code
  if ( isIndex(objectName) ) {
    callback();
  } else {
    // list objects and directories at the same level as the object
    // in the event we're handling
    listObjectsAndDirectories(projectId, bucket, prefix, function(files){
      console.log("rendering index");
      console.log(`bucket.getFiles returned ${files.length} results`)
      var htmlDirectoryIndex = renderIndex(prefix, files);
      //console.log(htmlDirectoryIndex);
      saveIndexToBucket(projectId, bucket, prefix, htmlDirectoryIndex);
      callback();
    });
  }
}
