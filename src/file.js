const md5 = require('md5')
const Path = require('path')
const crypto = require('crypto')
const Hoek = require('@hapi/hoek')
const ObjectId = require('bson-objectid')
const debug = require('debug')('gpgfs.File')

const Utils = require('./utils')

  /** Class representing gpgfs File */
class File {
  
  /** @hideconstructor */
  constructor({bucket, id, filePath}){
    this.bucket = bucket
    this.id = new ObjectId(id)
    this.filePath = Path.join('/', filePath)

    this.content = ''
    this.metadata = null
    this.lastchange = null
  }

  /**
   * Open and read metadata 
   * @method */
  async open(){
    await this.getMetadata()
    await this.getLastchange()
    this.filePath = this.metadata.path
    debug('loaded ', this.filePath)
  }

  async delete(){
    debug('deleting file', this.filePath)
    await this.bucket.releaseFile(this)
    await this.bucket.unindexFile(this)
    await this.bucket.root.unlinkFile(this.path)
    await this.bucket.root.unlinkFile(this.metadataPath)
    await this.bucket.root.unlinkFile(this.lastchangePath)

    delete this
  }

  async release(){
    debug('releasing', this.bucket.id.toString(), '/', this.id.toString())
    delete this.content
    delete this.metadata
    delete this.lastchange

    this.content = ''
    this.metadata = null
    this.lastchange = null
  }

  /**
   * Check if all metadata and content exists on disk
   * @method
   * @returns {boolean} */
  exists(){
    const contentExists = this.bucket.root.fileExists( this.path )
    const metadataExists = this.bucket.root.fileExists( this.lastchangePath )
    const lastchangeExists = this.bucket.root.fileExists( this.path )

    return contentExists
  }

  get path(){
    return Path.join(
      this.bucket.path,
      'objects/object-' + this.id.toHexString()
    )
  }

  get metadataPath(){
    return Path.join(
      this.bucket.path,
      'object-meta/object-' + this.id.toHexString() +'-meta'
    )
  }

  get lastchangePath(){
    return Path.join(
      this.bucket.path,
      'object-lastchange/object-' + this.id.toHexString() +'-lastchange'
    )
  }

  /**
   * Create file if it does not exist 
   * @method
   * @param {string} [value=''] Content to save in file
   */
  async create(value){
    debug('create -', this.id)
    if(this.exists()){ throw new Error('file exists') }

    await this.setMetadata()
    await this.save(value)
  }

  async getReciepents(){
    await this.bucket.root.cacheWhoami()
    const bucketToList = await this.bucket.getReciepents()
    let toList = [ ...bucketToList ]

    if(this.metadata){

      if(this.metadata.meta && this.metadata.meta.length > 0){
        toList = toList.concat(this.metadata.meta)
      }

      if(this.metadata.readers && this.metadata.readers.length > 0){
        toList = toList.concat(this.metadata.readers)
      }

      if(this.metadata.writers && this.metadata.writers.length > 0){
        toList = toList.concat(this.metadata.writers)
      }

    }

    return Utils.uniqueArray(toList)
  }

  /**
   * Read content from file 
   * @method
   * @returns {string}
   */
  async read(){
    //load & decrypt
    this.content = await this.bucket.root.readFile( this.path, true)
    return this.content
  }

  /**
   * Write content to file. Update metadata and re-index file in bucket index.
   * @method 
   * @param {string} [newContent=this.content]
   */
  async save(newContent=null){

    const contentReaders = Utils.uniqueArray(
      [ this.metadata.owner ].concat(
        this.metadata.readers,
        this.metadata.writers
      )
    )

    if(newContent){
      this.content = newContent
    }

    await this.bucket.root.writeFile( this.path,
      this.content,
      {
        encrypt: true,
        to: contentReaders
      }
    )

    await this.updateLastChange()

    await this.bucket.indexFile(this)
  }

  /**
   * File metadata 
   * @method 
   * @returns {gpgfs_model.object_meta} See [`gpgfs_model.object_meta`]{@link https://github.com/datapartyjs/gpgfs-model/blob/master/src/types/object_meta.js}
   */
  async getMetadata(){
    this.metadata = await this.bucket.root.readFile( this.metadataPath, true, 'object_meta')
    return this.metadata
  }

  async setMetadata(){
    const toList = await this.getReciepents()
    const nowTime = (new Date()).toISOString()
    let newMetadata = Object.assign({lastchanged: nowTime}, {
      owner: this.bucket.metadata.owner,
      path: Path.normalize( this.filePath ),
      bucketId: {
        id: this.bucket.id.toHexString(),
        type: 'bucket_meta'
      },
      objectId: {
        id: this.id.toHexString(),
        type: 'object_meta'
      },
      created: Hoek.reach(this, 'metadata.created') || nowTime,
      cleartext: Hoek.reach(this, 'bucket.metadata.cleartext'),
      meta: Hoek.reach(this, 'bucket.metadata.meta'),
      readers: Hoek.reach(this, 'bucket.metadata.readers'),
      writers: Hoek.reach(this, 'bucket.metadata.writers')
    })

    await this.bucket.root.writeFile( this.metadataPath,
      newMetadata,
      {
        model: 'object_meta',
        encrypt: true,
        to: await this.getReciepents()
      }
    )

    if(!this.metadata){
      debug('creating metadata')
      this.metadata = newMetadata
    }
    else {
      debug('replacing metadata')
      this.metadata = newMetadata
    }
  }

  /**
   * Last change metadata 
   * @method 
   * @returns {gpgfs_model.object_lastchange} See [`gpgfs_model.object_lastchange`]{@link https://github.com/datapartyjs/gpgfs-model/blob/master/src/types/object_lastchange.js}
   */
  async getLastchange(){
    this.lastchange = await this.bucket.root.readFile( this.lastchangePath, true, 'object_lastchange')
    return this.lastchange  
  }
  
  async updateLastChange(){
    const nowTime = (new Date()).toISOString()

    //const md5sum = md5(this.content)
    const hash = {
      sha256: crypto.createHash('sha256').update(this.content).digest('hex')
    }

    await this.bucket.root.cacheWhoami()

    let newLastchange = Object.assign({lastchanged: nowTime}, {
      bucketId: {
        id: this.bucket.id.toHexString(),
        type: 'bucket_meta'
      },
      objectId: {
        id: this.id.toHexString(),
        type: 'object_meta'
      },
      size: this.content.length,
      actor: this.bucket.root.whoami,
      hash
    })

    debug('updateLastChange -', newLastchange)

    await this.bucket.root.writeFile( this.lastchangePath,
      newLastchange,
      {
        model: 'object_lastchange',
        encrypt: true,
        to: await this.getReciepents()
      }
    )

    if(!this.lastchange){
      debug('creating lastchange')
      this.lastchange = newLastchange
    }
    else {
      debug('replacing lastchange')
      this.lastchange = newLastchange
    }

  }

  async assertIsTrusted(){}

  async assertIsMetaTrusted(){
    /*
      - is the verification signer an owner?
      - is the verficiation signer a writer?
    */
  }
}

module.exports = File