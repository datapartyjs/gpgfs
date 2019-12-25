
const fs = require('fs')
const Path = require('path')
const mkdirp = require('mkdirp')
const GpgPromised = require('gpg-promised')
const debug = require('debug')('gpgfs.gpgfs')
const sanitize = require('sanitize-filename')

const GpgFsBucket = require('./bucket')
const Validator = require('./validator')


class Gpgfs {
  constructor({path=null, keychain=null}={}){
    this.basePath = !path ? Path.join(process.cwd(), '.gpgfs') : path
    this.keychainPath = !keychain ? Path.join(process.cwd(), '.gnupg') : keychain
    this.keychain = new GpgPromised.KeyChain(this.keychainPath)
    this.validator = new Validator()

    this._bucketCache = {}
    this._whoamiCache = null
  }

  get whoami(){
    return this._whoamiCache
  }

  async cacheWhoami(){
    if(!this._whoamiCache){
      this._whoamiCache = (await this.keychain.whoami())[0]
    }
  }

  async open(){
    await this.keychain.open()
    await this.touchDir('/buckets')

    //read bucket meta
  }

  async readBucketMeta(){
    //
  }

  static get Bucket () {
    return GpgFsBucket
  }

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

  /*async getBucket({name, id, path}){
    //
  }*/

  /*async createBucket({name, meta}){
    //
  }*/

  async bucket(name){

    let buckets = await this.getBuckets({name})

    if(buckets.length > 1){
      throw new Error('Ambiguous bucket name [',name,']')
    }

    let bucket = buckets[0]

    if(!bucket){
      //! bucket does not exist yet
      bucket = new Gpgfs.Bucket({name, root: this})
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

    let content = data

    if(options){

      if(options.model){
        debug('writeFile - using validator model - ', options.model)
        content = await this.root.validateModel(options.model ,content)
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
      fs.writeFile(realPath, data, {
        mode: 0o600
      }, (err,data)=>{
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
      content = await this.keychain.decrypt(rawContent)

      /** @todo  verify signatures - https://github.com/datapartyjs/gpg-promised/issues/9  */
    }

    if(model){
      const jsonContent = JSON.parse(content)
      content = await this.validateModel(model, jsonContent)
    }

    return content
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
  

  static get GPG(){
    return GpgPromised
  }

}

module.exports = Gpgfs

/*

/gpgfs/buckets/bucket-${bucketId}/meta
/gpgfs/buckets/bucket-${bucketId}/index
/gpgfs/buckets/bucket-${bucketId}/object-meta/object-${objectId}-meta
/gpgfs/buckets/bucket-${bucketId}/objects/object-${objectId}

*/