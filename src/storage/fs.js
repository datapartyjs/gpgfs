
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

    debug('basePath =', this.basePath, ',  mode =' + this.mode)
  }

  storagePath(path){
    return Path.normalize(
      this.basePath+"/" + Path.dirname(path) + '/'+ sanitize(Path.basename(path))
    )
  }

  get name(){ return 'fs' }

  async fileExists(path){
    const result = fs.existsSync( this.storagePath(path) )

    debug("fileExists: ", result, path)
    return result
  }
  
  async readFile(path){
    return new Promise((resolve,reject)=>{

      const realPath = this.storagePath(path)

      debug("Reading from file: " + realPath)
      fs.readFile(realPath, 'utf8', (err,data)=>{
        if(err){
          return reject(err)
        }

        resolve(data)
      })

    })
  }

  async writeFile(path, data, options){

    if(this.mode!=IStorage.MODE_WRITE){ throw new Error('read only') }

    return new Promise((resolve,reject)=>{

      const realPath = this.storagePath(path)

      debug("Writing file: " + realPath)
      fs.writeFile(realPath, data, options, (err)=>{
        if(err){
          debug('failed to write file - ',path, '\nerror -',err)
          return reject(err)
        }

        debug('wrote file:', path)
        resolve()
      })

    })
  }

  async rmFile(path){ 
    const realPath = this.storagePath(path)
    debug('rmFile -', realPath)
    fs.unlinkSync(realPath)
  }


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
  
        // resolve to adjusted path on success
        resolve(realPath)
      })
    })
  }
}

module.exports = FsStorage