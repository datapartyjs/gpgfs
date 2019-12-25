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

  async saveMetadata({meta}){

  }

  async getMetadata(){

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