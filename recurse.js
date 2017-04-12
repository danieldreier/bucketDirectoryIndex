/**
 * Simple object check.
 * @param item
 * @returns {boolean}
 */
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
function mergeDeep(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}

// convert a string path to a nested object
function path_to_hash(str, metadata) {
  metadata["type"] = "file"

  var output = str.split("/").reverse().reduce(function(memo, item) {
    var obj = {
      metadata: {
        type: "dir"
      }
    }
    obj[item] = memo
    return obj
  }, {metadata: metadata})
  return output
}

// merge to a common hash
function objectListToTree(arr) {
  return arr.map(function(obj) {
    return path_to_hash(obj["path"], obj["metadata"])
  }).reduce(function(memo, obj) {
    var combined = mergeDeep(memo, obj) 
      return combined
  })
}

// render HTML directory index
function renderIndex(prefix, objectList) {
  //console.log("renderIndex called for objects", objectList)
  var Mustache = require('mustache');
  var fs = require('fs');

  function loadTemplate() {
    return fs.readFileSync('templates/index.html').toString();
  }

  fileList = objectList.map(function(file) {

    if ( file.metadata.type == "file" ) {
      file.metadata.lastModified = (new Date(file.metadata.lastModified)).toLocaleDateString('en-US',
        { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric',
          minute: 'numeric', hour12: false});
    } else {
      // directories don't list size or last modified date, and directory names should end with /
      file.metadata.lastModified = "-"
      file.metadata.size = "-"
      file.name = file.name + "/"
    }

    return {
      "path": file.name,
      "size": file.metadata.size,
      "lastModified": file.metadata.lastModified
    }
  }).filter(function(file){
    // exclude zero-length file names to hide data about the current path
    if (file.path.length == 0) {
      return false
    }
    // hide index.html files
    if (file.path == "index.html") {
      return false
    }
    return true
  })

  var files = {
    "files": fileList,
    "prefix": prefix.join("/")
  }

  console.log("rendering index with files", files)

  var htmlDirectoryIndex = Mustache.to_html(loadTemplate(), files);

  return htmlDirectoryIndex;
}

function generateIndexes(tree, path) {
  // generate a list of keys at the current level
  var keys = Object.keys(tree).filter(function(key) {
    return key != "metadata"; // filter out metadata keys
  })

  // get the metadata for each of those keys
  var fileMetaData = keys.map(function(key){
    return {
      name: key,
      metadata: tree[key]["metadata"]
    }
  })

  // generate the directory index
  generateIndex(path, fileMetaData)

  // recurse into each directory
  keys.forEach(function(key,index) {
    if (tree[key]["metadata"]["type"] == "dir") {
      generateIndexes(tree[key], path.concat([key]))
    }
  })
}

function connectToBucket(projectId,bucketName) {
  console.log(`connecting to bucket ${bucketName}`)
  var gcloud = require('google-cloud')({
    projectId: projectId
  });
  var gcs = gcloud.storage({
    projectId: projectId,
    keyFilename: '/Users/daniel/development/learn_node/cloudfunction/puppet-downloads-2ea22018bfb0.json'
  });
  var bucket = gcs.bucket(bucketName)
  return bucket;
}

// return file names, size, and last modified date
function listObjectsAndDirectories(projectId, bucket, callback) {
  console.log("listObjectsAndDirectories called")
  console.log(`listing items in ${bucket.name}`);
  var gcloud = require('google-cloud')({
    projectId: projectId
  });
  bucket.getFiles(function(err, files) {
    if (!err) {
      console.log("bucket.getFiles")
      console.log(`bucket.getFiles returned ${files.length} results`)
      callback(files.map(function(file){
        return {
          "path": file.name,
          "metadata": {
            "lastModified": file.metadata.updated,
            "size": file.metadata.size
          }
        }
      }
  ))
    } else {
      console.error(err)
      process.exit(1);
    }
  } )
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

function generateIndex(path, contents) {
  var directoryIndex = renderIndex(path, contents)
  var bucket = connectToBucket("puppet-downloads", "puppet-download-test")
  saveIndexToBucket("puppet-downloads", bucket, path.join("/"), directoryIndex)
  //  console.log(directoryIndex)
}


var bucket = connectToBucket("puppet-downloads", "puppet-download-test")
listObjectsAndDirectories("puppet-downloads", bucket, function(files) {
  console.log(generateIndexes(objectListToTree(files), []))
})

