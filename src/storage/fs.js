
const fs = require('fs')
const Path = require('path')
const mkdirp = require('mkdirp')
const sanitize = require('sanitize-filename')
const debug = require('debug')('gpgfs.fs-storage')


const IStorage = require('../interface-storage')

class FsStorage extends IStorage {

  /**
   * Local file storage backend
   * @class
   * @constructor
   * @param {Object} options
   * @param {string} options.path  Path to a `.gpgfs` directory
   * @param {boolean} options.readOnly  Storage open mode
   */
  constructor({path=null, readOnly=false}={}){
    super()
    this.basePath = !path ? Path.join(process.cwd(), '.gpgfs') : path
    this.mode = (readOnly == false) ? IStorage.MODE_WRITE : IStorage.MODE_READ
  }

  storagePath(path){
    return Path.normalize(
      this.basePath+"/" + Path.dirname(path) + '/'+ sanitize(Path.basename(path))
    )
  }

  get name(){ return 'fs' }
  
  async readFile(path){ throw new Error('not implemented') }
  async writeFile(path, data){ throw new Error('not implemented') }
  async rmFile(path){ throw new Error('not implemented') }
  async checksumFile(path){ throw new Error('not implemented') }

  async readDir(path){ 
    return new Promise((resolve, reject)=>{

      const realPath = this.storagePath(path)
      fs.readdir(realPath, (err, files)=>{
        if(err){
          return reject(err)
        }

        resolve(files)
      })
    })
  }

  async touchDir(path){ 
    return new Promise((resolve, reject) => {
      const realPath = this.storagePath(path)
      debug('touch dir', realPath)
      mkdirp(realPath, (error) => {
        if (error) {
          debug(`failed to mkdirp '${realPath}':`, error)
          return reject(error)
        }
  
        debug('touched', realPath)
        // resolve to adjusted path on success
        resolve(realPath)
      })
    })
  }
}

module.exports = FsStorage