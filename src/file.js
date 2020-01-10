const md5 = require('md5')
const ObjectId = require('bson-objectid')
const debug = require('debug')('gpgfs.File')

class File {
  constructor(bucket, id, objectPath){
    this.bucket = bucket
    this.id = new ObjectId(id)
    this.objectPath = objectPath

    this.content = null
    this.metadata = null
    this.lastchange = null
  }

  async open(){
    await this.getMetadata()
    await this.getLastchange()
    this.objectPath = this.metadata.path
    debug('loaded ', this.objectPath)
  }

  exists(){
    const contentExists = this.root.fileExists( this.path )
    const metadataExists = this.root.fileExists( this.lastchangePath )
    const lastchangeExists = this.root.fileExists( this.path )

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

  async create(){
    if(this.exists()){ throw new Error('file exists') }

    
    /*
      if exists() throw
      this.save() // save an empty file
    */
  }

  async getReciepents(){
    await this.bucket.root.cacheWhoami()
    const bucketToList = await this.bucket.getReciepents()
    let toList = [ this.bucket.root.whoami ]

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

    return toList
  }

  async read(){
    //load & decrypt
    this.content = await this.root.readFile( this.path, true)
    return this.content
  }

  async save(content){
    /*

      1. encrypt content to file
      2. update meta {md5sum, lastchange.*}
      3. saveMetadata()
      4. 

    */

    if(content){
      this.content = content
    }

    await this.setLastchange()
  }

  async getMetadata(){
    this.metadata = await this.root.readFile( this.metadataPath, true, 'object_meta')

    this.objectId = this.metadata.
    return this.metadata
  }

  async setMetadata(){
    const nowTime = (new Date()).toISOString()
    let newMetadata = Object.assign({lastchanged: nowTime}, {
      owner: this.bucket.metadata.owner,
      bucketId: {
        id: this.bucket.id.toHexString(),
        type: 'bucket_meta'
      },
      objectId: {
        id: this.id.toHexString(),
        type: 'object_meta'
      },
      created: this.metadata.created || nowTime,
      created: this.metadata.created || nowTime,
      cleartext: this.bucket.metadata.cleartext,
      meta: this.bucket.metadata.meta,
      readers: this.bucket.metadata.readers,
      writers: this.bucket.metadata.writers
    })

    await this.root.writeFile( this.metadataPath,
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

  async getLastchange(){
    this.lastchange = await this.root.readFile( this.lastchangePath, true, 'object_lastchange')
    return this.lastchange  
  }
  
  async setLastchange(){
    const nowTime = (new Date()).toISOString()

    const md5sum = md5(this.content)

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
      md5sum
    })

    debug('setLastchange -', newLastchange)

    await this.root.writeFile( this.lastchangePath,
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