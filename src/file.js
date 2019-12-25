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
      'object-meta/object-' + this.id.toHexString() +'-lastchange'
    )
  }

  async create(){
    if(this.exists()){ throw new Error('file exists') }

    await this.saveMetadata
    /*
      if exists() throw
      this.save() // save an empty file
    */
  }

  async read(){
    //load & decrypt

  }

  async save(content, {meta,empty}){
    /*

      1. encrypt content to file
      2. update meta {md5sum, lastchange.*}
      3. saveMetadata()
      4. 

    */
  }

  async getMetadata(){
    this.metadata = await this.root.readFile( this.metadataPath, true, 'bucket_meta')
    return this.metadata   
  }

  async setMetadata(value){
    const nowTime = (new Date()).toISOString()
    let newMetadata = Object.assign({lastchanged: nowTime}, value)

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
  
  async setLastchange(value){
    const nowTime = (new Date()).toISOString()
    let newLastchange = Object.assign({lastchanged: nowTime}, value)

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