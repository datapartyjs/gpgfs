 

const Path = require('path')
const sanitize = require('sanitize-filename')
const debug = require('debug')('gpgfs.gce-storage')


const CloudStorage = require('@google-cloud/storage').Storage
const IStorage = require('../interface-storage')

class GCEStorage extends IStorage {

  /**
   * GCE storage backend. Accepts all options from GCE Storage library See [https://googleapis.dev/nodejs/storage/latest/global.html#StorageOptions](`@google-cloud/storage.StorageOptions`)
   * @class
   * @constructor
   * @param {Object} options 
   * @param {string} options.bucketName             Name of GCE Storage bucket
   * @param {string} options.location             GCE storage location
   * @param {string} options.storageClass         GCE storage class
   * @param {string} options.projectId
   * @param {string} options.keyFilename
   * @param {string} options.email
   * @param {string} options.credentials
   * @param {string} options.autoRetry
   * @param {string} options.maxRetries
   * @param {boolean} options.readOnly          Storage open mode
   */
  constructor({bucketName='gpgfs', path='/', location='us-central1', storageClass='standard', readOnly=false, ...gceOptions}={}){
    super({readOnly})

    this.location = location
    this.bucketName = bucketName
    this.storageClass = storageClass
    this.storage = new CloudStorage(gceOptions)
    this.bucket = null
  
    this.basePath = path || '/'
  }

  async start(){
    debug('starting')
    
    const serviceAccount = await this.storage.getServiceAccount()
    
    this.bucket = await this.touchBucket()
    
    debug('started', serviceAccount,
          '{ bucket:',this.bucketName,
          'location:',this.location,'}')
  }
  
  async stop(){
    delete this.bucket
    this.bucket = null
    
    debug('stopped', serviceAccount,
          '{ bucket:',this.bucketName,
          'location:',this.location,'}')
  }

  async touchBucket(){
    const bucket = this.storage.bucket(this.bucketName)
    const exists = (await bucket.exists())[0]

    debug('found bucket', this.bucketName)

    if(!exists){
      debug('creating bucket -', this.bucketName)

      await this.storage.createBucket(this.bucketName, {
        location: this.location,
        storageClass: this.storageClass
      })

      return this.storage.bucket(this.bucketName)
    }
    
    return bucket
  }
  
  storagePath(path){
    return Path.normalize(
      this.basePath+"/" + Path.dirname(path) + '/'+ sanitize(Path.basename(path))
    )
  }

  get name(){ return 'gce' }

  async fileExists(path){
    this.assertEnabled()
    const file = this.bucket.file( this.storagePath(path) )
    const result = await file.exists()
    const existance = result[0]

    debug("fileExists: ", existance, path)
    return existance
  }
  
  async readFile(path){
    this.assertEnabled()
    
    const realPath = this.storagePath(path)
    debug("Reading from file: " + realPath)
    const file = this.bucket.file( realPath )
    const downloadResult = await file.download()
    const content = downloadResult[0]
    
    return content
  }

  async writeFile(path, data, options){
    this.assertEnabled()
    if(this.mode!=IStorage.MODE_WRITE){ throw new Error('read only') }
    
    const realPath = this.storagePath(path)
    debug("Writing file: " + realPath)
    const file = this.bucket.file( realPath )
    await file.save(data)
    debug('wrote file:', path)
  }

  async rmFile(path){ 
    this.assertEnabled()
    const realPath = this.storagePath(path)
    debug('rmFile -', realPath)
    
    const file = this.bucket.file( realPath )
    await file.delete()
  }

  async readDir(path, options){
    this.assertEnabled()
    
    const realPath = this.storagePath(path)
    const files = (await this.bucket.getFiles({
      ...options,
      delimiter: '/',
      prefix: realPath
    }))[0]
    
    
    return files.map(file => file.name)
  }

  async dirExists(path){
    const files = await this.readDir(path, {maxResults: 1})

    return (files.length > 0)
  }
  
  
  async touchDir(path){
    this.assertEnabled()
    
    const realPath = this.storagePath(path)
    debug('touch dir', realPath)
    const existance = await this.dirExists(realPath)
    
    if(!existance){
      debug('creating dir place holder', realPath)
      await this.writeFile(path+'/.touch', '1')
    }
    
    
  }
}

module.exports = GCEStorage
