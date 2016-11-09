const fs = require('fs');
const Future = require('fluture');
const R = require('ramda');

const S = require('./sanctuary');


// writeFile :: [String] -> String -> Future Error ()
//
// writeFile returns a Future for the result of writing the file at the
// specified path with the given utf-8 string contents. In case of an error the
// rejection value is the relevant filesystem error.
const writeFile = R.curry((name, contents) =>
    Future.node(c => fs.writeFile(R.join('/', name), contents, {encoding: 'utf8'}, c)));


// mkdir :: [String] -> Future error ()
//
// mkdir returns a Future for the result of creating a new directory at the
// specified path. Rejects with an error if one occurs. Note: This function
// will reject with an error if any of the directories in the path already
// exist or an intermediate path component does not exist.
const mkdir = path =>
  Future.node(c => fs.mkdir(R.join('/', path), c));

// createDirectory :: [String] -> Future Error ()
//
// createDirectory returns a Future for the result of creating a new directory
// at the specified path. If the specified directory already exists, this will
// resolve without incident. If intermediate parts of the provided path do not
// exist however, this method *will* fail.
const createDirectory = path => S.pipe([
  mkdir,
  Future.chainRej(err => {
    switch(err.code) {
      case 'EEXIST': return Future.of();
      default:       return Future.reject(err);
    }
  }),
])(path);

// createPath :: [String] -> Future Error ()
//
// createPath returns a Future for the result of creating a new path. Unlike
// createDirectory this function will create any intermediate directories
// without throwing an error.
const createPath = S.pipe([
  R.reject(R.equals('.')),
  R.reduce((allPaths, dir) => R.append(R.append(dir, R.last(allPaths)), allPaths), []),
  R.reduce((future, path) => future.chain(() => createDirectory(path)), Future.of()),
]);

// writeFilePath :: [String] -> String -> Future Error ()
//
// writeFilePath returns a future for the result of writing a file with the
// specified name and utf-8 string contents. Note that if the path provided
// does not exist, it will be created.
const writeFilePath = R.curry((path, contents) => S.pipe([
  R.init,
  createPath,
  R.chain(() => writeFile(path, contents)),
])(path));

module.exports = {
  createPath: createPath,
  writeFilePath: writeFilePath,
};
