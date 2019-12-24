'use strict';

const Path = require('path')
const mkdirp = require('mkdirp')
const logger = require('debug')('utils');

exports.touchDir = async (path) => {
  return new Promise((resolve, reject) => {
    const basedPath = Path.join(this.basePath, path)
    logger('touch dir', basedPath)
    mkdirp(basedPath, (error) => {
      if (error) {
        logger(`failed to mkdirp '${basedPath}':`, error)
        return reject(error)
      }

      logger('touched', basedPath)
      // resolve to adjusted path on success
      resolve(basedPath)
    })
  })
}

