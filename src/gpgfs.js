
const fs = require('fs')
const Path = require('path')
const mkdirp = require('mkdirp')
const GpgPromised = require('gpg-promised')
const debug = require('debug')('gpgfs.gpgfs')
const sanitize = require('sanitize-filename')

const FuseMount = require('./fuse-mount')
const GpgFsBucket = require('./bucket')
const Validator = require('./validator')


class Gpgfs {

  /**
   * A gpgfs file-system
   * @class
   * @constructor
   * @param {Object} options
   * @param {string} options.path  Path to a `gpgfs` file directory
   * @param {GpgPromised.KeyChain} options.keychain See [`GpgPromised.KeyChain`]{@link https://datapartyjs.github.io/gpg-promised/KeyChain.html}
   */
  constructor({path=null, keychain=null, readOnly=false}={}){
    this.basePath = !path ? Path.join(process.cwd(), '.gpgfs') : path
    this.keychainPath = !keychain ? Path.join(process.cwd(), '.gnupg') : keychain
    this.keychain = new GpgPromised.KeyChain(this.keychainPath)
    this.validator = new Validator()
    this.mode = (readOnly == false) ? Gpgfs.MODE_WRITE : Gpgfs.MODE_READ

    this._bucketCache = {}
    this._whoamiCache = null
  }

  /** @member {string}  */
  get whoami(){
    return this._whoamiCache
  }

  /**
   * Load keychain owner into cache 
   * @method */
  async cacheWhoami(){
    if(!this._whoamiCache){
      this._whoamiCache = (await this.keychain.whoami())[0]
    }
  }

  /**
   * Open file system for read & write operations 
   * @method */
  async open(){
    await this.keychain.open()
    await this.touchDir('/buckets')
  }


  static get MODE_READ(){ return 1 }
  static get MODE_WRITE(){ return 2 }

  /** @member {FuseMount}  */
  static get FuseMount () {
    return FuseMount
  }

  /** 
   * Load all matching bucket metadata
   * @method
   * @param {Object} options
   * @param {string} options.name Name filter
   * @returns {Bucket[]} Array of Bucket
   */
  async getBuckets({name}={}){
    let ids = await this.getBucketIds()

    let bucketList = []
    for(const id of ids){
      let bucket = this._bucketCache[id]
      if(!bucket){
        bucket = new GpgFsBucket({id, root:this})
        await bucket.open()
        this._bucketCache[id] = bucket
      }

      if(!name){
        bucketList.push(bucket)
      }
      else if(bucket.metadata.bucketName == name){
        bucketList.push(bucket)
      }

      
    }

    return bucketList
  }

  /** 
   * Load bucket
   * @method
   * @param {string} name Name of bucket to load
   * @returns {Bucket[]} Matching bucket
   */
  async bucket(name){

    let buckets = await this.getBuckets({name})

    if(buckets.length > 1){
      throw new Error('Ambiguous bucket name [',name,']')
    }

    let bucket = buckets[0]

    if(!bucket){
      //! bucket does not exist yet
      bucket = new GpgFsBucket({name, root: this})
    }

    return bucket
  }


  fileExists(path){
    return fs.existsSync( this.filePath(path) )
  }

  filePath(path){
    return Path.normalize(
      this.basePath+"/" + Path.dirname(path) + '/'+ sanitize(Path.basename(path))
    )
  }

  async validateModel(type, value){
    return await this.validator.validate(type, value)
  }

  async writeFile(path, data, options){
    if(this.mode!=Gpgfs.MODE_WRITE){ throw new Error('read only') }

    debug('writeFile -', path, options)
    let content = data

    if(options){

      if(options.model){
        debug('writeFile - using validator model - ', options.model)
        content = await this.validateModel(options.model, content)
      }

      if(options.encrypt){

        if(typeof content !== 'string'){ content = JSON.stringify(content) }

        await this.cacheWhoami()
        content = await this.keychain.encrypt(content, options.to, this.whoami)
      }
    }

    return new Promise((resolve,reject)=>{

      const realPath = this.filePath(path)

      debug("Writing file: " + realPath)
      fs.writeFile(realPath, content, {
        mode: 0o600
      }, (err)=>{
        if(err){
          debug('failed to write file - ',path, '\nerror -',err)
          return reject(err)
        }

        debug('wrote file:', path)
        resolve()
      })

    })
  }

  async readFile(path, decrypt=false, model){

    let content = await new Promise((resolve,reject)=>{

      const realPath = this.filePath(path)

      debug("Reading from file: " + realPath)
      fs.readFile(realPath, 'utf8', (err,data)=>{
        if(err){
          return reject(err)
        }

        resolve(data)
      })

    })

    if(decrypt){
      debug('readFile - decrypt')
      content = await this.keychain.decrypt(content)

      /** @todo  verify signatures - https://github.com/datapartyjs/gpg-promised/issues/9  */
    }

    if(model){
      debug('readFile - json parse')
      const jsonContent = JSON.parse(content)
      debug('readFile - validate')
      content = await this.validateModel(model, jsonContent)
    }

    return content
  }

  async unlinkFile(path){
    const realPath = this.filePath(path)
    debug('unlinkFile -', realPath)
    fs.unlinkSync(realPath)
  }

  async getBucketIds(){
    const bucketPaths = (await this.readDir('/buckets'))
    .map(item=>{
      return item.replace('bucket-','')
    })

    debug('found ids', bucketPaths)
    return bucketPaths
  }


  pathToBucketRoot({bucketId}){
    return Path.join(this.basePath, 'buckets', `bucket-${bucketId}`)
  }

  pathToBucketMeta({bucketId}){
    return Path.join(pathToBucketRoot(bucketId), 'meta')
  }

  pathToBucketIndex({bucketId}){
    return Path.join(pathToBucketRoot(bucketId), 'index')
  }

  pathToObjectMeta({bucketId, objectId}){
    return Path.join(pathToBucketRoot(bucketId), 'index')
  }

  async readDir (path){
    return new Promise((resolve, reject)=>{

      const realPath = this.filePath(path)
      fs.readdir(realPath, (err, files)=>{
        if(err){
          return reject(err)
        }

        resolve(files)
      })
    })
  }

  async touchDir (path){
    return new Promise((resolve, reject) => {
      const basedPath = Path.join(this.basePath, path)
      debug('touch dir', basedPath)
      mkdirp(basedPath, (error) => {
        if (error) {
          debug(`failed to mkdirp '${basedPath}':`, error)
          return reject(error)
        }
  
        debug('touched', basedPath)
        // resolve to adjusted path on success
        resolve(basedPath)
      })
    })
  }
  

  /** @member {GpgPromised}  */
  static get GPG(){
    return GpgPromised
  }

}

module.exports = Gpgfs