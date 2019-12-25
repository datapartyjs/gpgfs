
const ObjectId = require('bson-objectid')
const debug = require('debug')('gpgfs.Bucket')

class Bucket {
  constructor({id, name, root}){
    this.id = new ObjectId(id)
    this.name = name
    this.root = root

    this.index = null
    this.metadata = null
    debug('new -', name || id)
  }

  async open(){
    await this.getIndex()
    await this.getMetadata()
    this.name = this.metadata.bucketName
    debug('loaded ', this.name)
  }

  exists(){
    return this.root.fileExists( this.path )
  }

  async create(){
    //this.id = new ObjectId()
    debug('create -', this.id)
    this.root.touchDir(this.path)
    this.root.touchDir(this.path + '/objects')
    this.root.touchDir(this.path + '/object-meta')

    const nowTime = (new Date()).toISOString()

    const whoami = (await this.root.keychain.whoami())[0]

    await this.setMetadata({
      owner: whoami,
      bucketId: {
        id: this.id.toHexString(),
        type: 'bucket_meta'
      },
      created: nowTime,
      bucketName: this.name,
      cleartext: false,
      meta: [],
      readers: [],
      writers: []
    })

    await this.setIndex({
      created: nowTime
    })
  }

  async file(name){
    //
    
  }

  async getFiles({directory}){
    //
  }

  get path(){
    return '/buckets/bucket-'+this.id.toHexString()
  }

  async getReciepents(){
    await this.root.cacheWhoami()
    let toList = [ this.root.whoami ]

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

  async getIndex(){
    const indexPath = this.path + '/index'
    this.index = await this.root.readFile( indexPath, true, 'bucket_index')
    return this.index   
  }

  async getMetadata(){
    const metadataPath = this.path + '/metadata'
    this.metadata = await this.root.readFile( metadataPath, true, 'bucket_meta')
    return this.metadata
  }

  async setMetadata(value){
    const nowTime = (new Date()).toISOString()
    let newMetadata = Object.assign({lastchanged: nowTime}, value)

    await this.root.writeFile( this.path + '/metadata',
      newMetadata,
      {
        model: 'bucket_meta',
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


  async setIndex(value){
    const nowTime = (new Date()).toISOString()
    let newIndex = Object.assign({
      lastchanged: nowTime,
      bucketId: {
        id: this.id.toHexString(),
        type: 'bucket_meta'
      }
    }, value)


    await this.root.writeFile( this.path + '/metadata',
      newIndex,
      {
        model: 'bucket_index',
        encrypt: true,
        to: await this.getReciepents()
      }
    )

    if(!this.index){
      debug('creating index')
      this.index = newIndex
    }
    else {
      debug('replacing index')
      this.index = newIndex
    }
  }
}

module.exports = Bucket