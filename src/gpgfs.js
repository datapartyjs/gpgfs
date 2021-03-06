const fs = require('fs')
const os = require('os')
const Path = require('path')
const mkdirp = require('mkdirp')
const GpgPromised = require('gpg-promised')
const debug = require('debug')('gpgfs.gpgfs')
const sanitize = require('sanitize-filename')

const FuseMount = require('./fuse-mount')
const GpgFsBucket = require('./bucket')
const Validator = require('./validator')

const IStorage = require('./interface-storage')
const FsStorage = require('./storage/fs')
const GCEStorage = require('./storage/gce-remote')
const SFTPStorage = require('./storage/sftp-remote')

class Gpgfs {

  /**
   * A gpgfs file-system
   * @class
   * @constructor
   * @param {Object} options
   * @param {string} options.path  Path to a `gpgfs` file directory
   * @param {GpgPromised.KeyChain} options.keychain See [`GpgPromised.KeyChain`]{@link https://datapartyjs.github.io/gpg-promised/KeyChain.html}
   */
  constructor({storage=null, keychain=os.homedir()+'/.gnupg'}={}){
    this.storage = storage || new FsStorage()
    this.keychainPath = !keychain ? Path.join(process.cwd(), '.gnupg') : keychain
    this.keychain = new GpgPromised.KeyChain(this.keychainPath)
    this.validator = new Validator()

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
    await this.storage.start()
    await this.keychain.open()
    await this.touchDir('/buckets')
  }


  /** @member {FuseMount}  */
  static get FuseMount () {
    return FuseMount
  }
  
  static get StorageEngine(){
    return {
      FsStorage: FsStorage,
      GCEStorage: GCEStorage,
      SFTPStorage: SFTPStorage
    }
  }

  /** 
   * Load all matching bucket metadata
   * @method
   * @param {Object} options
   * @param {string} options.id Bucket Id filter
   * @param {string} options.name Name filter
   * @returns {Bucket[]} Array of Bucket
   */
  async getBuckets({name, id}={}){
    let ids = await this.getBucketIds()

    let bucketList = []
    for(const bucketId of ids){
      let bucket = this._bucketCache[bucketId]
      if(!bucket){
        bucket = new GpgFsBucket({id:bucketId, root:this})
        await bucket.open()
        this._bucketCache[bucketId] = bucket
      }

      if(!name && !id){
        bucketList.push(bucket)
      }
      else if(bucket.metadata.bucketName == name){
        bucketList.push(bucket)
      }
      else if(bucketId == id){
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


  async fileExists(path){
    return await this.storage.fileExists(path)
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
    if(this.storage.mode!=IStorage.MODE_WRITE){ throw new Error('read only') }

    debug('writeFile -', path, options)
    let content = data

    if(options){

      if(options.model){
        debug('writeFile - using validator model - ', options.model)
        content = await this.validateModel(options.model, content)
      }

      if(options.encrypt){

        debug('writeFile - content typeof', typeof content, content instanceof Buffer)
        
        /*if(content instanceof Buffer){
          content = content
        }*/
        
        if( typeof content !== 'string' && !(content instanceof Buffer)){ content = JSON.stringify(content) }

        
        await this.cacheWhoami()
        content = await this.keychain.encrypt(content, options.to, this.whoami, options.trust)
      }
    }
    
    debug('writeFile -', content.length, path)

    return await this.storage.writeFile(path, content, {mode: 0o600})
  }

  async readFile(path, decrypt=false, model=null, keychain=null, options){

    debug('readFile -', path)
    let content = await this.storage.readFile(path)

    if(decrypt && content && content.length > 0){
      debug('readFile - decrypt')
      if(!keychain){
        content = await this.keychain.decrypt(content, options)
      }
      else{
        debug('readFile - using alternate keychain')
        content = await keychain.decrypt(content, options)
      }

      /** @todo  verify signatures - https://github.com/datapartyjs/gpg-promised/issues/9  */
    }

    if(model && content && content.length > 0){
      debug('readFile - json parse')
      const jsonContent = JSON.parse(content.toString())
      debug('readFile - validate')
      content = await this.validateModel(model, jsonContent)
    }

    return content
  }

  async rmFile(path){
    await this.storage.rmFile(path)
  }

  async getBucketIds(){
    const bucketPaths = (await this.readDir('/buckets'))
    .map(item=>{
      return item.replace('bucket-','')
    })

    debug('found ids', bucketPaths)
    return bucketPaths
  }


  /*pathToBucketRoot({bucketId}){
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
  }*/

  async readDir (path){
    return await this.storage.readDir(path)
  }

  async touchDir (path){
    return await this.storage.touchDir(path)
  }
  

  /** @member {GpgPromised}  */
  static get GPG(){
    return GpgPromised
  }

}

module.exports = Gpgfs
