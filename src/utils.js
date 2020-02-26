'use strict';

const Path = require('path')
const mkdirp = require('mkdirp')
const logger = require('debug')('utils');

exports.touchDir = async (path) => {
  return new Promise((resolve, reject) => {
    logger('touch dir', path)
    mkdirp(path, (error) => {
      if (error) {
        logger(`failed to mkdirp '${path}':`, error)
        return reject(error)
      }

      logger('touched', path)
      resolve(path)
    })
  })
}

/*
exports.uniqueArray = (arr)=>{
  return arr.filter((v, i, a) => a.indexOf(v) === i)
}
*/

exports.uniqueArray = (arr)=>{
  return arr.filter((v, i, a) => {
    if( v !== undefined && a.indexOf(v) === i){
      return true
    }

    return false
  })
}

exports.parentPaths = (filePath)=>{
  const parents = []
  const parsedPath = Path.parse(filePath)

  let parentPath = parsedPath.dir
  while(parentPath && parentPath != '/'){
    parents.push( parentPath )

    parentPath = parentPath.dir
  }

  return parents
}